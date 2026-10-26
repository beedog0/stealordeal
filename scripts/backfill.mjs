#!/usr/bin/env node
// One-time history backfill from TCGCSV's daily price archives (available from 2024-02-08).
// Each archive is downloaded once, folded into the per-set history files, then deleted.
//
//   node scripts/backfill.mjs --days 90 --state state [--end YYYY-MM-DD]
//
// Needs `7z` on the PATH. Run build-data.mjs with --prev-dir state afterwards.
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { addDays, loadConfig, mergeHistory, results, sleep, snapshot } from './lib.mjs';

const { values: args } = parseArgs({
  options: {
    days: { type: 'string', default: '90' },
    state: { type: 'string', default: 'state' },
    end: { type: 'string' },
  },
});

const config = await loadConfig();
const end = args.end ?? addDays(new Date().toISOString().slice(0, 10), -1);
const days = Math.min(Number(args.days), config.historyDays);
const dates = Array.from({ length: days }, (_, i) => addDays(end, i - days + 1)).filter((d) => d >= '2024-02-08');

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

for (const date of dates) {
  const work = await mkdtemp(path.join(tmpdir(), 'sod-'));
  const archive = path.join(work, 'prices.7z');
  const res = await fetch(`https://tcgcsv.com/archive/tcgplayer/prices-${date}.ppmd.7z`, {
    headers: { 'User-Agent': config.userAgent },
  });
  if (!res.ok) {
    console.warn(`${date}: archive unavailable (HTTP ${res.status}), skipping`);
    await rm(work, { recursive: true, force: true });
    continue;
  }
  await writeFile(archive, Buffer.from(await res.arrayBuffer()));
  execFileSync('7z', ['x', '-y', `-o${work}`, archive], { stdio: 'ignore' });

  let groups = 0;
  for (const cat of config.categories) {
    const catDir = path.join(work, date, String(cat.id));
    let groupIds;
    try {
      groupIds = await readdir(catDir);
    } catch {
      continue;
    }
    for (const gid of groupIds) {
      const prices = results(JSON.parse(await readFile(path.join(catDir, gid, 'prices'), 'utf8')));
      const file = path.join(args.state, String(cat.id), 'h', `${gid}.json`);
      const merged = mergeHistory(await readJson(file), date, snapshot(prices), config.historyDays);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, JSON.stringify(merged));
      groups++;
    }
  }
  console.log(`${date}: merged ${groups} sets`);
  await rm(work, { recursive: true, force: true });
  await sleep(500);
}
