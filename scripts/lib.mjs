// Shared helpers for the daily data build and the history backfill.
import { readFile } from 'node:fs/promises';

export const TCGCSV = 'https://tcgcsv.com/tcgplayer';

export async function loadConfig() {
  const url = new URL('../data.config.json', import.meta.url);
  return JSON.parse(await readFile(url, 'utf8'));
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Fetch JSON with retries. Returns null on 404 so callers can tell "missing"
// apart from "failed"; any other failure throws after the last retry.
export async function fetchJson(url, { userAgent, retries = 3, delayMs = 150 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(1000 * 2 ** attempt);
    try {
      const res = await fetch(url, { headers: userAgent ? { 'User-Agent': userAgent } : {} });
      await sleep(delayMs);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

// TCGCSV responses are { success, errors, results }; archive files use the same shape.
export const results = (body) => (Array.isArray(body) ? body : body?.results ?? []);

export function extField(product, name) {
  const f = (product.extendedData ?? []).find((e) => e.name === name);
  return f ? String(f.value) : '';
}

const SEALED_WORDS = /\b(booster|box|pack|bundle|tin|collection|deck|case|display|blister|kit|chest|binder|portfolio|sleeves|set)\b/i;

// A product is a single card when TCGplayer gives it a card number or rarity.
export function isSealed(product) {
  if (extField(product, 'Number') || extField(product, 'Rarity')) return false;
  return SEALED_WORDS.test(product.name ?? '');
}

export const priceKey = (p) => `${p.productId}|${p.subTypeName}`;

const round2 = (n) => (n == null ? null : Math.round(n * 100) / 100);

// Compact snapshot of one day's prices: key -> [market, low, mid].
export function snapshot(priceRows) {
  const out = {};
  for (const p of priceRows) {
    out[priceKey(p)] = [round2(p.marketPrice), round2(p.lowPrice), round2(p.midPrice)];
  }
  return out;
}

const DAY = 86400000;
export const dayDiff = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);
export const addDays = (date, n) => new Date(Date.parse(date) + n * DAY).toISOString().slice(0, 10);

// History file for one set (group): daily market prices aligned to `start`.
//   { v: 1, start: 'YYYY-MM-DD', end: 'YYYY-MM-DD', m: { key: [price|null, ...] }, cur: { key: [market, low, mid] } }
export function mergeHistory(prev, date, snap, maxDays) {
  const h = prev && prev.v === 1 ? { ...prev, m: { ...prev.m } } : { v: 1, start: date, m: {} };
  let idx = dayDiff(h.start, date);
  if (idx < 0) {
    // Older than anything we have (backfill out of order): shift everything right.
    for (const k of Object.keys(h.m)) h.m[k] = [...Array(-idx).fill(null), ...h.m[k]];
    h.start = date;
    idx = 0;
  }
  const keys = new Set([...Object.keys(h.m), ...Object.keys(snap)]);
  for (const k of keys) {
    const arr = (h.m[k] ?? []).slice();
    while (arr.length <= idx) arr.push(null);
    if (snap[k]) arr[idx] = snap[k][0];
    h.m[k] = arr;
  }
  // Pad every series to the same length so index i always means start + i days.
  let len = Math.max(idx + 1, ...Object.values(h.m).map((a) => a.length));
  for (const k of keys) while (h.m[k].length < len) h.m[k].push(null);
  if (len > maxDays) {
    const drop = len - maxDays;
    for (const k of keys) h.m[k] = h.m[k].slice(drop);
    h.start = addDays(h.start, drop);
    len = maxDays;
  }
  // Drop series that have no price at all in the window.
  for (const k of keys) if (h.m[k].every((v) => v == null)) delete h.m[k];
  h.end = addDays(h.start, len - 1);
  // `cur` always reflects the newest day we have seen.
  if (!prev?.cur || dayDiff(prev.end ?? prev.start, date) >= 0) h.cur = snap;
  return h;
}

// One search-index row per product:
//   [productId, name, groupId, number, rarity, sealed (0|1), subtypes joined by '|']
export function indexRow(product, subtypes) {
  return [
    product.productId,
    product.name,
    product.groupId,
    extField(product, 'Number'),
    extField(product, 'Rarity'),
    isSealed(product) ? 1 : 0,
    subtypes.join('|'),
  ];
}
