// eBay sold comps: recent sold listings for the same card (and grade), used to confirm
// the reference price and to override it when the two disagree. Pure functions,
// shared with Node tests. The page fetching and parsing lives in ui/sold.js.

const DAY = 86400000;
const GRADERS = 'psa|bgs|beckett|cgc|sgc|tag|ace|ags|gma|hga|ksa|mnt';
const JUNK = /\b(lot|bundle|playset|proxy|custom|orica|replica|fan ?art|digital|code card|you pick|pick your|choose|sticker|empty|case only|slab only|no card|reprint|metal|gold plated)\b|\bx\s?[2-9]\b|\b[2-9]\s?x\b/;
const ASIAN = /\b(japanese|japan|jpn|jp|korean|kor|chinese|s-chinese|t-chinese|simplified|traditional)\b/;

const stripZeros = (s) => String(s).toLowerCase().replace(/^([a-z]*)0+(?=\d)/, '$1');

// Card number tokens in a title: "269/217" -> ['269'], "#269" -> ['269'], "SV107" stays.
function titleNumbers(lower) {
  const out = new Set();
  for (const m of lower.matchAll(/([a-z]{0,5}\d{1,4}[a-z]?)\s*\/\s*[a-z]{0,5}\d{1,4}\b/g)) out.add(stripZeros(m[1]));
  for (const m of lower.matchAll(/#\s*([a-z]{0,5}\d{1,4}[a-z]?)\b/g)) out.add(stripZeros(m[1]));
  return out;
}

// The grade a sold title says, e.g. { company: 'PSA', grade: '10' }, or null for raw.
function titleGrade(lower) {
  const g = lower.match(new RegExp(`\\b(${GRADERS})\\s*-?\\s*(?:gem\\s*(?:mint|mt)\\s*|pristine\\s*|mint\\s*)?(10|[1-9](?:\\.5)?)\\b`));
  if (!g) return /\b(graded|slab|slabbed)\b/.test(lower) || new RegExp(`\\b(${GRADERS})\\b`).test(lower) ? { company: '?', grade: '?' } : null;
  const company = g[1] === 'beckett' ? 'BGS' : g[1].toUpperCase();
  return { company, grade: g[2] };
}

// The words of a card name that a seller would always include ("Mega Gengar ex - 269/217" -> ['gengar']).
function nameWords(name) {
  return String(name)
    .replace(/\s+-\s+[^-]*\d[^-]*$/, '')
    .replace(/\([^)]*\)/g, ' ')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !['mega', 'full', 'secret', 'rare', 'holo', 'alternate', 'special', 'illustration', 'promo'].includes(w));
}

// Why a sold listing doesn't count for this card, or null when it does.
//   product: { name, number, catId, sealed }, grade: { company, grade } | null
export function rejectReason(sale, product, grade) {
  if (!(sale?.price > 0) || !sale.title) return 'no price';
  const lower = sale.title.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (JUNK.test(lower)) return 'lot or not a real card';
  const g = titleGrade(lower);
  if (grade) {
    if (!g || g.company !== grade.company.toUpperCase() || g.grade !== String(grade.grade)) return 'different grade';
  } else if (g && !product.sealed) return 'graded';
  const wantNum = product.number ? stripZeros(String(product.number).split('/')[0]) : null;
  if (wantNum && !product.sealed) {
    const nums = titleNumbers(lower);
    // A title with no number at all is too vague; one with another number is another card.
    if (!nums.has(wantNum) && !new RegExp(`\\b0*${wantNum.replace(/^[a-z]+/, '')}\\b`).test(lower)) return 'different number';
  }
  const words = nameWords(product.name);
  if (words.length && !words.some((w) => lower.includes(w))) return 'different card';
  const asian = ASIAN.test(lower);
  if (product.catId === 85 ? !asian : asian) return 'different language';
  return null;
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const round2 = (n) => Math.round(n * 100) / 100;

// Summary of the sales that count: the median of the most recent ones (up to `recent`),
// within `days`. Best-offer sales show the asking price, not what was paid, so they
// only count when there aren't enough others.
export function compStats(sales, product, grade, { days = 90, recent = 15, now = Date.now() } = {}) {
  if (!Array.isArray(sales)) return null;
  const since = new Date(now - days * DAY).toISOString().slice(0, 10);
  const kept = [];
  let rejected = 0;
  for (const s of sales) {
    if (rejectReason(s, product, grade)) rejected++;
    else if (!s.date || s.date >= since) kept.push(s);
  }
  kept.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  const exact = kept.filter((s) => !s.bestOffer);
  const pool = (exact.length >= 3 ? exact : kept).slice(0, recent);
  if (!pool.length) return { count: 0, rejected, sales: [] };
  const prices = pool.map((s) => s.price);
  return {
    count: pool.length,
    median: round2(median(prices)),
    low: Math.min(...prices),
    high: Math.max(...prices),
    lastSale: pool[0].date ?? null,
    bestOffers: pool.filter((s) => s.bestOffer).length,
    rejected,
    sales: pool.slice(0, 8).map(({ title, price, date, url, bestOffer, shipping }) => ({ title, price, date, url, bestOffer: Boolean(bestOffer), shipping: shipping ?? null })),
  };
}

// Within this much of each other, the sold median confirms the reference price.
export const AGREE_PCT = 15;

// Pick the price to rate against. eBay sales of the same card and grade are the most
// direct evidence of what it sells for, so with at least 3 they win when the tracker
// price is missing or more than AGREE_PCT away; otherwise they confirm it.
//   reference: what assess() takes. stats: compStats(). name: 'PSA 10' or ''.
export function reconcile(reference, stats, name = '') {
  const ref = reference?.price > 0 ? reference.price : null;
  if (!stats?.count || stats.count < 3) return { reference, sold: stats ? { ...stats, used: false, agree: null, diffPct: null, tracker: ref } : null };
  const diffPct = ref ? ((stats.median - ref) / ref) * 100 : null;
  const agree = diffPct == null ? null : Math.abs(diffPct) <= AGREE_PCT;
  const sold = { ...stats, used: !agree, agree, diffPct, tracker: ref };
  if (agree) return { reference, sold };
  return {
    reference: {
      price: stats.median,
      source: 'sold',
      name: name || 'this card',
      label: `eBay sold median${name ? ` for ${name}` : ''}`,
      sales: stats.count,
      lastSale: stats.lastSale,
      tracker: ref,
      trackerLabel: reference?.label ?? null,
    },
    sold,
  };
}
