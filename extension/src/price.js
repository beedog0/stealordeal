// Deal rating and price history helpers. Pure functions, shared with Node tests.

// Bands are the asking price's distance from market, in percent.
export const DEAL_BANDS = [
  { key: 'steal', label: 'Steal', max: -20 },
  { key: 'good', label: 'Good deal', max: -8 },
  { key: 'fair', label: 'Fair price', max: 8 },
  { key: 'pricey', label: 'Pricey', max: 25 },
  { key: 'over', label: 'Overpaying', max: Infinity },
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
  return { low, high, first, last, changePct, days: points.length };
}

export function parsePrice(text) {
  const m = String(text ?? '').replace(/,/g, '').match(/(\d+(?:\.\d{1,2})?)/);
  return m ? Number(m[1]) : null;
}
