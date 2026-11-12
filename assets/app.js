import { icon } from "./icons.js";
import {
  categories, occasions, themes, uid, safeUrl, storeName, normalizeItem, normalizeList,
  loadWorkspace, saveWorkspace, readBackup, snapshotLink, readSnapshot, liveLink,
  loadClaimTokens, saveClaimTokens,
} from "./data.js";
import { liveEnabled, publishList, getLiveList, toggleClaim, unpublishList } from "./live.js";

const app = document.querySelector("#app");
const header = document.querySelector("#header-actions");
const dialog = document.querySelector("#dialog");
const toast = document.querySelector("#toast");
const importFile = document.querySelector("#import-file");
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const busyLists = new WeakSet();

let workspace = loadWorkspace();
let guest = null;
let routeVersion = 0;
let toastTimer;
let filter = { query: "", category: "", sort: "recent", favorites: false, budget: "" };

const escape = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char]));

const currentList = () => workspace.lists.find((list) => list.id === workspace.activeId) || workspace.lists[0];
const itemCount = (count) => `${count} ${count === 1 ? "wish" : "wishes"}`;
const idAttr = (id) => `data-id="${escape(id)}"`;

function button(label, symbol, action, options = {}) {
  const { className = "button secondary", id, title, disabled, pressed } = options;
  return `<button type="button" class="${className}" data-action="${action}"
    ${id === undefined ? "" : idAttr(id)} ${disabled ? "disabled" : ""}
    ${title ? `aria-label="${escape(title)}" title="${escape(title)}"` : ""}
    ${pressed === undefined ? "" : `aria-pressed="${pressed}"`}>
    ${symbol ? icon(symbol, className.includes("icon-button") ? 18 : 17) : ""}
    ${label ? `<span>${escape(label)}</span>` : ""}
  </button>`;
}

function announce(message) {
  toast.innerHTML = `${icon("sparkle", 18)} <span>${escape(message)}</span>`;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 4200);
}

function persist() {
  try {
    saveWorkspace(workspace);
  } catch {
    announce("This browser couldn’t save your changes. Download a backup to keep them.");
    return false;
  }
  return true;
}

function changeList(list, changes) {
  Object.assign(list, changes);
  if (list.live) list.live.dirty = true;
  return persist();
}

function resetFilter() {
  filter = { query: "", category: "", sort: "recent", favorites: false, budget: "" };
}

function option(value, label, selected) {
  return `<option value="${escape(value)}"${value === selected ? " selected" : ""}>${escape(label)}</option>`;
}

function select(label, field, options, selected) {
  return `<label class="select-wrap" aria-label="${label}"><select data-filter="${field}" aria-label="${label}">
    ${options.map(([value, title]) => option(value, title, selected)).join("")}
  </select>${icon("down", 15)}</label>`;
}

function dropdown(label, symbol, actions, extraClass = "") {
  return `<details class="dropdown ${extraClass}">
    <summary class="icon-button" aria-label="${escape(label)}" title="${escape(label)}">${icon(symbol, 19)}</summary>
    <div class="dropdown-panel">${actions.join("")}</div>
  </details>`;
}

function menuItem(label, symbol, action, id, danger = false) {
  return button(label, symbol, action, { id, className: `menu-item${danger ? " danger" : ""}` });
}

function listBadge(list) {
  return `<span class="list-badge theme-${list.theme}">${icon(themes[list.theme].icon, 19)}</span>`;
}

function illustration() {
  return `<div class="hero-art" aria-hidden="true">
    <span class="hero-orbit orbit-one"></span><span class="hero-orbit orbit-two"></span>
    <span class="hero-sparkle sparkle-one">${icon("sparkle", 35)}</span>
    <span class="hero-sparkle sparkle-two">${icon("sparkle", 22)}</span>
    <span class="hero-sparkle sparkle-three">${icon("sparkle", 18)}</span>
    <i class="confetti confetti-one"></i><i class="confetti confetti-two"></i><i class="confetti confetti-three"></i>
    <div class="gift-shadow"></div>
    <div class="gift-art"><div class="gift-box"></div><div class="gift-lid"></div><div class="gift-ribbon"></div><div class="gift-bow"><i></i><i></i></div></div>
  </div>`;
}

