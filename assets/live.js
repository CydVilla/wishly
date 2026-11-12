import { supabaseUrl, supabasePublishableKey } from "../config.js";
import { normalizeList } from "./data.js";

export const liveEnabled = Boolean(supabaseUrl && supabasePublishableKey);

async function rpc(name, body) {
  const unavailable = "Live sharing is unavailable right now. Try again in a moment.";
  let response;
  try {
    response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        apikey: supabasePublishableKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    throw new Error(unavailable);
  }
  const result = await response.json().catch(() => null);
  if (!response.ok || result === null) {
    const message = typeof result?.message === "string" && result.message.startsWith("Wishly: ")
      ? result.message.slice(8)
      : unavailable;
    throw new Error(message);
  }
  return result;
}

export async function publishList(list) {
  return rpc("wishly_publish", {
    list_id: list.live.id,
    owner_secret: list.live.secret,
    payload: normalizeList(list),
  });
}

export async function getLiveList(id) {
  const result = await rpc("wishly_read", { list_id: id });
  return { list: normalizeList(result.list), claimed: new Set(result.claimed) };
}

export async function toggleClaim(id, itemId, token, claim) {
  return rpc("wishly_claim", { list_id: id, item_id: itemId, claim_secret: token, claim });
}

export async function unpublishList(list) {
  return rpc("wishly_unpublish", { list_id: list.live.id, owner_secret: list.live.secret });
}
