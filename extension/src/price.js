// Deal rating and price history helpers. Pure functions, shared with Node tests.

// Bands are the asking price's distance from market, in percent.
export const DEAL_BANDS = [
  { key: 'steal', label: 'Super good buy', max: -20 },
  { key: 'good', label: 'Good buy', max: -8 },
  { key: 'fair', label: 'OK deal', max: 8 },
  { key: 'pricey', label: 'Pass', max: 25 },
  { key: 'over', label: 'Super bad', max: Infinity },
];

export function rateDeal(ask, market) {
  if (!(ask > 0) || !(market > 0)) return null;
  const pct = ((ask - market) / market) * 100;
  const band = DEAL_BANDS.find((b) => pct <= b.max);
  return { ...band, pct, diff: ask - market };
}

const DAY = 86400000;

// Turn a history file's series into dated points: [{ date, price }].
export function seriesPoints(history, key, days = 90) {
  const arr = history?.m?.[key];
  if (!arr) return [];
  const start = Date.parse(history.start);
  const from = Math.max(0, arr.length - days);
  const out = [];
  for (let i = from; i < arr.length; i++) {
    if (arr[i] != null) out.push({ date: new Date(start + i * DAY).toISOString().slice(0, 10), price: arr[i] });
  }
  return out;
}

export function historyStats(points) {
  if (!points.length) return null;
  let low = points[0];
  let high = points[0];
  for (const p of points) {
    if (p.price < low.price) low = p;
    if (p.price > high.price) high = p;
  }
  const first = points[0];
  const last = points[points.length - 1];
  const changePct = first.price ? ((last.price - first.price) / first.price) * 100 : 0;
  // Days spanned, not points: graded sales history can skip days.
  const days = Math.round((Date.parse(last.date) - Date.parse(first.date)) / DAY) + 1;
  return { low, high, first, last, changePct, days };
}

export function parsePrice(text) {
  const m = String(text ?? '').replace(/,/g, '').match(/(\d+(?:\.\d{1,2})?)/);
  return m ? Number(m[1]) : null;
}

// ---- Buying recommendation ----
// A fixed, explainable formula: no figure here is guessed. Every input comes from
// the listing, the user's settings, or a price source named on the card.

export const VERDICTS = [
  { key: 'steal', label: 'Strong buy', max: -20 },
  { key: 'good', label: 'Good buy', max: -8 },
  { key: 'fair', label: 'Fair price', max: 8 },
  { key: 'over', label: 'Overpriced', max: Infinity },
];
const ORDER = VERDICTS.map((v) => v.key);
const downgrade = (v) => VERDICTS[Math.min(ORDER.indexOf(v.key) + 1, VERDICTS.length - 1)];

export const DEFAULT_SETTINGS = { taxRate: 8.25, discount: 10 };

const round2 = (n) => Math.round(n * 100) / 100;
const daysSince = (date, now) => (date ? Math.floor((now - Date.parse(date)) / 86400000) : null);

// Price change over the last `days` of a [{ date, price }] series, in percent.
export function trendPct(points, days, now = Date.now()) {
  if (!points?.length) return null;
  const since = new Date(now - days * 86400000).toISOString().slice(0, 10);
  const window = points.filter((p) => p.date >= since);
  if (window.length < 2) return null;
  const first = window[0].price;
  return first ? ((window.at(-1).price - first) / first) * 100 : null;
}