function hero(list, isGuest = false) {
  const heading = isGuest ? "h1" : "h2";
  const actions = isGuest ? "" : `<div class="hero-actions">
    ${button("Share list", "share", "share", { className: "button hero-button" })}
    ${dropdown("Wishlist options", "more", [
      menuItem("Edit wishlist", "edit", "edit-list"),
      menuItem("Preview as a guest", "eye", "preview"),
      ...(list.live && liveEnabled ? [menuItem("Turn off live sharing", "lock", "unpublish")] : []),
      menuItem("Delete wishlist", "trash", "delete-list", undefined, true),
    ], "hero-menu")}
  </div>`;
  return `<section class="hero theme-${list.theme}">
    ${illustration()}
    <div class="hero-content">
      <div class="hero-type">${icon(themes[list.theme].icon, 16)} ${escape(list.occasion)} wishlist</div>
      <${heading}>${escape(list.name)}</${heading}>
      ${list.description ? `<p>${escape(list.description)}</p>` : ""}
      <span class="hero-count">${icon("gift", 15)} ${itemCount(list.items.length)}</span>
    </div>
    ${actions}
  </section>`;
}

function listNavigation(list) {
  return `<aside class="sidebar">
    <div class="sidebar-title"><h2>Your lists</h2>${button("", "plus", "new-list", { className: "icon-button", title: "New wishlist" })}</div>
    <nav class="list-nav" aria-label="Your wishlists">
      ${workspace.lists.map((entry) => `<button type="button" class="list-link${entry.id === list?.id ? " active" : ""}" data-action="switch-list"
        ${idAttr(entry.id)}${entry.id === list?.id ? ' aria-current="true"' : ""}>
        ${listBadge(entry)}
        <span class="list-label"><strong>${escape(entry.name)}</strong><small>${itemCount(entry.items.length)}</small></span>
        ${icon("chevron", 15)}
      </button>`).join("")}
    </nav>
    <button type="button" class="sidebar-add" data-action="new-list">${icon("plus", 17)} Create a wishlist</button>
    <div class="sidebar-tip"><span class="tip-icon">${icon(liveEnabled ? "sparkle" : "lock", 18)}</span><div>
      <strong>${liveEnabled ? "Keep the surprise" : "Saved in this browser"}</strong>
      <p>${liveEnabled ? "Gift claims stay hidden in your wishlist workspace." : "Download a backup to move your lists to another device."}</p>
    </div></div>
  </aside>`;
}

function ownerHeader() {
  header.innerHTML = `${dropdown("Workspace options", "sliders", [
      menuItem("Download backup", "download", "export"),
      menuItem("Restore backup", "upload", "import"),
    ], "workspace-menu")}`;
}

function toolbar(list, isGuest) {
  const groups = [...new Set(list.items.map((item) => item.category))].sort();
  return `<div class="toolbar">
    <label class="search">${icon("search", 18)}<input type="search" data-filter="query" aria-label="Search wishes" placeholder="Search wishes…" value="${escape(filter.query)}"></label>
    ${select("Category", "category", [["", "All categories"], ...groups.map((category) => [category, category])], filter.category)}
    ${isGuest ? select("Budget", "budget", [["", "Any price"], ["25", "Under $25"], ["50", "Under $50"], ["100", "Under $100"]], filter.budget) : ""}
    ${select("Sort wishes", "sort", [["recent", "Recently added"], ["favorites", "Top wishes first"], ["low", "Price: low to high"], ["high", "Price: high to low"], ["name", "Name: A–Z"]], filter.sort)}
    <div class="toolbar-end">
      ${!isGuest ? button("", "star", "favorites", { className: `icon-button favorite-filter${filter.favorites ? " selected" : ""}`, title: "Show only top wishes", pressed: filter.favorites }) : ""}
      <div class="segmented" aria-label="Wish layout">
        ${button("", "grid", "grid", { className: "icon-button", title: "Grid view", pressed: workspace.layout === "grid" })}
        ${button("", "list", "rows", { className: "icon-button", title: "List view", pressed: workspace.layout === "rows" })}
      </div>
    </div>
  </div>`;
}

