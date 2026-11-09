import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compStats, reconcile, rejectReason } from '../extension/src/comps.js';
import { assess } from '../extension/src/price.js';

const gengar = { name: 'Mega Gengar ex - 269/217', number: '269/217', catId: 3, sealed: false };
const psa10 = { company: 'PSA', grade: '10' };
const now = Date.parse('2026-11-09');

test('keeps only sales of the same card, grade and language', () => {
  const ok = (title) => rejectReason({ title, price: 120 }, gengar, psa10);
  assert.equal(ok('2026 Pokemon Ascended Heroes Mega Gengar ex 269/217 PSA 10 GEM MINT'), null);
  assert.equal(ok('Mega Gengar ex #269 Mega Attack Rare PSA 10'), null);
  assert.equal(ok('Mega Gengar ex 269/217 PSA 9 MINT'), 'different grade');
  assert.equal(ok('Mega Gengar ex 269/217 CGC 10 Pristine'), 'different grade');
  assert.equal(ok('Mega Gengar ex 269/217 BGS 10'), 'different grade');
  assert.equal(ok('Mega Gengar ex 269/217 Near Mint'), 'different grade');
  assert.equal(ok('Mega Gengar ex 120/217 PSA 10'), 'different number');
  assert.equal(ok('Mega Gengar ex PSA 10'), 'different number');
  assert.equal(ok('Mega Charizard ex 269/217 PSA 10'), 'different card');
  assert.equal(ok('Mega Gengar ex 269/217 PSA 10 Japanese'), 'different language');
  assert.equal(ok('Mega Gengar ex 269/217 PSA 10 lot of 2'), 'lot or not a real card');
  assert.equal(ok('Mega Gengar ex 269/217 PSA 10 x2'), 'lot or not a real card');
  // Raw listings drop the slabs.
  assert.equal(rejectReason({ title: 'Mega Gengar ex 269/217 NM', price: 30 }, gengar, null), null);
  assert.equal(rejectReason({ title: 'Mega Gengar ex 269/217 PSA 10', price: 120 }, gengar, null), 'graded');
  assert.equal(rejectReason({ title: 'Mega Gengar ex 269/217 graded slab', price: 120 }, gengar, null), 'graded');
});

const sale = (price, date, extra = {}) => ({ title: 'Mega Gengar ex 269/217 PSA 10', price, date, ...extra });

test('median of the most recent matching sales, best offers only as a fallback', () => {
  const sales = [
    sale(125, '2026-11-08'),
    sale(130, '2026-11-07'),
    sale(119.99, '2026-11-05'),
    sale(250, '2026-11-04', { bestOffer: true }),
    sale(135, '2026-11-02'),
    sale(240, '2026-06-01'), // older than 90 days
    { title: 'Mega Gengar ex 269/217 PSA 9', price: 70, date: '2026-11-08' },
  ];
  const s = compStats(sales, gengar, psa10, { now });
  assert.equal(s.count, 4);
  assert.equal(s.median, 127.5);
  assert.equal(s.low, 119.99);
  assert.equal(s.high, 135);
  assert.equal(s.lastSale, '2026-11-08');
  assert.equal(s.bestOffers, 0);
  assert.equal(s.rejected, 1);
  // With fewer than 3 exact sales, best offers count.
  const few = compStats([sale(125, '2026-11-08'), sale(250, '2026-11-04', { bestOffer: true }), sale(130, '2026-11-01')], gengar, psa10, { now });
  assert.equal(few.count, 3);
  assert.equal(few.bestOffers, 1);
  assert.equal(compStats([], gengar, psa10, { now }).count, 0);
});

test('sold comps override a tracker price that disagrees, and confirm one that agrees', () => {
  const tracked = { price: 236.3, source: 'graded', name: 'PSA 10', label: 'PSA 10 price', sales: 20, lastSale: '2026-11-08' };
  const stats = compStats([sale(125, '2026-11-08'), sale(130, '2026-11-07'), sale(119.99, '2026-11-05'), sale(135, '2026-11-02')], gengar, psa10, { now });
  const { reference, sold } = reconcile(tracked, stats, 'PSA 10');
  assert.equal(reference.source, 'sold');
  assert.equal(reference.price, 127.5);
  assert.equal(reference.tracker, 236.3);
  assert.equal(sold.used, true);
  assert.equal(Math.round(sold.diffPct), -46);

  // The screenshot case: $139.99 + $5.90 shipping was a "Strong buy" against $236; against sold prices it's overpriced.
  const a = assess({ price: 139.99, shipping: 5.9, taxRate: 8.25, discount: 10, reference, now });
  assert.equal(a.verdict.key, 'over');
  assert.equal(a.confidence, 'medium');
  assert.match(a.reasons[1], /Median of the last 4 eBay sales, the latest 1 day ago\. That is 46% below the PSA 10 price of \$236\.30/);

  const agree = reconcile({ ...tracked, price: 132 }, stats, 'PSA 10');
  assert.equal(agree.reference.source, 'graded');
  assert.equal(agree.sold.agree, true);
  assert.equal(agree.sold.used, false);

  // Too few sales: keep the tracker price.
  const thin = reconcile(tracked, { count: 2, median: 100 }, 'PSA 10');
  assert.equal(thin.reference, tracked);
  assert.equal(thin.sold.used, false);

  // No tracker price: sold comps fill in.
  const filled = reconcile({ price: null, source: 'graded', name: 'PSA 10', label: 'PSA 10 price' }, stats, 'PSA 10');
  assert.equal(filled.reference.price, 127.5);
  assert.equal(filled.sold.used, true);
});
