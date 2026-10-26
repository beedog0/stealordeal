#!/usr/bin/env node
// Checks title matching against a real catalog built by build-data.mjs.
//   node scripts/smoke.mjs site/data
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { buildSearch, confidence, searchAll } from '../extension/src/match.js';

const dir = process.argv[2] ?? 'site/data';
const lines = [];
const log = (line) => {
  lines.push(line);
  console.log(line);
};
const CASES = [
  ['Pokemon Charizard ex 199/165 Special Illustration Rare SV 151 NM', /^Charizard ex - 199\/165/],
  ['Pokemon TCG Surging Sparks Elite Trainer Box ETB Factory Sealed', /Surging Sparks.*Elite Trainer Box/],
  ['Umbreon ex 161/131 Prismatic Evolutions SIR Pokemon', /^Umbreon ex - 161\/131/],
  ['Pokemon Prismatic Evolutions Booster Bundle Sealed', /Prismatic Evolutions Booster Bundle/],
  ['Pikachu ex 238/191 Surging Sparks Pokemon Card', /^Pikachu ex - 238\/191/],
  ['Lugia V Alternate Art 186/195 Silver Tempest', /Lugia V/],
  ['Umbreon VMAX 215/203 Evolving Skies Alt Art Moonbreon', /Umbreon VMAX.*215\/203/],
  ['Pokemon 151 Ultra Premium Collection UPC Sealed', /151 Ultra Premium Collection/],
  ['Pokemon Surging Sparks Booster Box 36 Packs', /Surging Sparks Booster Box/],
  ['MTG Sheoldred, the Apocalypse Dominaria United DMU 107 NM', /^Sheoldred, the Apocalypse/],
  ['Magic the Gathering Bloomburrow Play Booster Box Sealed', /Bloomburrow Play Booster Box/],
  ['MTG The One Ring Lord of the Rings LTR 246', /^The One Ring/],
];

const indexes = [];
for (const catId of [3, 1]) {
  const file = path.join(dir, String(catId), 'index.json');
  const { size } = await stat(file);
  const t0 = performance.now();
  const ix = buildSearch(catId, JSON.parse(await readFile(file, 'utf8')));
  const histDir = path.join(dir, String(catId), 'h');
  let histBytes = 0;
  const histFiles = await readdir(histDir);
  for (const f of histFiles) histBytes += (await stat(path.join(histDir, f))).size;
  log(`category ${catId}: ${ix.products.length} products, index ${(size / 1e6).toFixed(1)} MB, ${histFiles.length} history files ${(histBytes / 1e6).toFixed(1)} MB, built in ${(performance.now() - t0).toFixed(0)} ms`);
  indexes.push(ix);
}

let failed = 0;
for (const [title, want] of CASES) {
  const t0 = performance.now();
  const res = searchAll(indexes, title, 3);
  const ms = (performance.now() - t0).toFixed(0);
  const got = res[0]?.product;
  const ok = got && want.test(got.name);
  if (!ok) failed++;
  log(`${ok ? 'PASS' : 'FAIL'} [${confidence(res)}, ${ms} ms] ${title}`);
  for (const r of res) log(`     ${r.score.toFixed(2)}  ${r.product.name}  (${ix(r).groups[r.product.groupId]?.name})`);
}
function ix(r) {
  return indexes.find((i) => i.catId === r.product.catId);
}
log(`${CASES.length - failed}/${CASES.length} matched`);
// CI: surface the whole report as one annotation, readable from the checks API.
if (process.env.GITHUB_ACTIONS) {
  const esc = (t) => t.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  console.log(`::notice title=Matching report::${esc(lines.join('\n'))}`);
}
process.exit(failed ? 1 : 0);