function filteredItems(list) {
  const query = filter.query.trim().toLowerCase();
  const items = list.items.filter((item) =>
    (!query || [item.title, item.store, item.category, item.notes].some((field) => field.toLowerCase().includes(query))) &&
    (!filter.category || item.category === filter.category) &&
    (!filter.favorites || item.favorite) &&
    (!filter.budget || (item.price !== null && item.price < Number(filter.budget)))
  );
  const byRecent = (a, b) => b.createdAt - a.createdAt;
  const sorters = {
    recent: byRecent,
    favorites: (a, b) => Number(b.favorite) - Number(a.favorite) || byRecent(a, b),
    low: (a, b) => (a.price ?? Infinity) - (b.price ?? Infinity) || byRecent(a, b),
    high: (a, b) => (b.price ?? -Infinity) - (a.price ?? -Infinity) || byRecent(a, b),
    name: (a, b) => a.title.localeCompare(b.title),
  };
  return items.sort(sorters[filter.sort] || byRecent);
}

const categoryIcons = { Tech: "sparkle", Home: "home", Books: "list", Style: "heart", Wellness: "sparkle", Experiences: "star", Other: "gift" };

function itemImage(item) {
  return `<span class="image-placeholder category-${item.category.toLowerCase()}">${icon(categoryIcons[item.category], 36)}</span>
    ${item.image ? `<img src="${escape(item.image)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ""}`;
}

function renderCard(item, isGuest) {
  const claimed = isGuest && guest.claimed.has(item.id);
  const mine = claimed && Object.hasOwn(guest.tokens, item.id);
  const url = safeUrl(item.url);
  const actions = isGuest ? `<div class="card-actions">
    ${url ? `<a class="button secondary" href="${escape(url)}" target="_blank" rel="noopener noreferrer">Visit store ${icon("external", 15)}</a>` : ""}
    ${guest.mode === "live" ? button(mine ? "Release" : claimed ? "Claimed" : "Claim gift", mine ? "x" : claimed ? "check" : "gift", "claim", {
      id: item.id, className: mine || claimed ? "button secondary" : "button primary", disabled: claimed && !mine,
    }) : ""}
  </div>` : "";
  return `<article class="wish-card">
    <div class="card-media">
      <button class="media-button" type="button" data-action="details" ${idAttr(item.id)} aria-label="${escape(`View ${item.title}`)}">${itemImage(item)}</button>
      ${!isGuest ? button("", "star", "favorite", { id: item.id, className: `icon-button favorite-toggle${item.favorite ? " is-favorite" : ""}`, title: item.favorite ? "Remove from top wishes" : "Mark as a top wish", pressed: item.favorite }) : ""}
      ${isGuest && item.favorite ? `<span class="top-badge">${icon("star", 13)} Top wish</span>` : ""}
    </div>
    <div class="card-content">
      <div class="card-topline">
        <span class="card-category">${escape(item.category)}</span>
        ${!isGuest ? dropdown(`Options for ${item.title}`, "more", [
          menuItem("Edit wish", "edit", "edit-wish", item.id),
          menuItem("Delete wish", "trash", "delete-wish", item.id, true),
        ], "card-menu") : ""}
      </div>
      <button type="button" class="card-title" data-action="details" ${idAttr(item.id)}>${escape(item.title)}</button>
      <div class="card-meta">
        <span class="card-price">${item.price === null ? "Price varies" : money.format(item.price)}</span>
        ${item.store ? `<span class="meta-dot"></span><span class="card-store">${escape(item.store)}</span>` : ""}
      </div>
      ${isGuest && item.notes ? `<p class="card-note">${escape(item.notes)}</p>` : ""}
      ${actions}
    </div>
  </article>`;
}

function empty(symbol, title, text, action = "") {
  return `<div class="empty"><span class="empty-icon">${icon(symbol, 26)}</span><h3>${title}</h3><p>${text}</p>${action}</div>`;
}

function renderResults() {
  const list = guest?.list || currentList();
  const results = document.querySelector("#results");
  if (!results || !list) return;
  const matches = filteredItems(list);
  results.className = `wish-grid${workspace.layout === "rows" ? " is-rows" : ""}`;
  results.innerHTML = matches.map((item) => renderCard(item, Boolean(guest))).join("") || (
    list.items.length
      ? empty("search", "No matching wishes", "Try another search or clear your filters.", button("Clear filters", "x", "clear-filters"))
      : empty("gift", "No wishes yet", guest ? "Check back when more gifts are added." : "Save something you’d love to receive.", guest ? "" : button("Add a wish", "plus", "new-wish", { className: "button primary" }))
  );
  const count = document.querySelector("#result-count");
  if (count) count.textContent = matches.length === list.items.length ? itemCount(matches.length) : `${matches.length} of ${itemCount(list.items.length)}`;
}

