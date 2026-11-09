// Flip and hold: what you'd net reselling a card, and whether its price history
// argues for holding it. Pure functions, shared with the data build and Node tests.
//
// None of this is a forecast. Flip profit is arithmetic on the market price and
// the fees you set. The hold signal only reads what prices have already done:
// this card's trend, where it sits in its range, how cards of the same type are
// moving across the catalog, and how old its set is.

const round2 = (n) => Math.round(n * 100) / 100;

// ---- Card types ----
// "Charizard V - 019/073" -> "Charizard V": TCGplayer appends the number after a dash.
const base = (n) => n.replace(/\s+-\s+[^-]*$/, '');

// The groups collectors move between. Checked in order; a card gets the first match.
// Case matters: "ex" (Scarlet & Violet) and "EX" (Black & White / XY) are different eras.
export const CARD_TYPES = [
  { key: 'tagteam', label: 'Tag Team', test: (n) => /\s&\s/.test(n) && /\bGX\b/.test(n) },
  { key: 'vstar', label: 'VSTAR', test: (n) => /\bVSTAR\b/.test(n) },
  { key: 'vmax', label: 'VMAX', test: (n) => /\bVMAX\b/.test(n) },
  { key: 'vunion', label: 'V-UNION', test: (n) => /\bV-UNION\b/.test(n) },
  { key: 'mega', label: 'Mega', test: (n) => /^(M|Mega)\s/.test(n) },
  { key: 'radiant', label: 'Radiant', test: (n) => /^Radiant\s/.test(n) },
  { key: 'goldstar', label: 'Gold Star', test: (n) => /[☆★]|\sStar$/.test(base(n)) },
  { key: 'v', label: 'V', test: (n) => /\sV\s/.test(` ${base(n)} `) },
  { key: 'gx', label: 'GX', test: (n) => /\bGX\b/.test(n) },
  { key: 'exsv', label: 'ex (Scarlet & Violet era)', test: (n) => /\sex\b/.test(n) },
  { key: 'exold', label: 'EX (2012–2016)', test: (n) => /\sEX\b/.test(n) },
];

// Rarity groups, which cut across the types above (an Illustration Rare can be anything).
export const RARITY_TYPES = [
  { key: 'sir', label: 'Special Illustration Rare', test: (r) => /special illustration/i.test(r) },
  { key: 'ir', label: 'Illustration Rare', test: (r) => /^illustration rare/i.test(r) },
  { key: 'hyper', label: 'Hyper / Gold Rare', test: (r) => /hyper|gold/i.test(r) },
  { key: 'altart', label: 'Alternate Art', test: (r, n) => /alternate art|alt art/i.test(n) },
  { key: 'tg', label: 'Trainer / Galarian Gallery', test: (r, n, num) => /^(TG|GG)\d/i.test(num ?? '') },
];

// Pokémon only for now: Magic's card names don't carry these markers.
// in: { name, rarity, number, sealed, catId }. out: [{ key, label }] most specific first.
export function cardTypes(p) {
  if (!p || p.sealed || (p.catId !== 3 && p.catId !== 85)) return [];
  const name = p.name ?? '';
  const out = [];
  const t = CARD_TYPES.find((c) => c.test(name));
  if (t) out.push({ key: t.key, label: t.label });
  for (const r of RARITY_TYPES) if (r.test(p.rarity ?? '', name, p.number)) out.push({ key: r.key, label: r.label });
  return out;
}

// ---- Type trends, built daily across the whole catalog ----

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// Change of one history series over the last `days`, from the first and last priced days in that window.
export function seriesChange(arr, days) {
  if (!arr?.length) return null;
  const from = Math.max(0, arr.length - days);
  let first = null;
  let last = null;
  let n = 0;
  for (let i = from; i < arr.length; i++) {
    if (arr[i] == null) continue;
    if (first == null) first = arr[i];
    last = arr[i];
    n++;
  }
  return n >= 2 && first ? ((last - first) / first) * 100 : null;
}

// Cheap cards swing on pennies, so only cards worth at least this much count.
export const TREND_MIN_PRICE = 3;
const TREND_MIN_CARDS = 8;