// in: {
//   price, shipping (null = unknown), auction, taxRate (%), discount (%),
//   reference: { price, source: 'graded' | 'market', label, sales, lastSale, updated },
//   trend30 (%), match: 'high' | 'medium' | 'low', now
// }
export function assess(input) {
  const { price, shipping = null, auction = false, reference, trend30 = null, trend90 = null, match = 'high', now = Date.now() } = input;
  const taxRate = (input.taxRate ?? DEFAULT_SETTINGS.taxRate) / 100;
  const discount = (input.discount ?? DEFAULT_SETTINGS.discount) / 100;
  const ref = reference?.price > 0 ? reference.price : null;
  const reasons = [];
  const what = reference?.name ?? reference?.label; // 'PSA 10'

  // Confidence: how much the reference price can be trusted, then capped by the title match.
  let confidence = 'high';
  let insufficient = null;
  if (!ref) insufficient = reference?.source === 'graded' ? `No recent ${what} sales` : 'No market price yet';
  else if (reference.source === 'graded') {
    const n = reference.sales ?? 0;
    const age = daysSince(reference.lastSale, now);
    if (n < 3) insufficient = `Only ${n} recent ${what} sale${n === 1 ? '' : 's'}`;
    else confidence = n >= 10 ? 'high' : 'medium';
    if (age != null && age > 60 && confidence === 'high') confidence = 'medium';
    if (age != null && age > 120) confidence = 'low';
  }
  if (match === 'low') confidence = 'low';
  else if (match === 'medium' && confidence === 'high') confidence = 'medium';

  const ship = shipping ?? 0;
  const tax = price > 0 ? round2((price + ship) * taxRate) : null;
  const allIn = price > 0 ? round2(price + ship + tax) : null;
  // The most you can pay (price, before shipping and tax) and still be `discount` under market.
  const maxBid = ref ? Math.max(0, round2((ref * (1 - discount)) / (1 + taxRate) - ship)) : null;

  let verdict = null;
  let pct = null;
  if (!insufficient && allIn) {
    pct = ((allIn - ref) / ref) * 100;
    verdict = VERDICTS.find((v) => pct <= v.max);
    const where = Math.abs(pct) < 0.5 ? 'right at' : `${Math.abs(pct).toFixed(0)}% ${pct < 0 ? 'under' : 'over'}`;
    reasons.push(`All-in ${fmt(allIn)} is ${where} the ${reference.label} of ${fmt(ref)}.`);
    // A falling market makes a discount worth less: step the verdict down.
    const falling = trend30 != null && trend30 <= -15 ? [trend30, 30] : trend90 != null && trend90 <= -25 ? [trend90, 90] : null;
    if (falling && (verdict.key === 'steal' || verdict.key === 'good')) {
      verdict = downgrade(verdict);
      reasons.push(`Prices fell ${Math.abs(falling[0]).toFixed(0)}% in the last ${falling[1]} days, so the discount may not hold.`);
    }
    if (confidence === 'low' && verdict.key === 'steal') verdict = downgrade(verdict);
  }
  if (trend30 != null && Math.abs(trend30) >= 5 && !reasons.some((r) => r.startsWith('Prices fell'))) {
    reasons.push(`Prices are ${trend30 > 0 ? 'up' : 'down'} ${Math.abs(trend30).toFixed(0)}% over 30 days.`);
  }
  if (reference?.source === 'graded' && ref) {
    const age = daysSince(reference.lastSale, now);
    reasons.push(`Based on ${reference.sales ?? 'recent'} ${what} eBay sales${age != null ? `, the latest ${age === 0 ? 'today' : `${age} day${age === 1 ? '' : 's'} ago`}` : ''}.`);
  }
  if (match !== 'high') reasons.push('Matched from the listing title. Check that it is the right card.');
  if (auction) reasons.push(`Auction: the current bid will likely rise. Stay at or under ${fmt(maxBid)}.`);

  return {
    verdict: verdict ? { key: verdict.key, label: verdict.label } : null,
    insufficient,
    confidence: insufficient ? null : confidence,
    price: price > 0 ? price : null,
    shipping,
    tax,
    taxRate: taxRate * 100,
    allIn,
    pct,
    diff: allIn && ref ? round2(allIn - ref) : null,
    reference: ref,
    maxBid,
    discount: discount * 100,
    auction,
    reasons: reasons.slice(0, 4),
  };
}

function fmt(n) {
  return n == null ? '—' : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
