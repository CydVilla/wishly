# Wishly

Wishly is a Giftful-inspired wishlist app built with HTML, CSS, and JavaScript. It runs on GitHub Pages with no build step.

- Make wishlists for different occasions, add gifts or ideas, and track prices, categories, and gift notes.
- Mark top wishes, search and sort lists, and switch between grid and list views.
- Share a snapshot link that works across devices. Guests can browse it, see gift notes, and open store links.
- Enable live sharing to let guests claim and release gifts without an account. Wishly keeps claim status out of the owner workspace.

## Run locally

```sh
python3 -m http.server 8080
```

Open [http://localhost:8080](http://localhost:8080). Wishly starts with editable sample wishlists. The sample product photos are illustrative and the sample prices are example values.

## Publish on GitHub Pages

From this folder, initialize Git and push to the empty [CydVilla/wishly repository](https://github.com/CydVilla/wishly).

```sh
git init -b main
git add .
git commit -m "Build Wishly"
git remote add origin https://github.com/CydVilla/wishly.git
git push -u origin main
```

Open [Settings → Pages](https://github.com/CydVilla/wishly/settings/pages). Set **Source** to **Deploy from a branch**, select **main** and **/ (root)**, and save. Open [cydvilla.github.io/wishly/](https://cydvilla.github.io/wishly/) once GitHub finishes publishing.

Asset paths are relative to the app, and guest links use URL fragments, so the app also works at a project subpath. Create share links from the deployed site so recipients can reach the link.

## Optional live gift claims

1. Create a [Supabase](https://supabase.com/) project and run [supabase/schema.sql](supabase/schema.sql) in its SQL Editor.
2. In [config.js](config.js), fill in the project URL and its **publishable** key from the project’s Connect dialog. Keep secret and service-role keys out of the repo.
3. Push the configuration. In Wishly, open **Share list → Publish live link**.
4. After editing a published list, choose **Share list → Update live link**. The URL stays the same and existing claims survive for wishes still on the list.

The owner workspace is browser-local. Use the workspace menu to download a backup and restore it on another browser. A backup for a published list contains its management key, so keep the file private. Guest claim controls also depend on the browser that made the claim. Claims use anonymous tokens, and the API returns gift availability without claimant identities. Anyone with the live link can view the list and its availability.

Snapshot links contain a point-in-time copy in the URL. Changes require a fresh link, snapshots do not support reservations, and previously shared snapshots remain readable. Live links can be disabled from the wishlist options menu.

Product links prefill the store from the domain. Enter the title, price, and optional image manually.
