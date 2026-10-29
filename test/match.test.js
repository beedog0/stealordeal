import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSearch, confidence, parseTitle, pickSubtype, search, searchAll } from '../extension/src/match.js';
import { pokemonIndex } from './fixture.js';

const ix = buildSearch(3, pokemonIndex);
const top = (title) => search(ix, title)[0]?.product.productId;

test('matches singles by card number', () => {
  assert.equal(top('Pokemon Charizard ex 199/165 SIR Scarlet & Violet 151 NM'), 517045);
  assert.equal(top('Charizard ex 006/165 Double Rare 151 Pokemon TCG'), 502589);
  assert.equal(top('Charizard EX 223/197 Obsidian Flames Special Illustration Rare'), 509000);
  assert.equal(top('Pikachu ex 238/191 Surging Sparks SIR Near Mint'), 565700);
});

test('matches numbers without leading zeros', () => {
  assert.equal(top('Charmander 4/165 reverse holo 151'), 502590);
});

test('matches sealed products and expands ETB', () => {
  assert.equal(top('Pokemon Surging Sparks ETB Elite Trainer Box Factory Sealed'), 565601);
  assert.equal(top('Surging Sparks Booster Box 36 packs sealed'), 565600);
  assert.equal(top('Pokemon 151 UPC Ultra Premium Collection NEW'), 502002);
  assert.equal(top('Pokémon TCG Scarlet & Violet 151 Booster Bundle'), 502000);
});

test('ranks the plain product above its case and code card', () => {
  const res = search(ix, 'Pokemon TCG Surging Sparks Elite Trainer Box ETB Factory Sealed');
  assert.equal(res[0].product.productId, 565601);
  assert.equal(confidence(res), 'high');
});

test('treats Magic booster displays as booster boxes', () => {
  const mtg = buildSearch(1, {
    updated: '2026-10-25',
    groups: { 24000: ['Bloomburrow', 'BLB', '2024-08-02'] },
    products: [
      [540000, 'Bloomburrow - Play Booster Pack', 24000, '', '', 1, 'Normal'],
      [540001, 'Bloomburrow - Play Booster Display', 24000, '', '', 1, 'Normal'],
      [540002, 'Bloomburrow - Play Booster Display Case', 24000, '', '', 1, 'Normal'],
    ],
  });
  assert.equal(search(mtg, 'Magic the Gathering Bloomburrow Play Booster Box Sealed')[0].product.productId, 540001);
});

test('prefers the full product name over a shorter one it contains', () => {
  assert.equal(top('Lugia V Alternate Full Art 186/195 Silver Tempest'), 451397);
  assert.equal(top('Lugia VSTAR 139/195 Silver Tempest'), 451396);
});

test('confidence is high for a clean numbered match', () => {
  assert.equal(confidence(search(ix, 'Charizard ex 199/165 Pokemon 151')), 'high');
  assert.equal(confidence(search(ix, 'random unrelated stuff')), 'none');
});

test('parses grades, finishes and lots', () => {
  assert.deepEqual(parseTitle('PSA 10 Gem Mint Charizard ex 199/165').grade, { company: 'PSA', grade: '10' });
  assert.deepEqual(parseTitle('CGC 9.5 Pikachu').grade, { company: 'CGC', grade: '9.5' });
  assert.equal(parseTitle('Charmander Reverse Holo 004/165').finish, 'reverse');
  assert.equal(parseTitle('Sheoldred Foil DMU').finish, 'foil');
  assert.equal(parseTitle('Pikachu x4 playset').lot, true);
  assert.equal(parseTitle('Pikachu ex 238/191').lot, false);
  assert.deepEqual(parseTitle('Pokemon Charizard').games, [3]);
  assert.deepEqual(parseTitle('MTG Sheoldred').games, [1]);
  assert.equal(parseTitle('Sheoldred').games, null);
});

test('works out the game and language', () => {
  assert.deepEqual(parseTitle('Mew 183/172 PSA 10 Full Art S12a VSTAR Universe JP').games, [85]);
  assert.deepEqual(parseTitle('POKEMON PIKACHU 001/025 25TH ANNIVERSARY COLLECTION JAPANESE PSA 10').games, [85]);
  assert.deepEqual(parseTitle('Mew VSTAR 183/172').games, [3]);
  assert.deepEqual(parseTitle('Pikachu 001/028', { game: 'pokemon', language: 'japanese' }).games, [85]);
  assert.deepEqual(parseTitle('Pikachu JP promo', { game: 'pokemon', language: 'english' }).games, [3]);
  assert.deepEqual(parseTitle('Black Lotus', { game: 'magic' }).games, [1]);
});

test('picks the printing from the title', () => {
  assert.equal(pickSubtype(['Normal', 'Reverse Holofoil'], 'reverse'), 'Reverse Holofoil');
  assert.equal(pickSubtype(['Normal', 'Reverse Holofoil'], null), 'Normal');
  assert.equal(pickSubtype(['Normal', 'Foil'], 'foil'), 'Foil');
  assert.equal(pickSubtype(['Holofoil'], null), 'Holofoil');
  assert.equal(pickSubtype(['Unlimited', '1st Edition'], '1st'), '1st Edition');
});

test('a bare number does not beat a full set number from another game', () => {
  const magic = buildSearch(1, {
    updated: '2026-10-25',
    groups: { 1: ['Oath of the Gatewatch', 'OGW', '2016-01-22'] },
    products: [[110000, 'Wastes (183) - Full Art', 1, '183', 'Common', 0, 'Normal|Foil']],
  });
  const japan = buildSearch(85, {
    updated: '2026-10-25',
    groups: { 2: ['S12a: VSTAR Universe', 'S12a', '2022-12-02'] },
    products: [[450000, 'Mew - 183/172', 2, '183/172', 'Art Rare', 0, 'Holofoil']],
  });
  const title = 'Mew 183/172 PSA 10 Gem Mint Full Art Holo Art Rare S12a VSTAR Universe JP';
  assert.equal(searchAll([ix, magic, japan], title)[0].product.productId, 450000);
  // Even with no language cue, the full 183/172 number wins over Magic's bare 183.
  assert.equal(searchAll([magic, japan], 'Mew 183/172 Full Art')[0].product.productId, 450000);
});

test('a stamped reprint named in the title beats the original set it also names', () => {
  const ix2 = buildSearch(3, {
    updated: '2026-10-28',
    groups: {
      1: ['SWSH11: Lost Origin', 'LOR', '2022-09-09'],
      2: ['Trick or Trade BOOster Bundle 2023', 'TOT23', '2023-09-01'],
      3: ['Prize Pack Series Cards', 'PPS', '2022-01-01'],
    },
    products: [
      [1, 'Gengar', 1, '066/196', 'Holo Rare', 0, 'Holofoil'],
      [2, 'Gengar (2022 Copyright Date)', 2, '066/196', 'Holo Rare', 0, 'Holofoil'],
      [3, 'Gengar - 066/196', 3, '066/196', 'Holo Rare', 0, 'Holofoil'],
    ],
  });
  const best = (t) => search(ix2, t)[0].product.productId;
  assert.equal(best('2022 Pokemon SWSH Lost Origin Gengar Promos Trick or Trade Holo #066/196 PSA 10'), 2);
  assert.equal(best('Pokemon Gengar 066/196 Lost Origin Holo Rare NM'), 1);
});
