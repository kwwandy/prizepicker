#!/usr/bin/env node
/*
 * Update data/<game>.json from public sources.
 *
 *   node scripts/update.mjs                      -> same as --games auto
 *   node scripts/update.mjs --games all          -> every game
 *   node scripts/update.mjs --games lotto,euro   -> only these games
 *   node scripts/update.mjs --dry                -> fetch and report, write nothing
 *   node scripts/update.mjs --force              -> accept a source that disagrees with stored data
 *
 * "auto" picks the games that were drawn the day before the run (see AUTO below).
 * Only dates, draw numbers and the drawn numbers are stored. Prize money, sales and winners are never saved.
 * Needs Node 20 or newer (built-in fetch). No npm packages.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');

/* ---------------------------------------------------------------- games */
export const GAMES = {
  lotto: { mainN: 6, bonusN: 1, maxMain: 59, maxBonus: 59, minRows: 200 },
  sfl:   { mainN: 5, bonusN: 1, maxMain: 47, maxBonus: 10, minRows: 100 },
  euro:  { mainN: 5, bonusN: 2, maxMain: 50, maxBonus: 12, minRows: 200 },
  pb:    { mainN: 5, bonusN: 1, maxMain: 69, maxBonus: 42, minRows: 100 },
  tb:    { mainN: 5, bonusN: 1, maxMain: 39, maxBonus: 14, minRows: 200 },
  mk6:   { mainN: 6, bonusN: 1, maxMain: 49, maxBonus: 49, minRows: 500 },
};
/* run day (UTC weekday) -> games drawn the day before.
   Lotto Wed+Sat, Set for Life Mon+Thu, EuroMillions Tue+Fri, Powerball Mon+Wed+Sat, Mark Six Tue+Thu+Sat, Thunderball Tue+Wed+Fri+Sat. Monday is not scheduled. */
export const AUTO = { 0: ['lotto', 'pb', 'tb', 'mk6'], 1: [], 2: ['sfl', 'pb'], 3: ['euro', 'tb', 'mk6'], 4: ['lotto', 'pb', 'tb'], 5: ['sfl', 'mk6'], 6: ['euro', 'tb'] };

/* ---------------------------------------------------------------- helpers */
export function parseCSV(text) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); f = ''; if (row.length > 1 || row[0] !== '') rows.push(row); row = []; }
    else f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows;
}
const norm = (s) => String(s || '').replace(/^﻿/, '').toLowerCase().replace(/[^a-z0-9_]+/g, ' ').trim();
const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
function iso(y, m, d) {
  y = +y; m = +m; d = +d;
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
/* accepts 2026-09-30, 2026-09-30T00:00:00.000, 2026-09-30+08:00, 30-Sep-2026, 30 Sep 2026, Wed 30th September 2026, 30/09/2026 (UK order) */
export function parseDateAny(s) {
  s = String(s || '').trim(); let m;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return iso(m[1], m[2], m[3]);
  if ((m = s.match(/^(\d{4})\/(\d{2})\/(\d{2})/))) return iso(m[1], m[2], m[3]);
  if ((m = s.match(/^(?:[A-Za-z]+,?\s+)?(\d{1,2})(?:st|nd|rd|th)?[-\s/]+([A-Za-z]{3})[A-Za-z]*[-\s/,]+(\d{4})$/))) {
    const mo = MON[m[2].toLowerCase()]; return mo ? iso(m[3], mo, m[1]) : null;
  }
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) return iso(m[3], m[2], m[1]);
  return null;
}
const ints = (a) => a.map((x) => parseInt(String(x).trim(), 10));
const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

/* ---------------------------------------------------------------- parsers (each returns [{date, dn, m[], b[]}]) */
/* National Lottery "draw-history/csv": DrawDate, Ball 1..n, Bonus Ball / Life Ball / Lucky Star 1-2, ..., DrawNumber.
   Matched by header names so extra columns and column order do not matter. */
