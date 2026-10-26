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

const failures = [];
let mergedDays = 0;

for (const date of dates) {
  const work = await mkdtemp(path.join(tmpdir(), 'fm-'));
  const archive = path.join(work, 'prices.7z');
  const res = await fetch(`https://tcgcsv.com/archive/tcgplayer/prices-${date}.ppmd.7z`, {
    headers: { 'User-Agent': config.userAgent },
  });
  if (!res.ok) {
    failures.push(`${date}: HTTP ${res.status} ${res.statusText} ${(await res.text()).slice(0, 120).replace(/\s+/g, ' ')}`);
    console.warn(failures.at(-1));
    await rm(work, { recursive: true, force: true });
    await sleep(500);
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
  if (groups) mergedDays++;
  else failures.push(`${date}: archive had no ${config.categories.map((c) => c.id).join('/')} folders (top level: ${(await readdir(work)).join(', ')})`);
  await rm(work, { recursive: true, force: true });
  await sleep(500);
}

console.log(`Backfill merged ${mergedDays} of ${dates.length} days`);
if (failures.length && process.env.GITHUB_ACTIONS) {
  const esc = (t) => t.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  console.log(`::warning title=Backfill problems::${esc(failures.slice(0, 20).join('\n'))}`);
}
// A backfill that merged nothing would silently publish empty history, so fail instead.
if (dates.length && !mergedDays) process.exit(1);
