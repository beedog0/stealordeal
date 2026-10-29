// Service worker: downloads and caches price data, answers lookups from the
// content scripts and the popup.
import { DATA_BASE, CATEGORIES } from './src/config.js';
import { buildSearch, confidence, parseTitle, pickSubtype, searchAll } from './src/match.js';
import { DEFAULT_SETTINGS, assess, historyStats, seriesPoints, trendPct } from './src/price.js';
import { PPT_BASE, describeShape, mergePoints, pptGradedHistory, pptGradedPrice, pptHistoryPoints, pptUrl } from './src/ppt.js';

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

// Every catalog that loads. One that's missing (say, a game added to the build
// but not yet published) shouldn't take the others down with it.
async function loadAll() {
  const results = await Promise.allSettled(CATEGORIES.map((c) => loadSearch(c.id)));
  const loaded = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  if (!loaded.length) throw results[0].reason;
  return loaded;
}

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

const pick = (body) => {
  const item = Array.isArray(body?.data) ? body.data[0] : body?.data ?? body;
  return { priceHistory: item?.priceHistory ?? null, ebay: item?.ebay ?? null };
};

// Pokémon history (and graded prices for graded listings) from PokemonPriceTracker,
// when the user has added a key. Never throws: problems come back as `error`.
async function pptData(product, subtype, grade) {
  if (product.catId !== 3 && product.catId !== 85) return { status: 'unsupported' };
  const key = await getPptKey();
  if (!key) return { status: 'nokey' };
  try {
    const body = await pptFetch(pptUrl(product.productId, product.sealed, { ebay: Boolean(grade), japanese: product.catId === 85 }), key);
    const points = pptHistoryPoints(body, subtype);
    return {
      status: 'ok',
      points: points.length ? points : null,
      graded: grade ? pptGradedPrice(body, grade) : null,
      gradedPoints: grade ? pptGradedHistory(body, grade) : [],
      error: points.length ? null : 'no price history in the response',
    };
  } catch (err) {
    console.warn('Fairmark: PokemonPriceTracker lookup failed', err);
    return { status: 'error', error: err.message };
  }
}

// eBay's sold listings for this exact card, so the user can check the evidence.
function compsUrl(product, grade) {
  const name = product.name.replace(/\s+-\s+[^-]*\d[^-]*$/, '');
  const q = [name, product.number, product.catId === 85 ? 'japanese' : '', grade ? `${grade.company} ${grade.grade}` : '']
    .filter(Boolean).join(' ');
  return `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}&LH_Sold=1&LH_Complete=1`;
}

async function getSettings() {
  const { fmSettings } = await chrome.storage.local.get('fmSettings');
  return { ...DEFAULT_SETTINGS, ...fmSettings };
}

