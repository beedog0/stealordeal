// Matching marketplace listing titles to TCGplayer products.
// Pure functions only, so the same file runs in the service worker and in Node tests.

const ALIASES = [
  [/\betb\b/g, 'elite trainer box'],
  [/\bupc\b/g, 'ultra premium collection'],
  [/\bspc\b/g, 'super premium collection'],
  [/\bpkmn\b/g, 'pokemon'],
  [/\bbooster bx\b/g, 'booster box'],
  // TCGplayer calls Magic booster boxes "displays".
  [/\bdisplay\b/g, 'box'],
];

// Words that describe the listing rather than the product.
const NOISE = new Set(
  ('a an and of the for with in on to from by new brand sealed factory nm near mint lp mp hp dmg '
    + 'played light moderately heavily damaged english eng en mint condition card cards tcg ccg '
    + 'pokemon mtg magic gathering yugioh free shipping ship fast us usa authentic official '
    + 'genuine rare holo reverse foil nonfoil non graded raw single singles look see pics photos '
    + 'psa bgs cgc sgc gem lot x1 1x qty')
    .split(' '),
);

export function normalize(s) {
  let out = String(s ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9/]+/g, ' ');
  for (const [re, rep] of ALIASES) out = out.replace(re, rep);
  return out.replace(/\s+/g, ' ').trim();
}

export function tokens(s) {
  // Card numbers (199/165) are matched separately; other slashes ("FULL ART/PIKACHU") separate words.
  return normalize(s)
    .split(' ')
    .flatMap((t) => (/^[a-z]{0,5}\d+[a-z]?\/[a-z]{0,5}\d+$/.test(t) ? [] : t.split('/')))
    .filter((t) => t && !NOISE.has(t));
}

const stripZeros = (s) => s.replace(/^([a-z]*)0+(?=\d)/, '$1');

// "199/165" -> { num: '199', total: '165' }; "TG12/TG30" -> { num: 'tg12', total: 'tg30' }.
export function parseNumber(s) {
  const m = String(s ?? '').toLowerCase().match(/([a-z]{0,5}\d{1,4}[a-z]?)\s*\/\s*([a-z]{0,5}\d{1,4})/);
  if (m) return { num: stripZeros(m[1]), total: stripZeros(m[2]) };
  const single = String(s ?? '').toLowerCase().trim();
  return single ? { num: stripZeros(single), total: '' } : null;
}

// TCGplayer category ids.
export const POKEMON = 3;
export const POKEMON_JP = 85;
export const MAGIC = 1;

const JAPANESE = /\b(jp|jpn|japan|japanese)\b|[\u3040-\u30ff\u4e00-\u9faf]|\b(s|sv|sm)\d{1,2}[a-z]\b/;
const POKEMON_WORDS = /pok[eé]mon|pkmn|\b(vstar|vmax|v-union|gx|tag team|trainer gallery|illustration rare|special art rare|sar|chr)\b/;
const MAGIC_WORDS = /\bmtg\b|magic the gathering|magic: the gathering|planeswalker|\bcommander\b/;

// Which catalogs to search. Page hints (eBay's category and item specifics) beat the title.
//   hints: { game: 'pokemon' | 'magic' | null, language: 'japanese' | 'english' | null }
export function gamesFor(lower, hints = {}) {
  const japanese = hints.language ? hints.language === 'japanese' : JAPANESE.test(lower);
  const game = hints.game ?? (POKEMON_WORDS.test(lower) ? 'pokemon' : MAGIC_WORDS.test(lower) ? 'magic' : null);
  if (game === 'pokemon') return japanese ? [POKEMON_JP] : [POKEMON];
  if (game === 'magic') return [MAGIC];
  return japanese ? [POKEMON_JP, MAGIC] : null;
}

