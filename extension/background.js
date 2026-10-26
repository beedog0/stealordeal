// Service worker: downloads and caches price data, answers lookups from the
// content scripts and the popup.
import { DATA_BASE, CATEGORIES } from './src/config.js';
import { buildSearch, confidence, parseTitle, pickSubtype, searchAll } from './src/match.js';
import { historyStats, rateDeal, seriesPoints } from './src/price.js';

const CACHE = 'sod-data-v1';
const MAX_AGE = 6 * 3600 * 1000;
const searches = new Map();
const pending = new Map();

// Cache API keeps the (large) index files across service worker restarts.
async function getJson(url, maxAge = MAX_AGE) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(url);
  const fetchedAt = Number(hit?.headers.get('x-sod-fetched') ?? 0);
  if (hit && Date.now() - fetchedAt < maxAge) return hit.json();
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.text();
    await cache.put(url, new Response(body, { headers: { 'content-type': 'application/json', 'x-sod-fetched': String(Date.now()) } }));
    return JSON.parse(body);
  } catch (err) {
    if (hit) return hit.json(); // Stale data beats no data when offline.
    throw err;
  }
}

function loadSearch(catId) {
  if (searches.has(catId)) return Promise.resolve(searches.get(catId));
  if (!pending.has(catId)) {
    pending.set(
      catId,
      getJson(`${DATA_BASE}/${catId}/index.json`)
        .then((data) => {
          const s = buildSearch(catId, data);
          searches.set(catId, s);
          return s;
        })
        .finally(() => pending.delete(catId)),
    );
  }
  return pending.get(catId);
}

const loadAll = () => Promise.all(CATEGORIES.map((c) => loadSearch(c.id)));

function summary(product, search) {
  const g = search.groups[product.groupId];
  return {
    catId: product.catId,
    productId: product.productId,
    name: product.name,
    number: product.number,
    rarity: product.rarity,
    sealed: product.sealed,
    subtypes: product.subtypes,
    setName: g?.name ?? '',
    game: CATEGORIES.find((c) => c.id === product.catId)?.name ?? '',
    image: `https://tcgplayer-cdn.tcgplayer.com/product/${product.productId}_200w.jpg`,
    url: `https://www.tcgplayer.com/product/${product.productId}`,
  };
}

// Full price details for one product and printing.
async function details(catId, productId, subtype, ask) {
  const search = await loadSearch(catId);
  const product = search.products[search.byId.get(productId)];
  if (!product) return null;
  const history = await getJson(`${DATA_BASE}/${catId}/h/${product.groupId}.json`);
  const chosen = subtype && product.subtypes.includes(subtype) ? subtype : pickSubtype(product.subtypes, null);
  const key = `${productId}|${chosen}`;
  const [market, low, mid] = history.cur?.[key] ?? [null, null, null];
  const points = seriesPoints(history, key, 90);
  const marketPrice = market ?? points.at(-1)?.price ?? null;
  return {
    ...summary(product, search),
    subtype: chosen,
    market: marketPrice,
    low,
    mid,
    updated: history.end ?? search.updated,
    points,
    stats: historyStats(points),
    deal: rateDeal(ask, marketPrice),
  };
}

async function lookup({ title, price }) {
  const indexes = await loadAll();
  const parsed = parseTitle(title);
  const results = searchAll(indexes, parsed, 5);
  const conf = confidence(results);
  if (!results.length) return { confidence: conf, parsed };
  const best = results[0].product;
  const item = await details(best.catId, best.productId, pickSubtype(best.subtypes, parsed.finish), price);
  return {
    confidence: conf,
    parsed,
    item,
    alternatives: results.map((r) => summary(r.product, searches.get(r.product.catId))),
  };
}

async function findProduct(productId) {
  for (const s of await loadAll()) if (s.byId.has(productId)) return s.catId;
  return null;
}

const handlers = {
  async lookup(msg) {
    return lookup(msg);
  },
  async details({ catId, productId, subtype, price }) {
    return details(catId ?? (await findProduct(productId)), productId, subtype, price);
  },
  async search({ query }) {
    const indexes = await loadAll();
    return searchAll(indexes, query, 12).map((r) => summary(r.product, searches.get(r.product.catId)));
  },
  async meta() {
    return getJson(`${DATA_BASE}/meta.json`);
  },
};

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const handler = handlers[msg?.type];
  if (!handler) return false;
  handler(msg)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((err) => sendResponse({ ok: false, error: String(err?.message ?? err) }));
  return true;
});

// Warm the cache so the first lookup is fast.
chrome.runtime.onInstalled.addListener(() => loadAll().catch(() => {}));