// Accumulates one 30-day change per card into its types. Call add() for every
// (product, history series) pair, then result().
export function typeTrendBuilder(days = 30) {
  const buckets = new Map();
  let span = 0;
  return {
    add(product, arr, market) {
      if (!(market >= TREND_MIN_PRICE)) return;
      const types = cardTypes(product);
      if (!types.length) return;
      const change = seriesChange(arr, days);
      if (change == null) return;
      span = Math.max(span, Math.min(days, arr.length));
      for (const t of types) {
        if (!buckets.has(t.key)) buckets.set(t.key, []);
        buckets.get(t.key).push(change);
      }
    },
    result() {
      const types = {};
      for (const [key, xs] of buckets) {
        if (xs.length < TREND_MIN_CARDS) continue;
        types[key] = { n: xs.length, median: round2(median(xs)), up: round2((xs.filter((x) => x > 2).length / xs.length) * 100) };
      }
      return { days: span, types };
    },
  };
}

// ---- Flip profit ----

// Where you resell. Facebook and Discord card groups sell near market with PayPal
// Goods & Services (3.49% + $0.49) and the buyer paying shipping, which is the
// closest online match to a vendor's margins. eBay's Trading Cards fee is 13.25%
// of the order total up to $7,500 plus a per-order fee, and you cover shipping.
// TCGplayer's is about 10.75% + 2.5% payment processing + $0.30. In person has no
// fees or shipping. Fee rates and the undercut are editable per venue in Settings.
export const SELL_VENUES = {
  groups: { label: 'Facebook/Discord groups', feeRate: 3.49, undercut: 0, fixed: 0.49, fixedSmall: 0.49, ships: false },
  inperson: { label: 'in person', feeRate: 0, undercut: 0, fixed: 0, fixedSmall: 0, ships: false },
  ebay: { label: 'eBay', feeRate: 13.25, undercut: 5, fixed: 0.4, fixedSmall: 0.3, ships: true },
  tcgplayer: { label: 'TCGplayer', feeRate: 13.25, undercut: 5, fixed: 0.3, fixedSmall: 0.3, ships: true },
};

export const FLIP_DEFAULTS = {
  venue: 'groups',
  venues: {}, // per-venue overrides: { ebay: { feeRate, undercut } }
  shipLow: 1.25, // plain envelope + toploader, for sales under $20
  shipHigh: 5.5, // tracked bubble mailer, $20 and up (and always for slabs and sealed)
  minProfit: 5, // $ profit that makes a flip worth the effort
  targetPct: 80, // pay at most this % of market, like a vendor buying at 70–85%
};

// in: { allIn (what you pay), resale (market or graded price), graded, sealed, settings }
export function flip({ allIn, resale, graded = false, sealed = false, settings = {} }) {
  const s = { ...FLIP_DEFAULTS, ...settings };
  if (!(resale > 0)) return null;
  const venueKey = SELL_VENUES[s.venue] ? s.venue : FLIP_DEFAULTS.venue;
  const venue = { ...SELL_VENUES[venueKey], ...s.venues?.[venueKey] };
  const sale = round2(resale * (1 - venue.undercut / 100));
  const fixed = sale > 10 ? venue.fixed : venue.fixedSmall;
  const fees = round2(sale * (venue.feeRate / 100) + fixed);
  const ship = !venue.ships ? 0 : graded || sealed || sale >= 20 ? s.shipHigh : s.shipLow;
  const net = round2(sale - fees - ship);
  // The most you can pay all-in: your target % of market, and never so much that
  // fees and shipping leave less than the minimum profit.
  const buyUnder = Math.max(0, round2(Math.min(net - s.minProfit, (resale * s.targetPct) / 100)));
  const base = { sale, fees, ship, net, buyUnder, venue: venue.label, venueKey, undercut: venue.undercut, minProfit: s.minProfit, targetPct: s.targetPct };
  if (!(allIn > 0)) return { ...base, profit: null, roi: null, pctOfMarket: null, verdict: null };
  const profit = round2(net - allIn);
  const roi = (profit / allIn) * 100;
  const pctOfMarket = (allIn / resale) * 100;
  const verdict =
    profit >= s.minProfit && allIn <= buyUnder + 0.005 ? { key: 'good', label: 'Worth flipping' }
    : profit > 0 ? { key: 'fair', label: 'Thin margin' }
    : { key: 'over', label: 'Not a flip' };
  return { ...base, profit, roi, pctOfMarket, verdict };
}

// The same card resold everywhere, so you can see which channel leaves the most.
export function flipCompare(input) {
  return Object.keys(SELL_VENUES)
    .map((venue) => flip({ ...input, settings: { ...input.settings, venue } }))
    .filter(Boolean)
    .map((f) => ({ venueKey: f.venueKey, venue: f.venue, net: f.net, profit: f.profit }));
}

