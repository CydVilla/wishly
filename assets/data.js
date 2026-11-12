const storeKey = "wishly.workspace.v1";
const claimKey = "wishly.claims.v1";
const appRoot = new URL("../", import.meta.url);

export const themes = {
  lavender: { label: "Lavender", icon: "heart", color: "#ece3fa" },
  peach: { label: "Peach", icon: "cake", color: "#fae7df" },
  sage: { label: "Sage", icon: "tree", color: "#e7eddf" },
  blue: { label: "Blue", icon: "home", color: "#e1ebfa" },
};

export const categories = ["Tech", "Home", "Books", "Style", "Wellness", "Experiences", "Other"];
export const occasions = ["Personal", "Birthday", "Holiday", "Wedding", "Housewarming", "Baby", "Other"];

const photo = (name) => new URL(`./assets/${name}.jpg`, appRoot).href;

const demoItems = [
  { title: "Sony Wireless Headphones", store: "Sony", price: 348, category: "Tech", favorite: true, image: photo("headphones"), url: "https://electronics.sony.com/audio/headphones/headband/p/wh1000xm5-s", notes: "Silver would be lovely." },
  { title: "Handmade Ceramic Mug", store: "Pottery For The Planet", price: 38, category: "Home", image: photo("mug"), url: "https://www.potteryfortheplanet.com/products/the-belly-mug", notes: "Love the green glaze." },
  { title: "Kindle Paperwhite", store: "Amazon", price: 159.99, category: "Books", image: photo("kindle"), url: "https://www.amazon.com/s?k=kindle+paperwhite", notes: "Black, please." },
  { title: "Amber Soy Candle", store: "Bohemian Rêves", price: 28, category: "Home", image: photo("candle"), url: "https://bohemianreves.com/products/soycandle-zodiac-cancer", notes: "" },
  { title: "Classic Canvas Tote", store: "Openhouse", price: 32, category: "Style", image: photo("tote"), url: "https://www.byopenhouse.com/products/signature-canvas-tote", notes: "" },
  { title: "A Matcha Tea Set", store: "Matcha Tea Lovers", price: 48, category: "Wellness", image: photo("matcha"), url: "https://matchatealovers.com/", notes: "A bowl and bamboo whisk would be perfect." },
];

export function uid() {
  return globalThis.crypto.randomUUID();
}

export function safeUrl(value) {
  if (!value || typeof value !== "string") return "";
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : "";
  } catch {
    return "";
  }
}

function string(value, limit) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function normalizeItem(input) {
  const item = record(input);
  return {
    id: string(item.id, 80) || uid(),
    title: string(item.title, 100) || "Untitled wish",
    store: string(item.store, 60),
    url: safeUrl(string(item.url, 2048)),
    image: safeUrl(string(item.image, 2048)),
    price: typeof item.price === "number" && Number.isFinite(item.price) && item.price >= 0 && item.price <= 1000000 ? item.price : null,
    notes: string(item.notes, 400),
    category: categories.includes(item.category) ? item.category : "Other",
    favorite: item.favorite === true,
    createdAt: typeof item.createdAt === "number" && Number.isFinite(item.createdAt) ? item.createdAt : Date.now(),
  };
}

export function normalizeList(input) {
  const list = record(input);
  const items = Array.isArray(list.items) ? list.items.slice(0, 100).map(normalizeItem) : [];
  return {
    id: string(list.id, 80) || uid(),
    name: string(list.name, 70) || "Untitled wishlist",
    description: string(list.description, 240),
    theme: Object.hasOwn(themes, list.theme) ? list.theme : "lavender",
    occasion: occasions.includes(list.occasion) ? list.occasion : "Personal",
    items: [...new Map(items.map((item) => [item.id, item])).values()],
  };
}

function normalizeWorkspace(input) {
  if (input?.version !== 1 || !Array.isArray(input.lists)) throw new Error("Choose a Wishly backup file.");
  const lists = input.lists.slice(0, 40).map((value) => {
    const list = normalizeList(value);
    const live = value?.live;
    if (typeof live?.id === "string" && typeof live.secret === "string" &&
        /^[0-9a-f-]{36}$/i.test(live.id) && /^[0-9a-f-]{72}$/i.test(live.secret)) {
      list.live = { id: live.id, secret: live.secret, dirty: live.dirty !== false };
    }
    return list;
  });
  return {
    version: 1,
    activeId: typeof input.activeId === "string" ? input.activeId : "",
    layout: input.layout === "rows" ? "rows" : "grid",
    lists: [...new Map(lists.map((list) => [list.id, list])).values()],
  };
}

export function loadWorkspace() {
  try {
    const saved = localStorage.getItem(storeKey);
    if (saved) return normalizeWorkspace(JSON.parse(saved));
  } catch {
    // A damaged or unavailable local store falls back to an editable sample.
  }
  const everyday = normalizeList({
    name: "Everyday Favorites",
    description: "Little things I’ve been eyeing, from cozy finds to everyday upgrades.",
    items: demoItems.map((item, index) => ({ ...item, createdAt: Date.now() - index * 1000 })),
  });
  return {
    version: 1,
    activeId: everyday.id,
    layout: "grid",
    lists: [
      everyday,
      normalizeList({ name: "Birthday Wishlist", occasion: "Birthday", theme: "peach", description: "A few ideas for my next trip around the sun." }),
      normalizeList({ name: "Holiday Gift Ideas", occasion: "Holiday", theme: "sage", description: "A little holiday inspiration for the people I love." }),
    ],
  };
}

export function saveWorkspace(workspace) {
  localStorage.setItem(storeKey, JSON.stringify(workspace));
}

export function readBackup(raw) {
  return normalizeWorkspace(JSON.parse(raw));
}

export function snapshotLink(list) {
  const bytes = new TextEncoder().encode(JSON.stringify({ v: 1, list: normalizeList(list) }));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const packed = btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  if (packed.length > 16000) throw new Error("This list is too large for a snapshot link. Shorten notes or use a live link.");
  return `${appRoot.href}#list=${packed}`;
}

export function readSnapshot(packed) {
  if (!/^[A-Za-z0-9_-]{1,16000}$/.test(packed)) throw new Error("This wishlist link is incomplete.");
  const binary = atob(packed.replaceAll("-", "+").replaceAll("_", "/"));
  const data = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(binary, (char) => char.charCodeAt(0))));
  if (data?.v !== 1 || typeof data.list?.name !== "string" || !Array.isArray(data.list.items)) {
    throw new Error("This wishlist link is invalid.");
  }
  return normalizeList(data.list);
}

export function liveLink(id) {
  return `${appRoot.href}#live=${id}`;
}

export function loadClaimTokens(id) {
  try {
    return record(JSON.parse(localStorage.getItem(claimKey))?.[id]);
  } catch {
    return {};
  }
}

export function saveClaimTokens(id, tokens) {
  const all = record(JSON.parse(localStorage.getItem(claimKey)));
  all[id] = tokens;
  localStorage.setItem(claimKey, JSON.stringify(all));
}

export function storeName(url) {
  const safe = safeUrl(url);
  return safe ? new URL(safe).hostname.replace(/^www\./, "") : "";
}