export function parseUkCsv(text, gid) {
  const g = GAMES[gid];
  const t = parseCSV(text);
  if (t.length < 2) throw new Error('CSV is empty');
  const h = t[0].map(norm);
  const cd = h.findIndex((x) => x.includes('date'));
  const balls = h.map((x, i) => [x, i]).filter(([x]) => /^(ball|number) \d+$/.test(x))
    .sort((a, b) => parseInt(a[0].split(' ')[1], 10) - parseInt(b[0].split(' ')[1], 10)).map(([, i]) => i);
  const bonusNames = { lotto: ['bonus ball'], sfl: ['life ball'], tb: ['thunderball'], euro: ['lucky star 1', 'lucky star 2'] }[gid];
  const cb = bonusNames.map((n) => h.indexOf(n));
  const cn = h.findIndex((x) => ['drawnumber', 'draw number', 'draw no', 'draw'].includes(x));
  if (cd < 0 || balls.length < g.mainN || cb.some((i) => i < 0)) throw new Error('unexpected CSV header: ' + t[0].join('|'));
  const out = [];
  for (let i = 1; i < t.length; i++) {
    const r = t[i]; const date = parseDateAny(r[cd]); if (!date) continue;
    const m = ints(balls.slice(0, g.mainN).map((c) => r[c])), b = ints(cb.map((c) => r[c]));
    const dn = cn >= 0 && /^\d+$/.test((r[cn] || '').trim()) ? parseInt(r[cn], 10) : null;
    out.push({ date, dn, m: m.sort((x, y) => x - y), b: b.sort((x, y) => x - y) });
  }
  return out;
}
/* National Lottery results feed (XML, latest draw only):
   <draw-results><game type="lotto"><draw><draw-number>3217</draw-number><draw-date>2026-10-21</draw-date>...</draw>
   <balls><set>L1</set><ball number="1">21</ball>...</balls>...</game></draw-results>
   Balls are taken in document order (sorted by their number attribute): first mainN are the main numbers, the next bonusN the bonus. */