function wishes(list, isGuest = false) {
  return `<section class="wishes" aria-labelledby="wishes-title">
    <div class="section-heading">
      <div class="section-title"><h2 id="wishes-title">Wishes</h2><span id="result-count" class="count-label" aria-live="polite"></span></div>
      ${isGuest ? "" : button("Add a wish", "plus", "new-wish", { className: "button primary" })}
    </div>
    ${list.items.length ? toolbar(list, isGuest) : ""}
    <div id="results"></div>
  </section>`;
}

function renderOwner() {
  const list = currentList();
  document.title = "Wishly · My wishlists";
  ownerHeader();
  app.className = "shell";
  app.innerHTML = `<div class="page-heading"><h1>My wishlists</h1>
    ${button("New list", "plus", "new-list", { className: "button primary" })}</div>
    <div class="workspace">
      ${listNavigation(list)}
      <div class="list-main">
        ${list ? hero(list) + wishes(list) : empty("gift", "Make your first wishlist", "Start with a birthday, a holiday, or a few everyday favorites.", button("Create a wishlist", "plus", "new-list", { className: "button primary" }))}
      </div>
    </div>`;
  renderResults();
}

function renderGuest() {
  const { list, mode } = guest;
  document.title = `Wishly · ${list.name}`;
  header.innerHTML = mode === "preview"
    ? button("Back to my wishlists", "x", "end-preview")
    : `<a class="button secondary" href="./">${icon("plus", 17)} <span>Make a wishlist</span></a>`;
  app.className = "shell guest-shell";
  app.innerHTML = `${hero(list, true)}
    <div class="guest-notice">${icon(mode === "preview" ? "eye" : mode === "live" ? "lock" : "link", 18)}
      <span>${mode === "preview" ? "Guest preview. Live links let friends claim gifts." : mode === "live" ? "Claim a gift to let other guests know it’s taken. Claims stay hidden in the owner’s workspace." : "This link shows the wishlist as it was when shared."}</span>
      ${mode === "live" ? button("", "refresh", "refresh", { className: "icon-button", title: "Refresh availability" }) : ""}
    </div>${wishes(list, true)}`;
  renderResults();
}

function renderRouteMessage(title, message) {
  header.innerHTML = `<a class="button secondary" href="./">My wishlists</a>`;
  app.className = "shell guest-shell";
  app.innerHTML = empty("link", title, message, '<a class="button primary" href="./">Go to Wishly</a>');
}

async function openRoute() {
  const version = ++routeVersion;
  const hash = location.hash.slice(1);
  guest = null;
  resetFilter();
  if (!hash) {
    renderOwner();
    return;
  }
  try {
    if (hash.startsWith("list=")) {
      guest = { mode: "snapshot", list: readSnapshot(hash.slice(5)), claimed: new Set(), tokens: {} };
    } else if (hash.startsWith("live=") && /^[0-9a-f-]{36}$/i.test(hash.slice(5))) {
      const id = hash.slice(5);
      if (!liveEnabled) throw new Error("Live sharing is unavailable on this site.");
      renderRouteMessage("Opening wishlist…", "Checking gift availability.");
      const { list, claimed } = await getLiveList(id);
      if (version !== routeVersion) return;
      guest = { mode: "live", id, list, claimed, tokens: loadClaimTokens(id) };
    } else {
      throw new Error("This wishlist link is incomplete or invalid.");
    }
    renderGuest();
  } catch (error) {
    if (version === routeVersion) renderRouteMessage("Wishlist unavailable", escape(error.message || "Check the link and try again."));
  }
}

function showDialog(title, subtitle, body) {
  dialog.innerHTML = `<div class="dialog-heading"><div><h2 id="dialog-title">${escape(title)}</h2>
    ${subtitle ? `<p>${escape(subtitle)}</p>` : ""}</div>
    ${button("", "x", "close", { className: "icon-button", title: "Close dialog" })}</div>${body}`;
  if (!dialog.open) dialog.showModal();
}

function formActions(label) {
  return `<div class="form-actions">${button("Cancel", "", "close")}<button class="button primary" type="submit">${escape(label)}</button></div>`;
}

