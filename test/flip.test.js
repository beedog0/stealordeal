import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cardTypes, flip, flipCompare, hold, seriesChange, typeTrendBuilder } from '../extension/src/flip.js';

const keys = (name, rarity = '', number = '') => cardTypes({ catId: 3, name, rarity, number }).map((t) => t.key);

test('tags Pokémon card types from names and rarities', () => {
  assert.deepEqual(keys('Pikachu & Zekrom GX - 162/181'), ['tagteam']);
  assert.deepEqual(keys('Arceus VSTAR - 123/172'), ['vstar']);
  assert.deepEqual(keys('Umbreon VMAX (Alternate Art Secret) - 215/203', 'Secret Rare'), ['vmax', 'altart']);
  assert.deepEqual(keys('Charizard V - 019/073'), ['v']);
  assert.deepEqual(keys('Charizard ex - 199/165', 'Special Illustration Rare'), ['exsv', 'sir']);
  assert.deepEqual(keys('Charizard EX - 11/108'), ['exold']);
  assert.deepEqual(keys('M Charizard EX - 13/106'), ['mega']);
  assert.deepEqual(keys('Radiant Charizard - 020/159'), ['radiant']);
  assert.deepEqual(keys('Pikachu - TG05/TG30', 'Trainer Gallery Rare Holo', 'TG05/TG30'), ['tg']);
  assert.deepEqual(keys('Vaporeon'), []);
  assert.deepEqual(cardTypes({ catId: 1, name: 'Sol Ring' }), []);
  assert.deepEqual(cardTypes({ catId: 3, name: 'Arceus VSTAR Box', sealed: true }), []);
});

test('flip profit on eBay after fees, undercut and shipping', () => {
  const ebay = { venue: 'ebay' };
  const f = flip({ allIn: 60, resale: 100, settings: ebay });
  assert.equal(f.sale, 95);
  assert.equal(f.fees, 12.99); // 95 × 13.25% + $0.40
  assert.equal(f.ship, 5.5);
  assert.equal(f.net, 76.51);
  assert.equal(f.profit, 16.51);
  assert.equal(f.verdict.key, 'good');
  assert.equal(f.buyUnder, 71.51); // fees bind before the 80% target
  assert.equal(flip({ allIn: 75, resale: 100, settings: ebay }).verdict.key, 'fair');
  assert.equal(flip({ allIn: 90, resale: 100, settings: ebay }).verdict.key, 'over');
  // Cheap cards ship in an envelope; slabs never do.
  assert.equal(flip({ allIn: 5, resale: 12, settings: ebay }).ship, 1.25);
  assert.equal(flip({ allIn: 5, resale: 12, graded: true, settings: ebay }).ship, 5.5);
  // Per-venue overrides from Settings.
  assert.equal(flip({ allIn: 60, resale: 100, settings: { venue: 'ebay', venues: { ebay: { feeRate: 10, undercut: 0 } } } }).fees, 10.4);
  assert.equal(flip({ allIn: 10, resale: null }), null);
});

test('groups (the default) work like a vendor: buy at 80% of market, sell at market', () => {
  const f = flip({ allIn: 80, resale: 100 });
  assert.equal(f.venueKey, 'groups');
  assert.equal(f.sale, 100);
  assert.equal(f.fees, 3.98); // PayPal G&S 3.49% + $0.49
  assert.equal(f.ship, 0); // buyer pays
  assert.equal(f.buyUnder, 80);
  assert.equal(f.profit, 16.02);
  assert.equal(Math.round(f.pctOfMarket), 80);
  assert.equal(f.verdict.key, 'good');
  assert.equal(flip({ allIn: 85, resale: 100 }).verdict.key, 'fair'); // profitable, but over the 80% target
  const none = flip({ allIn: null, resale: 100 });
  assert.equal(none.verdict, null);
  assert.equal(none.buyUnder, 80);
  assert.equal(flip({ allIn: 80, resale: 100, settings: { venue: 'inperson' } }).net, 100);
  const cmp = flipCompare({ allIn: 80, resale: 100 });
  assert.deepEqual(cmp.map((c) => c.venueKey), ['groups', 'inperson', 'ebay', 'tcgplayer']);
  assert.equal(cmp.find((c) => c.venueKey === 'ebay').net, 76.51);
});

const now = Date.parse('2026-11-09');
const stats = (low, high, last, days) => ({ low: { price: low }, high: { price: high }, last: { price: last }, days });

test('hold leans on trends, range, card type and set age', () => {
  const pumped = hold({ stats: stats(50, 100, 98, 90), trend30: 40, trend90: 60, now });
  assert.equal(pumped.lean.key, 'sell');
  assert.match(pumped.signals.map((s) => s.text).join(' '), /Up 40% in 30 days/);

  const wave = { label: 'VSTAR', median: 12, up: 70, n: 40, days: 30 };
  const lagging = hold({ stats: stats(20, 24, 21, 90), trend30: 0, trend90: 2, typeTrend: wave, now });
  assert.equal(lagging.lean.key, 'hold');
  assert.match(lagging.signals.map((s) => s.text).join(' '), /lagging its type/);

  const fresh = hold({ stats: stats(30, 60, 32, 40), trend30: -30, setPublished: '2026-10-01', now });
  assert.equal(fresh.lean.key, 'sell');
  assert.match(fresh.signals.map((s) => s.text).join(' '), /New-set prices usually fall/);

  const oldSealed = hold({ stats: stats(90, 110, 110, 90), trend30: 6, trend90: 12, setPublished: '2021-11-12', sealed: true, now });
  assert.equal(oldSealed.lean.key, 'hold');

  assert.equal(hold({ stats: stats(1, 1, 1, 5), now }).lean.key, 'none');
});

test('type trends: median change per type across the catalog', () => {
  assert.equal(Math.round(seriesChange([10, null, 12], 30)), 20);
  assert.equal(seriesChange([null, 5], 30), null);
  const b = typeTrendBuilder(30);
  for (let i = 0; i < 10; i++) b.add({ catId: 3, name: `Mon${i} VSTAR - ${i}/100` }, [10, 10 + i], 10 + i);
  b.add({ catId: 3, name: 'Cheap VSTAR' }, [1, 2], 2); // under the price floor
  for (let i = 0; i < 3; i++) b.add({ catId: 3, name: `Mon${i} VMAX` }, [10, 20], 20); // too few to report
  const r = b.result();
  assert.equal(r.days, 2);
  assert.equal(r.types.vstar.n, 10);
  assert.equal(r.types.vstar.median, 45);
  assert.equal(r.types.vmax, undefined);
});