export function parseTitle(title, hints = {}) {
  const raw = String(title ?? '');
  const lower = raw.toLowerCase();
  const numbers = [];
  for (const m of lower.matchAll(/([a-z]{0,5}\d{1,4}[a-z]?)\s*\/\s*([a-z]{0,5}\d{1,4})\b/g)) {
    numbers.push({ num: stripZeros(m[1]), total: stripZeros(m[2]) });
  }
  for (const m of lower.matchAll(/#\s*([a-z]{0,5}\d{1,4}[a-z]?)\b/g)) numbers.push({ num: stripZeros(m[1]), total: '' });

  const g = lower.match(/\b(psa|bgs|cgc|sgc|tag|ace)\s*(?:gem\s*(?:mint|mt)\s*)?(10|[1-9](?:\.5)?)\b/);
  const grade = g ? { company: g[1].toUpperCase(), grade: g[2] } : null;

  let finish = null;
  if (/reverse\s*holo|\brh\b/.test(lower)) finish = 'reverse';
  else if (/\b(foil|holo|holofoil|etched)\b/.test(lower) && !/non[\s-]?foil/.test(lower)) finish = 'foil';
  if (/1st\s*edition/.test(lower)) finish = finish ? `1st ${finish}` : '1st';

  const lot = /\b(lot|playset|bundle of|set of)\b|\bx\s?[2-9]\b|\b[2-9]\s?x\b/.test(lower);
  return { tokens: tokens(raw), numbers, grade, finish, lot, games: gamesFor(lower, hints) };
}

// Build an in-memory search structure from an index.json payload.
export function buildSearch(catId, data) {
  const products = data.products.map((r) => ({
    catId,
    productId: r[0],
    name: r[1],
    groupId: r[2],
    number: r[3],
    rarity: r[4],
    sealed: r[5] === 1,
    subtypes: r[6] ? r[6].split('|') : [],
    nameTokens: [...new Set(tokens(r[1]))],
    parsedNumber: parseNumber(r[3]),
  }));
  const groups = {};
  for (const [gid, [name, abbr, published]] of Object.entries(data.groups)) {
    groups[gid] = { name, abbr, published, tokens: [...new Set([...tokens(name), ...tokens(abbr)])] };
  }
  const byToken = new Map();
  const byNumber = new Map();
  const byId = new Map();
  products.forEach((p, i) => {
    byId.set(p.productId, i);
    for (const t of p.nameTokens) {
      if (!byToken.has(t)) byToken.set(t, []);
      byToken.get(t).push(i);
    }
    if (p.parsedNumber) {
      const k = p.parsedNumber.num;
      if (!byNumber.has(k)) byNumber.set(k, []);
      byNumber.get(k).push(i);
    }
  });
  const n = products.length || 1;
  const idf = (t) => Math.log(1 + n / (byToken.get(t)?.length ?? 0.5));
  return { catId, updated: data.updated, products, groups, byToken, byNumber, byId, idf };
}

function numberScore(p, numbers) {
  if (!numbers.length) return 0;
  if (!p.parsedNumber) return p.sealed ? -2 : 0;
  let best = -3;
  for (const { num, total } of numbers) {
    if (num !== p.parsedNumber.num) continue;
    if (total && p.parsedNumber.total) best = Math.max(best, total === p.parsedNumber.total ? 5 : 1);
    // "183/172" in the title vs a product numbered just "183": weak evidence.
    else best = Math.max(best, total ? 1 : 3);
  }
  return best;
}

export function scoreProduct(search, p, q, qset) {
  const { idf } = search;
  let nameTotal = 0;
  let nameHit = 0;
  let nameMiss = 0;
  for (const t of p.nameTokens) {
    const w = idf(t);
    nameTotal += w;
    if (qset.has(t)) nameHit += w;
    else nameMiss++;
  }
  if (!nameHit) return -Infinity;
  const group = search.groups[p.groupId];
  let groupHit = 0;
  let groupTotal = 0;
  for (const t of group?.tokens ?? []) {
    const w = Math.min(idf(t), 4);
    groupTotal += w;
    if (qset.has(t) && !p.nameTokens.includes(t)) groupHit += w;
  }
  // How much of the title the product explains, so "Charizard ex" loses to
  // "Charizard ex Super Premium Collection" when the title says all of that.
  let queryTotal = 0;
  let queryHit = 0;
  for (const t of qset) {
    if (!search.byToken.has(t)) continue;
    const w = Math.min(idf(t), 6);
    queryTotal += w;
    if (p.nameTokens.includes(t) || group?.tokens.includes(t)) queryHit += w;
  }
  let score = 6 * (nameHit / nameTotal) + 3 * (queryTotal ? queryHit / queryTotal : 0);
  score += groupTotal ? 2 * (groupHit / groupTotal) : 0;
  score += numberScore(p, q.numbers);
  // Each extra word in the product name ("Case", "Code Card", "Showcase") is a variant the title didn't ask for.
  score -= 0.6 * Math.min(nameMiss, 4);
  return score;
}

// Returns up to `limit` candidates, best first: [{ product, score }].
export function search(searchIndex, q, limit = 5) {
  const parsed = typeof q === 'string' ? parseTitle(q) : q;
  const qset = new Set(parsed.tokens);
  const candidates = new Set();
  const n = searchIndex.products.length;
  for (const t of qset) {
    const list = searchIndex.byToken.get(t);
    // Very common words ("box", "ex") are scored but don't seed candidates.
    if (list && list.length < Math.max(2000, n * 0.05)) for (const i of list) candidates.add(i);
  }
  for (const { num } of parsed.numbers) for (const i of searchIndex.byNumber.get(num) ?? []) candidates.add(i);
  if (!candidates.size) {
    for (const t of qset) for (const i of searchIndex.byToken.get(t) ?? []) candidates.add(i);
  }
  const scored = [];
  for (const i of candidates) {
    const p = searchIndex.products[i];
    const s = scoreProduct(searchIndex, p, parsed, qset);
    if (s > 2) scored.push({ product: p, score: s });
  }
  scored.sort((a, b) => b.score - a.score || (b.product.groupId - a.product.groupId));
  // Drop weak tail matches that only share a common word with the query.
  const floor = (scored[0]?.score ?? 0) * 0.6;
  return scored.filter((r) => r.score >= floor).slice(0, limit);
}

// Search several categories (one buildSearch result each) and merge.
export function searchAll(indexes, q, limit = 5) {
  const parsed = typeof q === 'string' ? parseTitle(q) : q;
  const pool = parsed.games ? indexes.filter((ix) => parsed.games.includes(ix.catId)) : indexes;
  return (pool.length ? pool : indexes)
    .flatMap((ix) => search(ix, parsed, limit))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function confidence(results) {
  if (!results.length) return 'none';
  const [a, b] = results;
  if (a.score >= 9 && (!b || a.score - b.score >= 1)) return 'high';
  if (a.score >= 6) return 'medium';
  return 'low';
}

// Pick the printing (TCGplayer "subtype") the title most likely refers to.
export function pickSubtype(subtypes, finish) {
  const find = (re) => subtypes.find((s) => re.test(s));
  if (finish?.includes('1st')) {
    const first = find(/1st edition/i);
    if (first) return first;
  }
  if (finish?.includes('reverse')) return find(/reverse/i) ?? subtypes[0];
  if (finish?.includes('foil')) return find(/^(?!.*reverse).*(foil|holo)/i) ?? subtypes[0];
  return find(/^normal$/i) ?? find(/^unlimited$/i) ?? find(/^holofoil$/i) ?? subtypes[0];
}