function listForm(list) {
  showDialog(list ? "Edit wishlist" : "New wishlist", "", `<form data-form="list">
    <label class="field">Wishlist name<input name="name" required autofocus maxlength="70" placeholder="e.g. Birthday wishlist" value="${escape(list?.name)}"></label>
    <label class="field">Description <small>Optional</small><textarea name="description" maxlength="240" rows="2" placeholder="Give friends a little context…">${escape(list?.description)}</textarea></label>
    <label class="field">Occasion<select name="occasion">${occasions.map((value) => option(value, value, list?.occasion || "Personal")).join("")}</select></label>
    <fieldset class="theme-picker"><legend>Cover color</legend><div>${Object.entries(themes).map(([key, theme]) => `<label class="theme-option theme-${key}">
      <input type="radio" name="theme" value="${key}" ${key === (list?.theme || "lavender") ? "checked" : ""}>
      <span>${icon(theme.icon, 20)} ${theme.label}</span>
    </label>`).join("")}</div></fieldset>
    ${formActions(list ? "Save changes" : "Create wishlist")}
  </form>`);
  dialog.querySelector("form").dataset.id = list?.id || "";
}

function wishForm(item) {
  showDialog(item ? "Edit wish" : "Add a wish", "Save a gift from any store, or add an idea of your own.", `<form data-form="wish">
    <label class="field">Product link <small>Optional</small><input name="url" type="url" autofocus maxlength="2048" placeholder="https://…" value="${escape(item?.url)}"></label>
    <label class="field">Wish name<input name="title" required maxlength="100" placeholder="e.g. Ceramic coffee mug" value="${escape(item?.title)}"></label>
    <div class="field-row">
      <label class="field">Store <small>Optional</small><input name="store" maxlength="60" placeholder="Store name" value="${escape(item?.store)}"></label>
      <label class="field">Price (USD) <small>Optional</small><input name="price" type="number" inputmode="decimal" min="0" max="1000000" step="0.01" placeholder="0.00" value="${item?.price ?? ""}"></label>
    </div>
    <div class="field-row">
      <label class="field">Category<select name="category">${categories.map((category) => option(category, category, item?.category || "Other")).join("")}</select></label>
      <label class="field">Image URL <small>Optional</small><input name="image" type="url" maxlength="2048" placeholder="https://…" value="${escape(item?.image)}"></label>
    </div>
    <label class="field">Notes <small>Optional</small><textarea name="notes" rows="2" maxlength="400" placeholder="Size, color, or anything they should know…">${escape(item?.notes)}</textarea></label>
    <label class="check-field"><input type="checkbox" name="favorite" ${item?.favorite ? "checked" : ""}> Mark as a top wish</label>
    ${formActions(item ? "Save changes" : "Add wish")}
  </form>`);
  dialog.querySelector("form").dataset.id = item?.id || "";
}

function details(item) {
  if (!item) return;
  showDialog(item.title, [item.store, item.price === null ? "" : money.format(item.price)].filter(Boolean).join(" · "),
    `<div class="detail-media">${itemImage(item)}</div>
      ${item.notes ? `<p class="detail-notes">${escape(item.notes)}</p>` : ""}
      <div class="form-actions">
      ${guest ? "" : button("Edit wish", "edit", "edit-wish", { id: item.id })}
      ${item.url ? `<a class="button primary" href="${escape(item.url)}" target="_blank" rel="noopener noreferrer">Visit store ${icon("external", 17)}</a>` : ""}
      </div>`);
}

function shareDialog(list, preferSnapshot = false) {
  const isLive = liveEnabled && !preferSnapshot;
  let link = "";
  let linkError = "";
  try {
    link = isLive ? (list.live ? liveLink(list.live.id) : "") : snapshotLink(list);
  } catch (error) {
    linkError = error.message;
  }
  const requiresPublish = isLive && (!list.live || list.live.dirty);
  const label = isLive ? (list.live ? "Update live link" : "Publish live link") : "Copy link";
  showDialog("Share wishlist", isLive
    ? "Guests can reserve gifts without an account. Claims stay hidden in your workspace."
    : "Anyone with this link can view a copy of your wishlist. Send a new link after making changes.",
  `<div class="share-body">
    ${liveEnabled ? `<div class="share-tabs">
      ${button("Live link", "refresh", "share-live", { className: isLive ? "button primary" : "button secondary", pressed: isLive })}
      ${button("Snapshot", "link", "share-snapshot", { className: isLive ? "button secondary" : "button primary", pressed: !isLive })}
    </div>` : ""}
    ${linkError ? `<p class="inline-error">${escape(linkError)}</p>` : ""}
    ${requiresPublish ? `<div class="share-note">${icon("lock", 18)} ${list.live ? "Your workspace has changes. Publish them to update the shared list." : "Publishing makes the list available to anyone with its link."}</div>` : ""}
    ${link && !requiresPublish ? `<label class="field">Wishlist link<input id="share-url" readonly value="${escape(link)}"></label>` : ""}
    <p class="inline-error" id="share-error" role="alert" hidden></p>
    <p class="inline-status" id="share-status" role="status" hidden></p>
    <div class="form-actions">
      ${button("Guest preview", "eye", "preview")}
      ${requiresPublish ? button(label, "share", "publish", { className: "button primary" }) :
        button("Copy link", "copy", "copy", { className: "button primary", disabled: !link })}
    </div>
  </div>`);
}

