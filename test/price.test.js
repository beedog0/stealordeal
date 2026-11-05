import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assess, historyStats, parsePrice, rateDeal, seriesPoints } from '../extension/src/price.js';

test('rates deals by distance from market', () => {
  assert.equal(rateDeal(70, 100).key, 'steal');
  assert.equal(rateDeal(90, 100).key, 'good');
  assert.equal(rateDeal(100, 100).key, 'fair');
  assert.equal(rateDeal(115, 100).key, 'pricey');
  assert.equal(rateDeal(140, 100).key, 'over');
  assert.equal(rateDeal(null, 100), null);
  assert.equal(rateDeal(10, null), null);
});

test('turns a history series into dated points and stats', () => {
  const h = { start: '2026-10-01', m: { 'a|Normal': [10, null, 12, 9] } };
  const pts = seriesPoints(h, 'a|Normal');
  assert.deepEqual(pts.map((p) => p.date), ['2026-10-01', '2026-10-03', '2026-10-04']);
  const s = historyStats(pts);
  assert.equal(s.low.price, 9);
  assert.equal(s.high.price, 12);
  assert.equal(Math.round(s.changePct), -10);
  assert.deepEqual(seriesPoints(h, 'a|Normal', 2).map((p) => p.price), [12, 9]);
});

test('parses prices', () => {
  assert.equal(parsePrice('US $1,234.50'), 1234.5);
  assert.equal(parsePrice('nothing'), null);
});

test('assesses all-in cost against market, with a max price', () => {
  const now = Date.parse('2026-10-29');
  const base = { taxRate: 8.25, discount: 10, now, reference: { price: 100, source: 'market', label: 'TCGplayer market price' } };
  const a = assess({ ...base, price: 70, shipping: 5 });
  assert.equal(a.tax, 6.19);
  assert.equal(a.allIn, 81.19);
  assert.equal(a.verdict.key, 'good');
  assert.equal(a.confidence, 'high');
  // (100 × 0.9) / 1.0825 − 5
  assert.equal(a.maxBid, 78.14);
  assert.equal(assess({ ...base, price: 60, shipping: 0 }).verdict.key, 'steal');
  assert.equal(assess({ ...base, price: 100, shipping: 10 }).verdict.key, 'over');
});

test('a falling market or thin sales tone the verdict down', () => {
  const now = Date.parse('2026-10-29');
  const base = { taxRate: 0, discount: 10, now, price: 60, shipping: 0 };
  const market = { price: 100, source: 'market', label: 'market' };
  assert.equal(assess({ ...base, reference: market, trend30: -37 }).verdict.key, 'good');
  assert.match(assess({ ...base, reference: market, trend30: -37 }).reasons.join(' '), /fell 37%/);
  const thin = assess({ ...base, reference: { price: 100, source: 'graded', name: 'PSA 10', label: 'PSA 10 price', sales: 2 } });
  assert.equal(thin.verdict, null);
  assert.match(thin.insufficient, /Only 2 recent PSA 10 sales/);
  const stale = assess({ ...base, reference: { price: 100, source: 'graded', name: 'PSA 10', label: 'PSA 10 price', sales: 40, lastSale: '2026-06-01' } });
  assert.equal(stale.confidence, 'low');
  assert.equal(stale.verdict.key, 'good');
  assert.equal(assess({ ...base, reference: market, match: 'medium' }).confidence, 'medium');
});

test('auctions get a max bid and a warning', () => {
  const a = assess({ taxRate: 0, discount: 10, price: 50, shipping: 0, auction: true, reference: { price: 100, source: 'market', label: 'market' } });
  assert.equal(a.auction, true);
  assert.equal(a.maxBid, 90);
  assert.match(a.reasons.at(-1), /current bid will likely rise/);
});

test('a long slide counts as falling too', () => {
  const a = assess({ taxRate: 0, discount: 10, price: 60, shipping: 0, trend30: -10, trend90: -30, reference: { price: 100, source: 'market', label: 'market' } });
  assert.equal(a.verdict.key, 'good');
  assert.match(a.reasons.join(' '), /fell 30% in the last 90 days/);
});