// Full price details for one product and printing.
//   listing: { shipping, auction } read from the page, when there is one.
//   match: how sure the title match is ('high' | 'medium' | 'low').
async function details(catId, productId, subtype, ask, grade = null, listing = {}, match = 'high') {
  const search = await loadSearch(catId);
  const product = search.products[search.byId.get(productId)];
  if (!product) return null;
  const history = await getJson(`${DATA_BASE}/${catId}/h/${product.groupId}.json`);
  const chosen = subtype && product.subtypes.includes(subtype) ? subtype : pickSubtype(product.subtypes, null);
  const key = `${productId}|${chosen}`;
  const [market, low, mid] = history.cur?.[key] ?? [null, null, null];
  const ours = seriesPoints(history, key, 90);
  const ppt = await pptData(product, chosen, grade);
  const extra = ppt.points;
  const since = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const points = extra ? mergePoints(extra, ours).filter((p) => p.date >= since) : ours;
  const marketPrice = market ?? points.at(-1)?.price ?? null;
  const graded = grade ? { ...grade, price: ppt.graded?.price ?? null, sales: ppt.graded?.sales ?? null } : null;
  // Graded listings chart that grade's sold prices; ungraded history is the fallback.
  const gradedPoints = (ppt.gradedPoints ?? []).filter((p) => p.date >= since);
  const shown = gradedPoints.length >= 2 ? gradedPoints : points;
  return {
    ...summary(product, search),
    subtype: chosen,
    market: marketPrice,
    low,
    mid,
    updated: history.end ?? search.updated,
    historySource: extra ? 'PokemonPriceTracker' : 'TCGplayer',
    ppt: { status: ppt.status, error: ppt.error ?? null },
    graded,
    gradedHistory: shown === gradedPoints,
    points: shown,
    stats: historyStats(shown),
    compsUrl: compsUrl(product, grade),
    // A graded listing is only rated against sales of the same grade.
    assessment: assess({
      ...(await getSettings()),
      price: ask,
      shipping: listing.shipping ?? null,
      auction: Boolean(listing.auction),
      reference: grade
        ? { price: graded.price, source: 'graded', name: `${grade.company} ${grade.grade}`, label: `${grade.company} ${grade.grade} price`, sales: graded.sales, lastSale: ppt.graded?.lastSale }
        : { price: marketPrice, source: 'market', label: 'TCGplayer market price' },
      trend30: trendPct(shown, 30),
      trend90: trendPct(shown, 90),
      match,
    }),
  };
}

async function lookup({ title, price, hints, listing }) {
  const indexes = await loadAll();
  const parsed = parseTitle(title, hints ?? {});
  const results = searchAll(indexes, parsed, 5);
  const conf = confidence(results);
  if (!results.length) return { confidence: conf, parsed };
  const best = results[0].product;
  const item = await details(best.catId, best.productId, pickSubtype(best.subtypes, parsed.finish), price, parsed.grade, listing, conf);
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
  async details({ catId, productId, subtype, price, grade, listing, match }) {
    return details(catId ?? (await findProduct(productId)), productId, subtype, price, grade ?? null, listing, match);
  },
  async search({ query }) {
    const indexes = await loadAll();
    return searchAll(indexes, query, 12).map((r) => summary(r.product, searches.get(r.product.catId)));
  },
  async meta() {
    return getJson(`${DATA_BASE}/meta.json`);
  },
  // Checks a PokemonPriceTracker key with a sample card (Charizard ex 199/165, 3 credits)
  // and reports what history and graded data came back, plus the response shape for debugging.
  async testPptKey({ key }) {
    const res = await fetch(pptUrl(517045, false, { ebay: true }), { headers: { Authorization: `Bearer ${key}` } });
    if (res.status === 401) throw new Error('That key was not accepted.');
    if (!res.ok) throw new Error(`PokemonPriceTracker HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const body = await res.json();
    return {
      remaining: res.headers.get('X-RateLimit-Daily-Remaining'),
      historyDays: pptHistoryPoints(body, 'Holofoil').length,
      psa10: pptGradedPrice(body, { company: 'PSA', grade: '10' })?.price ?? null,
      // Only the parts Fairmark reads; the card's other fields would crowd them out.
      shape: JSON.stringify(describeShape(pick(body)), null, 1).slice(0, 12000),
    };
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

// Unpacked installs reload themselves when build.txt changes on disk, so an
// updated folder takes effect without a trip to chrome://extensions.
// Store installs have an update_url and update through Chrome instead.
if (!('update_url' in chrome.runtime.getManifest())) {
  const checkBuild = async () => {
    const res = await fetch(chrome.runtime.getURL('build.txt'), { cache: 'no-store' }).catch(() => null);
    if (!res?.ok) return;
    const build = (await res.text()).trim();
    const { devBuild } = await chrome.storage.local.get('devBuild');
    if (build === devBuild) return;
    await chrome.storage.local.set({ devBuild: build });
    if (devBuild) chrome.runtime.reload();
  };
  chrome.alarms.create('dev-reload', { periodInMinutes: 0.5 });
  chrome.alarms.onAlarm.addListener((a) => a.name === 'dev-reload' && checkBuild());
  checkBuild();
}