function confirmDialog(title, description, action, id, label) {
  showDialog(title, description, `<p class="inline-error" id="confirm-error" role="alert" hidden></p>
    <div class="form-actions">${button("Cancel", "", "close")}
    ${button(label, "", action, { className: "button destructive", id })}</div>`);
}

function showError(selector, message) {
  const target = dialog.querySelector(selector);
  if (!target) return;
  target.textContent = message;
  target.hidden = false;
}

async function copyShareLink() {
  const input = dialog.querySelector("#share-url");
  if (!input) return;
  try {
    await navigator.clipboard.writeText(input.value);
    showError("#share-status", "Wishlist link copied.");
  } catch {
    input.focus();
    input.select();
    showError("#share-status", "Select Copy to share the highlighted link.");
  }
}

function exportWorkspace() {
  const blob = new Blob([JSON.stringify(workspace, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = Object.assign(document.createElement("a"), { href: url, download: "wishly-backup.json" });
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  announce("Backup downloaded. Keep it private if you use live links.");
}

async function removeLiveList(list, buttonElement, removeLocal) {
  if (busyLists.has(list)) {
    showError("#confirm-error", "Wait for the live link to finish updating, then try again.");
    return;
  }
  busyLists.add(list);
  buttonElement.disabled = true;
  try {
    if (list.live) {
      if (!liveEnabled) throw new Error("Restore the live sharing configuration before removing this link.");
      await unpublishList(list);
      delete list.live;
    }
    if (removeLocal) workspace.lists = workspace.lists.filter((entry) => entry.id !== list.id);
    const saved = persist();
    dialog.close();
    resetFilter();
    renderOwner();
    if (saved) announce(removeLocal ? "Wishlist deleted." : "Live link turned off.");
  } catch (error) {
    showError("#confirm-error", error.message);
  } finally {
    busyLists.delete(list);
    buttonElement.disabled = false;
  }
}

async function publish(list, trigger) {
  if (busyLists.has(list)) {
    showError("#share-error", "This live link is already updating.");
    return;
  }
  trigger.disabled = true;
  if (!list.live) {
    list.live = { id: uid(), secret: secretToken(), dirty: true };
    if (!persist()) {
      showError("#share-error", "Allow browser storage before publishing a live link.");
      trigger.disabled = false;
      return;
    }
  }
  busyLists.add(list);
  const published = JSON.stringify(normalizeList(list));
  try {
    await publishList(list);
    list.live.dirty = published !== JSON.stringify(normalizeList(list));
    persist();
    if (dialog.open && dialog.querySelector(".share-body") && list === currentList()) shareDialog(list);
    if (!list.live.dirty) showError("#share-status", "Live link ready to share.");
  } catch (error) {
    showError("#share-error", error.message);
  } finally {
    busyLists.delete(list);
    trigger.disabled = false;
  }
}

function secretToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(36));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function claim(item, trigger) {
  const view = guest;
  const take = !view.claimed.has(item.id);
  const token = Object.hasOwn(view.tokens, item.id) ? view.tokens[item.id] : secretToken();
  trigger.disabled = true;
  try {
    if (take) {
      view.tokens[item.id] = token;
      saveClaimTokens(view.id, view.tokens);
    }
    const result = await toggleClaim(view.id, item.id, token, take);
    if (result === "taken") {
      delete view.tokens[item.id];
      saveClaimTokens(view.id, view.tokens);
      view.claimed.add(item.id);
      announce("Someone just claimed this gift.");
    } else if (take) {
      view.claimed.add(item.id);
      announce("Gift claimed. You can release it from this browser.");
    } else {
      delete view.tokens[item.id];
      saveClaimTokens(view.id, view.tokens);
      if (result === "claimed") view.claimed.add(item.id);
      else view.claimed.delete(item.id);
      announce(result === "claimed" ? "Another guest has claimed this gift." : "Your claim was released.");
    }
    if (guest === view) {
      renderResults();
      document.querySelectorAll('[data-action="claim"]').forEach((control) => {
        if (control.dataset.id === item.id && !control.disabled) control.focus();
      });
    }
  } catch (error) {
    announce(error.message || "Couldn’t update this claim. Try again.");
  } finally {
    trigger.disabled = false;
  }
}

function handleFilter(target) {
  filter[target.dataset.filter] = target.value;
  renderResults();
}

document.addEventListener("input", (event) => {
  const { target } = event;
  if (target.matches('[data-filter="query"]')) handleFilter(target);
});

document.addEventListener("change", (event) => {
  const { target } = event;
  if (target.matches("select[data-filter]")) handleFilter(target);
  if (target.matches('form[data-form="wish"] [name="url"]') && !target.form.elements.store.value) {
    target.form.elements.store.value = storeName(target.value).slice(0, 60);
  }
});

dialog.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.target;
  const fields = Object.fromEntries(new FormData(form));
  for (const name of ["name", "title", "url", "image"]) {
    const control = form.elements.namedItem(name);
    if (!control) continue;
    const value = control.value.trim();
    const invalid = name === "name" || name === "title" ? !value : value && !safeUrl(value);
    if (invalid) {
      control.setCustomValidity(name === "name" || name === "title" ? "Enter a name." : "Enter an HTTP or HTTPS link.");
      control.reportValidity();
      control.addEventListener("input", () => control.setCustomValidity(""), { once: true });
      return;
    }
  }
  let saved;
  if (form.dataset.form === "list") {
    const existing = workspace.lists.find((list) => list.id === form.dataset.id);
    if (existing) saved = changeList(existing, normalizeList({ ...existing, ...fields }));
    else {
      const list = normalizeList(fields);
      workspace.lists.unshift(list);
      workspace.activeId = list.id;
      resetFilter();
      saved = persist();
    }
  } else {
    const list = currentList();
    const existing = list.items.find((item) => item.id === form.dataset.id);
    const wish = normalizeItem({ ...existing, ...fields,
      store: fields.store.trim() || storeName(fields.url),
      price: fields.price === "" ? null : Number(fields.price), favorite: fields.favorite === "on",
    });
    const items = existing ? list.items.map((item) => item.id === wish.id ? wish : item) : [wish, ...list.items];
    resetFilter();
    saved = changeList(list, { items });
  }
  dialog.close();
  renderOwner();
  if (saved) announce(form.dataset.id ? "Changes saved." : form.dataset.form === "list" ? "Wishlist created." : "Wish added.");
});

