import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mergePoints, pptHistoryPoints, pptUrl } from '../extension/src/ppt.js';

test('builds card and sealed URLs', () => {
  assert.match(pptUrl(517045, false), /\/cards\?tcgPlayerId=517045&includeHistory=true&days=90/);
  assert.match(pptUrl(502002, true), /\/sealed-products\?tcgPlayerId=502002/);
});

test('reads the documented variants[printing][condition] shape', () => {
  const body = {
    data: [{
      priceHistory: {
        variants: {
          Holofoil: {
            'Near Mint': [
              { date: '2026-10-02T00:00:00.000Z', market: 250 },
              { date: '2026-10-01T00:00:00.000Z', market: 240 },
            ],
            'Lightly Played': [{ date: '2026-10-01', market: 200 }],
          },
          'Reverse Holofoil': { 'Near Mint': [{ date: '2026-10-01', market: 5 }] },
        },
      },
    }],
  };
  assert.deepEqual(pptHistoryPoints(body, 'Holofoil'), [
    { date: '2026-10-01', price: 240 },
    { date: '2026-10-02', price: 250 },
  ]);
  assert.deepEqual(pptHistoryPoints(body, 'Reverse Holofoil'), [{ date: '2026-10-01', price: 5 }]);
});

test('reads a flat series and a date map', () => {
  assert.deepEqual(pptHistoryPoints({ data: { priceHistory: [{ date: '2026-10-01', price: 99 }] } }, 'Normal'), [
    { date: '2026-10-01', price: 99 },
  ]);
  assert.deepEqual(
    pptHistoryPoints({ data: [{ priceHistory: { variants: { normal: { nearMint: { '2026-10-03': { market: 7 } } } } } }] }, 'Normal'),
    [{ date: '2026-10-03', price: 7 }],
  );
});

test('returns nothing without history', () => {
  assert.deepEqual(pptHistoryPoints({ data: [] }, 'Normal'), []);
  assert.deepEqual(pptHistoryPoints({ data: [{ prices: { market: 1 } }] }, 'Normal'), []);
});

test('uses tracker history and appends only newer days of our own', () => {
  const merged = mergePoints(
    [{ date: '2026-10-01', price: 10 }, { date: '2026-10-02', price: 10.5 }],
    [{ date: '2026-09-30', price: 9 }, { date: '2026-10-02', price: 11 }, { date: '2026-10-03', price: 12 }],
  );
  assert.deepEqual(merged.map((p) => p.date), ['2026-10-01', '2026-10-02', '2026-10-03']);
  assert.equal(merged[1].price, 10.5);
});
