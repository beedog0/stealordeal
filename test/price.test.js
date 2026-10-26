import assert from 'node:assert/strict';
import { test } from 'node:test';
import { historyStats, parsePrice, rateDeal, seriesPoints } from '../extension/src/price.js';

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
