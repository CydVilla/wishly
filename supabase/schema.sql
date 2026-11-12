begin;

create schema if not exists wishly_private;
revoke all on schema wishly_private from public, anon, authenticated;

create table if not exists wishly_private.wishlists (
  id uuid primary key,
  owner_hash bytea not null,
  document jsonb not null
);

create table if not exists wishly_private.claims (
  wishlist_id uuid not null references wishly_private.wishlists(id) on delete cascade,
  wish_id text not null,
  claimant_hash bytea not null,
  primary key (wishlist_id, wish_id)
);

alter table wishly_private.wishlists enable row level security;
alter table wishly_private.claims enable row level security;
revoke all on all tables in schema wishly_private from public, anon, authenticated;

create or replace function public.wishly_publish(list_id uuid, owner_secret text, payload jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  secret_hash bytea;
  written_id uuid;
begin
  if owner_secret is null or owner_secret !~ '^[0-9a-f]{72}$' then
    raise exception 'Wishly: Invalid owner key.';
  end if;
  if list_id is null or payload is null or octet_length(payload::text) > 524288
     or jsonb_typeof(payload->'name') is distinct from 'string'
     or jsonb_typeof(payload->'items') is distinct from 'array' then
    raise exception 'Wishly: This wishlist is invalid or too large.';
  end if;
  if jsonb_array_length(payload->'items') > 100 or exists (
    select 1 from jsonb_array_elements(payload->'items') item
    where jsonb_typeof(item->'id') is distinct from 'string'
       or length(item->>'id') not between 1 and 80
  ) then
    raise exception 'Wishly: This wishlist contains invalid wishes.';
  end if;
  secret_hash := sha256(convert_to(owner_secret, 'UTF8'));
  insert into wishly_private.wishlists as existing (id, owner_hash, document)
  values (list_id, secret_hash, payload)
  on conflict (id) do update set document = excluded.document
  where existing.owner_hash = excluded.owner_hash
  returning id into written_id;
  if written_id is null then
    raise exception 'Wishly: This browser cannot manage that live link.';
  end if;

  delete from wishly_private.claims c
  where c.wishlist_id = list_id and not exists (
    select 1 from jsonb_array_elements(payload->'items') item where item->>'id' = c.wish_id
  );
  return 'published';
end;
$$;

create or replace function public.wishly_read(list_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'list', w.document,
    'claimed', coalesce(
      (select jsonb_agg(c.wish_id) from wishly_private.claims c where c.wishlist_id = w.id),
      '[]'::jsonb
    )
  ) into result
  from wishly_private.wishlists w where w.id = list_id;
  if result is null then
    raise exception 'Wishly: This link is unavailable. Ask the owner for a new one.';
  end if;
  return result;
end;
$$;

create or replace function public.wishly_claim(list_id uuid, item_id text, claim_secret text, claim boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  list_document jsonb;
  secret_hash bytea;
  current_hash bytea;
begin
  if item_id is null or length(item_id) not between 1 and 80 or claim is null
     or claim_secret is null or claim_secret !~ '^[0-9a-f]{72}$' then
    raise exception 'Wishly: Invalid gift claim.';
  end if;
  -- Serialize claims with publication and removal for this wishlist.
  select document into list_document from wishly_private.wishlists where id = list_id for update;
  if list_document is null or not exists (
    select 1 from jsonb_array_elements(list_document->'items') item where item->>'id' = item_id
  ) then
    raise exception 'Wishly: This gift is no longer on the wishlist.';
  end if;

  secret_hash := sha256(convert_to(claim_secret, 'UTF8'));
  select claimant_hash into current_hash from wishly_private.claims
  where wishlist_id = list_id and wish_id = item_id;

  if claim then
    if current_hash is null then
      insert into wishly_private.claims (wishlist_id, wish_id, claimant_hash)
      values (list_id, item_id, secret_hash);
    elsif current_hash <> secret_hash then
      return 'taken';
    end if;
    return 'claimed';
  end if;

  if current_hash = secret_hash then
    delete from wishly_private.claims where wishlist_id = list_id and wish_id = item_id;
    return 'released';
  end if;
  if current_hash is not null then
    return 'claimed';
  end if;
  return 'available';
end;
$$;

create or replace function public.wishly_unpublish(list_id uuid, owner_secret text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_hash bytea;
begin
  if owner_secret is null or owner_secret !~ '^[0-9a-f]{72}$' then
    raise exception 'Wishly: Invalid owner key.';
  end if;
  select owner_hash into existing_hash from wishly_private.wishlists where id = list_id for update;
  if not found then
    return 'off';
  end if;
  if existing_hash <> sha256(convert_to(owner_secret, 'UTF8')) then
    raise exception 'Wishly: This browser cannot manage that live link.';
  end if;
  delete from wishly_private.wishlists where id = list_id;
  return 'off';
end;
$$;

revoke all on function public.wishly_publish(uuid, text, jsonb) from public, authenticated;
revoke all on function public.wishly_read(uuid) from public, authenticated;
revoke all on function public.wishly_claim(uuid, text, text, boolean) from public, authenticated;
revoke all on function public.wishly_unpublish(uuid, text) from public, authenticated;

grant execute on function public.wishly_publish(uuid, text, jsonb) to anon;
grant execute on function public.wishly_read(uuid) to anon;
grant execute on function public.wishly_claim(uuid, text, text, boolean) to anon;
grant execute on function public.wishly_unpublish(uuid, text) to anon;

commit;
