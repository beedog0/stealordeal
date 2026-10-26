import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSearch, confidence, parseTitle, pickSubtype, search } from '../extension/src/match.js';
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
  assert.equal(parseTitle('Pokemon Charizard').game, 3);
  assert.equal(parseTitle('MTG Sheoldred').game, 1);
});

test('picks the printing from the title', () => {
  assert.equal(pickSubtype(['Normal', 'Reverse Holofoil'], 'reverse'), 'Reverse Holofoil');
  assert.equal(pickSubtype(['Normal', 'Reverse Holofoil'], null), 'Normal');
  assert.equal(pickSubtype(['Normal', 'Foil'], 'foil'), 'Foil');
  assert.equal(pickSubtype(['Holofoil'], null), 'Holofoil');
  assert.equal(pickSubtype(['Unlimited', '1st Edition'], '1st'), '1st Edition');
});
