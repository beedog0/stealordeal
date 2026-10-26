#!/usr/bin/env node
// Daily build: pulls today's TCGplayer catalog and prices from TCGCSV and writes the
// static JSON the extension reads (published to GitHub Pages).
//
//   node scripts/build-data.mjs --out site [--prev-dir state | --prev-base https://.../data]
//
// Price history is carried forward from the previous build: either a local folder
// (after a backfill) or the currently published site.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { TCGCSV, fetchJson, indexRow, loadConfig, mergeHistory, results, snapshot } from './lib.mjs';

const { values: args } = parseArgs({
  options: {
    out: { type: 'string', default: 'site' },
    'prev-dir': { type: 'string' },
    'prev-base': { type: 'string' },
  },
});

const config = await loadConfig();
const ua = config.userAgent;

async function loadPrev(catId, groupId) {
  const rel = `${catId}/h/${groupId}.json`;
  if (args['prev-dir']) {
    try {
      return JSON.parse(await readFile(path.join(args['prev-dir'], rel), 'utf8'));
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  }
  if (args['prev-base']) return fetchJson(`${args['prev-base']}/${rel}`, { delayMs: 20 });
  return null;
}

async function writeJson(file, data) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data));
}

const updatedRaw = await fetch('https://tcgcsv.com/last-updated.txt', { headers: { 'User-Agent': ua } }).then((r) => r.text());
const date = new Date(updatedRaw.trim()).toISOString().slice(0, 10);
console.log(`TCGCSV build date ${date}`);

const dataDir = path.join(args.out, 'data');
const meta = { updated: date, builtAt: new Date().toISOString(), categories: [] };

for (const cat of config.categories) {
  const groups = results(await fetchJson(`${TCGCSV}/${cat.id}/groups`, { userAgent: ua }));
  const groupInfo = {};
  const rows = [];
  let priced = 0;
  for (const g of groups) {
    groupInfo[g.groupId] = [g.name, g.abbreviation ?? '', (g.publishedOn ?? '').slice(0, 10)];
    const products = results(await fetchJson(`${TCGCSV}/${cat.id}/${g.groupId}/products`, { userAgent: ua }));
    const prices = results(await fetchJson(`${TCGCSV}/${cat.id}/${g.groupId}/prices`, { userAgent: ua }));
    const subtypes = new Map();
    for (const p of prices) {
      if (!subtypes.has(p.productId)) subtypes.set(p.productId, []);
      subtypes.get(p.productId).push(p.subTypeName);
    }
    for (const product of products) {
      if (!subtypes.has(product.productId)) continue;
      rows.push(indexRow(product, subtypes.get(product.productId)));
    }
    const history = mergeHistory(await loadPrev(cat.id, g.groupId), date, snapshot(prices), config.historyDays);
    await writeJson(path.join(dataDir, String(cat.id), 'h', `${g.groupId}.json`), history);
    priced += prices.length;
  }
  await writeJson(path.join(dataDir, String(cat.id), 'index.json'), { updated: date, groups: groupInfo, products: rows });
  meta.categories.push({ id: cat.id, slug: cat.slug, name: cat.name, products: rows.length });
  console.log(`${cat.name}: ${groups.length} sets, ${rows.length} products, ${priced} prices`);
}

await writeJson(path.join(dataDir, 'meta.json'), meta);
await writeFile(
  path.join(args.out, 'index.html'),
  `<!doctype html><meta charset="utf-8"><title>Fairmark data</title>
<p>Price data for the Fairmark Chrome extension, updated ${date}.
Prices from TCGplayer via <a href="https://tcgcsv.com">TCGCSV</a>, with thanks.</p>`,
);
