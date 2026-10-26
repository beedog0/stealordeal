import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isSealed, mergeHistory, snapshot } from '../scripts/lib.mjs';

const snap = (market) => snapshot([{ productId: 1, subTypeName: 'Normal', marketPrice: market, lowPrice: 1, midPrice: 2 }]);

test('appends days and pads gaps with null', () => {
  let h = mergeHistory(null, '2026-10-01', snap(10), 365);
  h = mergeHistory(h, '2026-10-02', snap(11), 365);
  h = mergeHistory(h, '2026-10-05', snap(12.345), 365);
  assert.equal(h.start, '2026-10-01');
  assert.equal(h.end, '2026-10-05');
  assert.deepEqual(h.m['1|Normal'], [10, 11, null, null, 12.35]);
  assert.deepEqual(h.cur['1|Normal'], [12.35, 1, 2]);
});

test('re-running the same day overwrites instead of appending', () => {
  let h = mergeHistory(null, '2026-10-01', snap(10), 365);
  h = mergeHistory(h, '2026-10-01', snap(15), 365);
  assert.deepEqual(h.m['1|Normal'], [15]);
});

test('trims to the window', () => {
  let h = null;
  for (let d = 1; d <= 5; d++) h = mergeHistory(h, `2026-10-0${d}`, snap(d), 3);
  assert.equal(h.start, '2026-10-03');
  assert.equal(h.end, '2026-10-05');
  assert.deepEqual(h.m['1|Normal'], [3, 4, 5]);
});

test('new products are padded to line up with existing ones', () => {
  let h = mergeHistory(null, '2026-10-01', snap(10), 365);
  const two = { ...snap(11), ...snapshot([{ productId: 2, subTypeName: 'Foil', marketPrice: 5 }]) };
  h = mergeHistory(h, '2026-10-02', two, 365);
  assert.deepEqual(h.m['2|Foil'], [null, 5]);
});

test('older days from a backfill keep the newest current prices', () => {
  let h = mergeHistory(null, '2026-10-05', snap(20), 365);
  h = mergeHistory(h, '2026-10-03', snap(18), 365);
  assert.equal(h.start, '2026-10-03');
  assert.deepEqual(h.m['1|Normal'], [18, null, 20]);
  assert.equal(h.cur['1|Normal'][0], 20);
});

test('detects sealed products', () => {
  assert.equal(isSealed({ name: 'Silver Tempest Booster Box', extendedData: [] }), true);
  assert.equal(isSealed({ name: 'Lugia VSTAR', extendedData: [{ name: 'Number', value: '139/195' }] }), false);
});
