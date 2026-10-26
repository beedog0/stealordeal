// Service worker: downloads and caches price data, answers lookups from the
// content scripts and the popup.
import { DATA_BASE, CATEGORIES } from './src/config.js';
import { buildSearch, confidence, parseTitle, pickSubtype, searchAll } from './src/match.js';
import { historyStats, rateDeal, seriesPoints } from './src/price.js';
import { PPT_BASE, mergePoints, pptHistoryPoints, pptUrl } from './src/ppt.js';

const CACHE = 'fm-data-v1';
const MAX_AGE = 6 * 3600 * 1000;
const searches = new Map();
const pending = new Map();

// Cache API keeps the (large) index files across service worker restarts.
async function getJson(url, maxAge = MAX_AGE) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(url);
  const fetchedAt = Number(hit?.headers.get('x-fm-fetched') ?? 0);
  if (hit && Date.now() - fetchedAt < maxAge) return hit.json();
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.text();
    await cache.put(url, new Response(body, { headers: { 'content-type': 'application/json', 'x-fm-fetched': String(Date.now()) } }));
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

const getPptKey = () => chrome.storage.local.get('pptKey').then((r) => r.pptKey || null);

// Raw PokemonPriceTracker response for one product, cached for 12 hours.
// The cache key leaves out the API key, which only ever goes in the request header.
async function pptFetch(url, key) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(url);
  if (hit && Date.now() - Number(hit.headers.get('x-fm-fetched') ?? 0) < 12 * 3600 * 1000) return hit.json();
  const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`PokemonPriceTracker HTTP ${res.status}`);
  const body = await res.text();
  await cache.put(url, new Response(body, { headers: { 'content-type': 'application/json', 'x-fm-fetched': String(Date.now()) } }));
  return JSON.parse(body);
}

// Longer Pokémon history from PokemonPriceTracker when the user has added a key.
// Any failure falls back to our own daily history.
async function pptHistory(product, subtype) {
  if (product.catId !== 3) return null;
  const key = await getPptKey();
  if (!key) return null;
  try {
    const pts = pptHistoryPoints(await pptFetch(pptUrl(product.productId, product.sealed), key), subtype);
    return pts.length ? pts : null;
  } catch (err) {
    console.warn('Fairmark: history lookup failed', err);
    return null;
  }
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
  const ours = seriesPoints(history, key, 90);
  const extra = await pptHistory(product, chosen);
  const since = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const points = extra ? mergePoints(extra, ours).filter((p) => p.date >= since) : ours;
  const marketPrice = market ?? points.at(-1)?.price ?? null;
  return {
    ...summary(product, search),
    subtype: chosen,
    market: marketPrice,
    low,
    mid,
    updated: history.end ?? search.updated,
    historySource: extra ? 'PokemonPriceTracker' : 'TCGplayer',
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
  // Checks a PokemonPriceTracker key; returns the credits left today when the API reports them.
  async testPptKey({ key }) {
    const res = await fetch(`${PPT_BASE}/sets?limit=1`, { headers: { Authorization: `Bearer ${key}` } });
    if (res.status === 401) throw new Error('That key was not accepted.');
    if (!res.ok) throw new Error(`PokemonPriceTracker HTTP ${res.status}`);
    return { remaining: res.headers.get('X-RateLimit-Daily-Remaining') };
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
