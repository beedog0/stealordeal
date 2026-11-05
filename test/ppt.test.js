import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeShape, mergePoints, pptGradedHistory, pptGradedPrice, pptHistoryPoints, pptUrl } from '../extension/src/ppt.js';

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

test('reads graded eBay prices in several shapes', () => {
  const psa10 = { company: 'PSA', grade: '10' };
  assert.deepEqual(pptGradedPrice({ data: [{ ebay: { psa10: { avg: 450, count: 12 } } }] }, psa10), { price: 450, sales: 12, lastSale: null });
  assert.deepEqual(pptGradedPrice({ data: [{ ebay: { psa9: { avg: 90 }, psa10: { avg: 450 } } }] }, { company: 'PSA', grade: '9' }), { price: 90, sales: null, lastSale: null });
  assert.equal(pptGradedPrice({ data: { ebay: { PSA: { 10: { average: 300 } } } } }, psa10).price, 300);
  assert.equal(pptGradedPrice({ data: [{ ebay: { graded: { bgs_9_5: { median: 120 } } } }] }, { company: 'BGS', grade: '9.5' }).price, 120);
  assert.equal(pptGradedPrice({ data: [{ ebay: { psa10: { avg: 450 } } }] }, { company: 'CGC', grade: '10' }), null);
  assert.equal(pptGradedPrice({ data: [{}] }, psa10), null);
});

test('describes a response shape without its values', () => {
  const shape = describeShape({ data: [{ name: 'Charizard ex', prices: { market: 1 }, list: [1, 2] }] });
  assert.deepEqual(shape, { data: ['1 items', { name: 'string(Charizard ex)', prices: { market: 1 }, list: ['2 items', 1] }] });
});

test('reads per-grade eBay history and prefers salesByGrade for the current price', () => {
  const body = {
    data: [{
      ebay: {
        salesByGrade: { psa10: { count: 42, smartMarketPrice: 189.5, averagePrice: 200 } },
        priceHistory: {
          psa10: [
            { date: '2026-10-01', averagePrice: 170 },
            { date: '2026-10-08', averagePrice: 180 },
          ],
          psa9: { '2026-10-01': { average: 60 } },
        },
      },
    }],
  };
  const psa10 = { company: 'PSA', grade: '10' };
  assert.deepEqual(pptGradedPrice(body, psa10), { price: 189.5, sales: 42, lastSale: null });
  assert.deepEqual(pptGradedHistory(body, psa10), [
    { date: '2026-10-01', price: 170 },
    { date: '2026-10-08', price: 180 },
  ]);
  assert.deepEqual(pptGradedHistory(body, { company: 'PSA', grade: '9' }), [{ date: '2026-10-01', price: 60 }]);
  assert.deepEqual(pptGradedHistory(body, { company: 'CGC', grade: '10' }), []);
  // psa1 must not pick up psa10.
  assert.deepEqual(pptGradedHistory(body, { company: 'PSA', grade: '1' }), []);
});