export function parseUkXml(text, gid) {
  const g = GAMES[gid];
  if (!/<draw-results/i.test(text)) throw new Error('not an XML results feed');
  const out = [];
  const games = [...text.matchAll(/<game\b[^>]*>([\s\S]*?)<\/game>/gi)].map((m) => m[1]);
  for (const body of games.length ? games : [text]) {
    const date = parseDateAny((body.match(/<draw-date>([^<]+)<\/draw-date>/i) || [])[1]);
    const dnRaw = (body.match(/<draw-number>(\d+)<\/draw-number>/i) || [])[1];
    const balls = (body.match(/<balls\b[^>]*>([\s\S]*?)<\/balls>/i) || [])[1] || '';
    const grab = (re) => [...balls.matchAll(re)].map((m) => [parseInt(m[1], 10), parseInt(m[2], 10)]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
    const main = grab(/<ball\b[^>]*?number="(\d+)"[^>]*>\s*(\d+)\s*<\/ball>/gi);
    const bonus = grab(/<bonus-ball\b[^>]*?number="(\d+)"[^>]*>\s*(\d+)\s*<\/bonus-ball>/gi);
    const list = [...main, ...bonus];
    if (!date || main.length !== g.mainN || bonus.length !== g.bonusN) throw new Error(`cannot read draw from XML (date ${date}, ${main.length} balls, ${bonus.length} bonus); game block: ${JSON.stringify(body.slice(0, 1800))}`);
    out.push({ date, dn: dnRaw ? parseInt(dnRaw, 10) : null, m: main.sort((x, y) => x - y), b: bonus.sort((x, y) => x - y) });
  }
  return out;
}
const parseUk = (gid) => (t) => (/^\s*<\?xml|^\s*<draw-results/i.test(t) ? parseUkXml(t, gid) : parseUkCsv(t, gid));

/* New York open data "Lottery Powerball Winning Numbers: Beginning 2010" (Socrata JSON):
   [{"draw_date":"2026-09-30T00:00:00.000","winning_numbers":"04 06 23 33 44 13","multiplier":"2"}, ...] */
export function parsePbJson(text) {
  const j = JSON.parse(text);
  if (!Array.isArray(j)) throw new Error('expected a JSON array');
  const out = [];
  for (const r of j) {
    const date = parseDateAny(r.draw_date); const n = ints(String(r.winning_numbers || '').split(/\s+/).filter(Boolean));
    if (!date || n.length !== 6) continue;
    out.push({ date, dn: null, m: n.slice(0, 5).sort((x, y) => x - y), b: [n[5]] });
  }
  return out;
}
/* Hong Kong Mark Six CSV (Renavon): draw_date, ball_1..ball_6, extra_ball, draw_year, draw_number_in_year, has_results */
export function parseMk6Csv(text) {
  const t = parseCSV(text);
  if (t.length < 2) throw new Error('CSV is empty');
  const h = t[0].map(norm), ix = (n) => h.indexOf(n);
  const cd = ix('draw_date'), cx = ix('extra_ball'), cy = ix('draw_year'), cn = ix('draw_number_in_year'), cr = ix('has_results');
  const cb = [1, 2, 3, 4, 5, 6].map((i) => ix('ball_' + i));
  if (cd < 0 || cx < 0 || cb.some((i) => i < 0)) throw new Error('unexpected CSV header: ' + t[0].join('|'));
  const out = [];
  for (let i = 1; i < t.length; i++) {
    const r = t[i];
    if (cr >= 0 && !/^(1|true|t|yes)$/i.test((r[cr] || '').trim())) continue;
    const date = parseDateAny(r[cd]); if (!date) continue;
    const m = ints(cb.map((c) => r[c])).sort((x, y) => x - y), b = ints([r[cx]]);
    const yy = parseInt(r[cy], 10), nn = parseInt(r[cn], 10);
    out.push({ date, dn: yy > 0 && nn > 0 ? String(yy % 100).padStart(2, '0') + '/' + nn : null, m, b });
  }
  return out;
}

/* kclm.site (third-party JSON): {"data":[{"issue":"26/112","drawResult":"2,5,7,8,21,29,31","drawTime":"2026-10-20 21:30:00","code":"hk6"}, ...]}
   The array may be at the top level or nested; the 7 numbers are 6 main + extra. */
export function parseMk6Json(text) {
  const j = JSON.parse(text);
  const find = (v, d = 0) => {
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object' && d < 4) for (const k of Object.keys(v)) { const r = find(v[k], d + 1); if (r) return r; }
    return null;
  };
  const arr = find(j);
  if (!arr) throw new Error('no array in JSON');
  const out = [];
  for (const r of arr) {
    const date = parseDateAny(r.drawTime || r.draw_time || r.drawDate || r.date);
    const n = ints(String(r.drawResult || r.result || '').split(/[,\s+]+/).filter(Boolean));
    if (!date || n.length !== 7) continue;
    const im = String(r.issue || '').trim().match(/^(\d{4}|\d{2})\s*[\/-]?\s*(\d{1,3})$/);
    out.push({ date, dn: im ? String(parseInt(im[1], 10) % 100).padStart(2, '0') + '/' + parseInt(im[2], 10) : null,
      m: n.slice(0, 6).sort((x, y) => x - y), b: [n[6]] });
  }
  return out;
}

/* ---------------------------------------------------------------- sources, tried in order */
const NL = 'https://www.national-lottery.co.uk/results/';
export const SOURCES = {
  lotto: [{ name: 'national-lottery.co.uk (Lotto CSV)', url: NL + 'lotto/draw-history/csv', min: 1, parse: parseUk('lotto') }],
  sfl:   [{ name: 'national-lottery.co.uk (Set For Life CSV)', url: NL + 'set-for-life/draw-history/csv', min: 1, parse: parseUk('sfl') }],
  tb:    [{ name: 'national-lottery.co.uk (Thunderball CSV)', url: NL + 'thunderball/draw-history/csv', min: 1, parse: parseUk('tb') }],
  euro:  [{ name: 'national-lottery.co.uk (EuroMillions CSV)', url: NL + 'euromillions/draw-history/csv', min: 1, parse: parseUk('euro') }],
  pb:    [{ name: 'data.ny.gov (Powerball)', url: 'https://data.ny.gov/resource/d6yy-54nr.json?$order=draw_date%20DESC&$limit=5000', parse: parsePbJson }],
  mk6:   [{ name: 'renavon.com (Mark Six CSV)', url: 'https://renavon.com/data/hkjc/hkjc_marksix_results/download/csv', parse: parseMk6Csv },
         { name: 'kclm.site (Mark Six JSON, third party, latest draws only)', url: 'https://kclm.site/api/trial/drawResult?code=hk6&format=json&rows=300', min: 5, strict: true, parse: parseMk6Json }],
};

/* ---------------------------------------------------------------- validation & merge */
export function checkRow(gid, r) {
  const g = GAMES[gid];
  const ok = (a, n, max) => Array.isArray(a) && a.length === n && a.every((v) => Number.isInteger(v) && v >= 1 && v <= max);
  return /^\d{4}-\d{2}-\d{2}$/.test(r.date) && ok(r.m, g.mainN, g.maxMain) && ok(r.b, g.bonusN, g.maxBonus) && new Set(r.m).size === g.mainN;
}
/* merge by draw date; fresh data wins. Never removes anything. */
export function mergeInto(existing, fresh) {
  const map = new Map(); let added = 0, changed = 0;
  for (const r of existing) map.set(r.date, { date: r.date, dn: r.dn, m: r.m, b: r.b });
  for (const r of fresh) {
    const o = map.get(r.date);
    if (!o) added++; else if (o.m.join() !== r.m.join() || o.b.join() !== r.b.join()) changed++;
    map.set(r.date, { date: r.date, dn: r.dn != null ? r.dn : o ? o.dn : null, m: r.m, b: r.b });
  }
  return { rows: [...map.values()].sort(byDate), added, changed };
}
export function serialise(gid, source, rows) {
  const head = `{"game":${JSON.stringify(gid)},"updated":${JSON.stringify(new Date().toISOString().replace(/\.\d+Z$/, 'Z'))},"source":${JSON.stringify(source)},"rows":[\n`;
  return head + rows.map((r) => JSON.stringify([r.date, r.dn, r.m, r.b])).join(',\n') + '\n]}\n';
}

/* ---------------------------------------------------------------- network */
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function fetchText(url, retries = 2) {
  for (let i = 0; ; i++) {
    try {
      const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 60000);
      const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/csv,application/json,text/plain,*/*', 'accept-language': 'en-GB,en;q=0.9' }, signal: ctl.signal, redirect: 'follow' });
      clearTimeout(to);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      return await res.text();
    } catch (e) { if (i >= retries) throw e; await sleep(3000 * (i + 1)); }
  }
}

/* ---------------------------------------------------------------- one game */
export async function updateGame(gid, { dry = false, force = false, fetcher = fetchText } = {}) {
  const cfg = GAMES[gid]; const file = path.join(DATA, gid + '.json');
  const cur = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { game: gid, rows: [] };
  const curRows = (cur.rows || []).map((a) => ({ date: a[0], dn: a[1], m: a[2], b: a[3] }));
  let lastErr;
  for (const s of SOURCES[gid]) {
    try {
      const text = await fetcher(s.url);
      let fresh;
      try { fresh = s.parse(text, gid); }
      catch (e) { throw new Error(`${e.message}\n    first lines of the response: ${JSON.stringify(text.slice(0, 300))}`); }
      const valid = fresh.filter((r) => checkRow(gid, r));
      if (valid.length < (s.min ?? cfg.minRows)) throw new Error(`only ${valid.length} valid rows from ${s.name} (expected at least ${s.min ?? cfg.minRows}); first lines: ${JSON.stringify(text.slice(0, 300))}`);
      if (valid.length < fresh.length) console.log(`${gid}: ignored ${fresh.length - valid.length} rows that failed validation`);
      const m = mergeInto(curRows, valid);
      if (m.changed > 5 && !force) throw new Error(`${s.name} disagrees with the stored data on ${m.changed} draws, so nothing was written. Check the source, or re-run with force.`);
      if (m.rows.length < curRows.length) throw new Error('merge would shrink the data, refusing');
      if (s.strict) {
        const have = new Set(curRows.map((r) => r.date)); const overlap = valid.filter((r) => have.has(r.date)).length;
        if (overlap < 3) throw new Error(`${s.name}: only ${overlap} draws overlap the stored data, cannot cross-check, nothing written`);
        if (m.changed > 0) throw new Error(`${s.name}: ${m.changed} draws differ from the stored data, nothing written`);
      }
      const latest = m.rows[m.rows.length - 1];
      if (m.added + m.changed === 0) { console.log(`${gid}: already up to date (latest ${latest.date}) [${s.name}]`); return { gid, status: 'same', latest: latest.date }; }
      if (!dry) fs.writeFileSync(file, serialise(gid, s.name, m.rows));
      console.log(`${gid}: +${m.added} new, ${m.changed} corrected, ${m.rows.length} total, latest ${latest.date} [${s.name}]${dry ? ' (dry run)' : ''}`);
      return { gid, status: 'updated', added: m.added, changed: m.changed, latest: latest.date };
    } catch (e) { lastErr = e; console.error(`${gid}: ${s.name} failed: ${e.message}`); }
  }
  throw lastErr;
}

/* ---------------------------------------------------------------- main */
async function main() {
  const args = process.argv.slice(2);
  const opt = (n) => { const i = args.indexOf('--' + n); return i < 0 ? null : args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true; };
  const dry = !!opt('dry'), force = !!opt('force');
  let sel = String(opt('games') === true || opt('games') == null ? 'auto' : opt('games')).trim();
  let games;
  if (sel === 'auto') games = AUTO[new Date().getUTCDay()];
  else if (sel === 'all') games = Object.keys(GAMES);
  else games = sel.split(',').map((x) => x.trim()).filter(Boolean);
  const bad = games.filter((g) => !GAMES[g]); if (bad.length) { console.error('unknown game: ' + bad.join(', ')); process.exit(1); }
  console.log(`games to update (${sel}): ${games.join(', ') || 'none'}`);
  const results = []; let failed = 0;
  for (const gid of games) {
    try { results.push(await updateGame(gid, { dry, force })); }
    catch (e) { failed++; results.push({ gid, status: 'FAILED', error: String(e.message).split('\n')[0] }); console.error(`::error title=${gid} update failed::${String(e.message).split('\n')[0]}`); }
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    const lines = ['### Data update', '', '| game | result |', '|---|---|', ...results.map((r) => `| ${r.gid} | ${r.status === 'updated' ? `+${r.added} new, ${r.changed} corrected, latest ${r.latest}` : r.status === 'same' ? `up to date (latest ${r.latest})` : 'FAILED: ' + r.error} |`), ''];
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
  }
  process.exit(failed ? 2 : 0);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