// ---- Hold signal ----
// Scores a handful of plain signals, each with the sentence that explains it.
// Positive points lean "hold", negative lean "sell now / wait".

const DAY = 86400000;

// in: { points: [{date, price}], stats (historyStats), trend30, trend90, typeTrend: { label, median, up, n, days },
//       setPublished: 'YYYY-MM-DD', sealed, now }
export function hold({ points = [], stats = null, trend30 = null, trend90 = null, typeTrend = null, setPublished = null, sealed = false, now = Date.now() }) {
  const signals = [];
  const add = (score, text) => signals.push({ score, text });
  const days = stats?.days ?? 0;

  if (trend30 != null) {
    if (trend30 >= 25) add(-1, `Up ${trend30.toFixed(0)}% in 30 days. Spikes like this often give some back once the hype cools, so selling into it can beat holding.`);
    else if (trend30 >= 5) add(1, `Rising steadily: up ${trend30.toFixed(0)}% in 30 days.`);
    else if (trend30 <= -15) add(-1, `Down ${Math.abs(trend30).toFixed(0)}% in 30 days and not yet leveling off.`);
    else if (trend30 <= -5) add(0, `Down ${Math.abs(trend30).toFixed(0)}% in 30 days.`);
  }
  if (trend90 != null && days >= 60) {
    if (trend90 >= 10 && (trend30 == null || (trend30 > -5 && trend30 < 25))) add(1, `Up ${trend90.toFixed(0)}% over 90 days.`);
    else if (trend90 <= -20) add(-1, `Down ${Math.abs(trend90).toFixed(0)}% over 90 days.`);
  }
  // Where today's price sits between the window's low and high.
  if (stats && stats.high.price > stats.low.price && days >= 30) {
    const pos = (stats.last.price - stats.low.price) / (stats.high.price - stats.low.price);
    if (pos >= 0.9 && (trend30 ?? 0) >= 10) add(-1, `At the top of its ${days}-day range (${usd(stats.low.price)}–${usd(stats.high.price)}).`);
    else if (pos <= 0.15 && (trend30 ?? 0) > -5) add(1, `Near the bottom of its ${days}-day range and holding there.`);
  }
  if (typeTrend && typeTrend.median != null) {
    const m = typeTrend.median;
    const where = `${typeTrend.label} cards (${typeTrend.n} tracked)`;
    if (m >= 5) add(1, `${where} are up a median ${m.toFixed(0)}% over ${typeTrend.days} days: collectors are moving into this type.`);
    else if (m <= -5) add(-1, `${where} are down a median ${Math.abs(m).toFixed(0)}% over ${typeTrend.days} days.`);
    else add(0, `${where} are flat over ${typeTrend.days} days (median ${m >= 0 ? '+' : ''}${m.toFixed(1)}%).`);
    if (trend30 != null && m >= 5 && trend30 < m - 10) add(1, `This card is lagging its type (${trend30 >= 0 ? '+' : ''}${trend30.toFixed(0)}% vs. ${m.toFixed(0)}%), which can mean it hasn't caught the wave yet.`);
  }
  if (setPublished) {
    const ageDays = Math.floor((now - Date.parse(setPublished)) / DAY);
    if (ageDays >= 0 && ageDays < 120) add(-1, `The set came out ${ageDays < 45 ? 'weeks' : 'a few months'} ago. New-set prices usually fall while boxes are still being opened.`);
    else if (ageDays >= 730 && sealed) add(1, `Sealed from a set released ${Math.floor(ageDays / 365)} years ago. Out-of-print sealed tends to climb, unless it gets reprinted.`);
    else if (ageDays >= 730) add(0, `The set is ${Math.floor(ageDays / 365)} years old, so no new supply is coming from fresh packs.`);
  }

  const score = signals.reduce((a, s) => a + s.score, 0);
  const enough = days >= 14 || typeTrend != null;
  const lean =
    !enough ? { key: 'none', label: 'Not enough history' }
    : score >= 2 ? { key: 'hold', label: 'Leans hold' }
    : score <= -2 ? { key: 'sell', label: 'Leans sell now' }
    : { key: 'neutral', label: 'No clear lean' };
  return { lean, score, signals: signals.sort((a, b) => Math.abs(b.score) - Math.abs(a.score)), historyDays: days };
}

function usd(n) {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
