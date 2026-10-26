// PokemonPriceTracker (pokemonpricetracker.com) price history for Pokémon products.
// The extension calls it with the user's own API key, so the data stays personal use.
// Their docs don't pin down the exact history shape, so the parser accepts the
// documented path (priceHistory.variants[printing][condition]) and a few likely variants.

export const PPT_BASE = 'https://www.pokemonpricetracker.com/api/v2';

export function pptUrl(productId, sealed, days = 90) {
  const path = sealed ? 'sealed-products' : 'cards';
  return `${PPT_BASE}/${path}?tcgPlayerId=${productId}&includeHistory=true&days=${days}&limit=1`;
}

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

function pickKey(obj, wanted) {
  const keys = Object.keys(obj ?? {});
  if (!keys.length) return null;
  for (const w of wanted) {
    const hit = keys.find((k) => norm(k) === norm(w));
    if (hit) return hit;
  }
  for (const w of wanted) {
    const hit = keys.find((k) => norm(k).includes(norm(w)) || norm(w).includes(norm(k)));
    if (hit) return hit;
  }
  return keys.length === 1 ? keys[0] : null;
}

const DATE_KEYS = ['date', 'd', 'day', 'timestamp', 'time', 'recordedAt', 'createdAt'];
const PRICE_KEYS = ['market', 'marketPrice', 'price', 'value', 'avg', 'average', 'mid'];

function toDate(v) {
  if (v == null) return null;
  const t = typeof v === 'number' ? (v < 1e12 ? v * 1000 : v) : Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
}

// Turn one series in any of the shapes we accept into [{ date, price }].
function toPoints(series) {
  const out = [];
  if (Array.isArray(series)) {
    for (const e of series) {
      if (!e || typeof e !== 'object') continue;
      const date = toDate(DATE_KEYS.map((k) => e[k]).find((v) => v != null));
      const price = PRICE_KEYS.map((k) => e[k]).find((v) => typeof v === 'number');
      if (date && price > 0) out.push({ date, price });
    }
  } else if (series && typeof series === 'object') {
    // { 'YYYY-MM-DD': 12.3 } or { 'YYYY-MM-DD': { market: 12.3 } }
    for (const [k, v] of Object.entries(series)) {
      const date = toDate(k);
      const price = typeof v === 'number' ? v : PRICE_KEYS.map((p) => v?.[p]).find((x) => typeof x === 'number');
      if (date && price > 0) out.push({ date, price });
    }
  }
  const byDate = new Map(out.map((p) => [p.date, p]));
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

const CONDITIONS = ['Near Mint', 'NM', 'nearMint', 'Sealed', 'Unopened'];

// Depth-first search for the first series that yields points.
function findSeries(node, depth = 0) {
  if (depth > 4 || node == null) return [];
  const pts = toPoints(node);
  if (pts.length) return pts;
  if (typeof node !== 'object' || Array.isArray(node)) return [];
  const key = pickKey(node, CONDITIONS);
  if (key) {
    const hit = findSeries(node[key], depth + 1);
    if (hit.length) return hit;
  }
  for (const v of Object.values(node)) {
    const hit = findSeries(v, depth + 1);
    if (hit.length) return hit;
  }
  return [];
}

export function pptHistoryPoints(body, subtype) {
  const item = Array.isArray(body?.data) ? body.data[0] : body?.data ?? body;
  const history = item?.priceHistory;
  if (!history) return [];
  const variants = history.variants ?? history;
  if (variants && typeof variants === 'object' && !Array.isArray(variants)) {
    const key = pickKey(variants, [subtype, 'Normal', 'Holofoil']);
    if (key) {
      const pts = findSeries(variants[key]);
      if (pts.length) return pts;
    }
  }
  return findSeries(history);
}

// Use the tracker's history, then extend it with our own days after its last one.
// Mixing the two sources day by day would draw zigzags wherever they differ slightly.
export function mergePoints(primary, ours) {
  const last = primary.at(-1)?.date ?? '';
  return [...primary, ...ours.filter((p) => p.date > last)];
}