importFile.addEventListener("change", async () => {
  const file = importFile.files[0];
  importFile.value = "";
  if (!file) return;
  try {
    if (file.size > 20_000_000) throw new Error("This backup is too large.");
    const backup = readBackup(await file.text());
    showDialog("Restore backup", "Lists from the backup will be added. Existing lists with the same ID will be replaced.", formActions("Restore backup"));
    const trigger = dialog.querySelector('[type="submit"]');
    trigger.type = "button";
    trigger.addEventListener("click", () => {
      const lists = new Map(workspace.lists.map((list) => [list.id, list]));
      for (const list of backup.lists) lists.set(list.id, list);
      if (lists.size > 40) {
        announce("Restore would exceed the 40-wishlist limit.");
        return;
      }
      workspace = { ...backup, lists: [...lists.values()] };
      const saved = persist();
      dialog.close();
      resetFilter();
      renderOwner();
      if (saved) announce("Backup restored.");
    });
  } catch (error) {
    announce(error instanceof SyntaxError ? "Choose a valid Wishly backup file." : error.message);
  }
});

document.addEventListener("click", async (event) => {
  for (const menu of document.querySelectorAll(".dropdown[open]")) {
    if (!menu.contains(event.target) || event.target.closest("[data-action]")) menu.open = false;
  }
  const trigger = event.target.closest("[data-action]");
  if (!trigger) return;
  const { action, id } = trigger.dataset;
  const list = guest?.list || currentList();
  const item = list?.items.find((entry) => entry.id === id);
  switch (action) {
    case "close": dialog.close(); break;
    case "new-list":
      if (workspace.lists.length < 40) listForm();
      else announce("Your workspace has reached 40 wishlists.");
      break;
    case "edit-list": listForm(list); break;
    case "switch-list":
      workspace.activeId = id;
      persist();
      resetFilter();
      renderOwner();
      [...document.querySelectorAll(".list-link")].find((control) => control.dataset.id === id)?.focus();
      break;
    case "new-wish":
      if (list.items.length < 100) wishForm();
      else announce("This wishlist has reached 100 wishes.");
      break;
    case "edit-wish": if (item) wishForm(item); break;
    case "details": details(item); break;
    case "favorite": {
      if (!item) break;
      const saved = changeList(list, { items: list.items.map((entry) => entry.id === id ? { ...entry, favorite: !entry.favorite } : entry) });
      renderResults();
      [...document.querySelectorAll(".favorite-toggle")].find((control) => control.dataset.id === id)?.focus();
      if (saved) announce(item.favorite ? "Removed from top wishes." : "Marked as a top wish.");
      break;
    }
    case "favorites":
      filter.favorites = !filter.favorites;
      trigger.classList.toggle("selected", filter.favorites);
      trigger.setAttribute("aria-pressed", String(filter.favorites));
      renderResults();
      break;
    case "grid":
    case "rows":
      workspace.layout = action;
      persist();
      trigger.parentElement.querySelectorAll("button").forEach((control) => control.setAttribute("aria-pressed", String(control === trigger)));
      renderResults();
      break;
    case "clear-filters":
      resetFilter();
      if (guest) renderGuest(); else renderOwner();
      document.querySelector('[data-filter="query"]')?.focus();
      break;
    case "delete-wish":
      if (item) confirmDialog("Delete wish?", `“${item.title}” will be removed from this wishlist.`, "confirm-wish", id, "Delete wish");
      break;
    case "confirm-wish":
      if (item) {
        const saved = changeList(list, { items: list.items.filter((entry) => entry.id !== id) });
        if (!list.items.some((entry) => entry.category === filter.category)) filter.category = "";
        dialog.close();
        renderOwner();
        if (saved) announce("Wish deleted.");
      }
      break;
    case "delete-list":
      confirmDialog("Delete wishlist?", `“${list.name}” and its wishes will be deleted.${list.live ? " Its live link will also be turned off." : ""}`, "confirm-list", undefined, "Delete wishlist");
      break;
    case "confirm-list": await removeLiveList(list, trigger, true); break;
    case "share":
    case "share-live": shareDialog(list); break;
    case "share-snapshot": shareDialog(list, true); break;
    case "publish": await publish(list, trigger); break;
    case "unpublish":
      confirmDialog("Turn off live sharing?", "The existing link will stop opening and gift reservations will be cleared.", "confirm-unpublish", undefined, "Turn off");
      break;
    case "confirm-unpublish": await removeLiveList(list, trigger, false); break;
    case "copy": await copyShareLink(); break;
    case "preview":
      if (dialog.open) dialog.close();
      guest = { mode: "preview", list, claimed: new Set(), tokens: {} };
      resetFilter();
      renderGuest();
      app.focus();
      break;
    case "end-preview":
      guest = null;
      resetFilter();
      renderOwner();
      app.focus();
      break;
    case "refresh": {
      const view = guest;
      trigger.disabled = true;
      try {
        const updated = await getLiveList(view.id);
        if (view === guest) {
          Object.assign(view, updated);
          renderGuest();
          document.querySelector('[data-action="refresh"]')?.focus();
          announce("Gift availability updated.");
        }
      } catch (error) {
        announce(error.message);
      } finally {
        trigger.disabled = false;
      }
      break;
    }
    case "claim": if (item) await claim(item, trigger); break;
    case "export": exportWorkspace(); break;
    case "import": importFile.click(); break;
  }
});

document.addEventListener("error", (event) => {
  if (event.target instanceof HTMLImageElement) event.target.hidden = true;
}, true);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    for (const menu of document.querySelectorAll(".dropdown[open]")) {
      menu.open = false;
      menu.querySelector("summary").focus();
    }
  }
});

dialog.addEventListener("click", (event) => {
  if (event.target !== dialog) return;
  const bounds = dialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
});

document.querySelector("[data-icon]").innerHTML = icon("gift", 21);
window.addEventListener("hashchange", openRoute);
openRoute();
