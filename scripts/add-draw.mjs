#!/usr/bin/env node
/*
 * Add or correct ONE draw in data/<game>.json from the text of a GitHub issue.
 * The issue body (env ISSUE_BODY) looks like:
 *     game: mk6
 *     date: 2026-10-22
 *     draw: 26/113        (optional)
 *     main: 1 2 3 4 5 6
 *     bonus: 7
 *     force: no           (yes = overwrite a different draw already stored for that date)
 * Writes a short human-readable result to the file in RESULT_FILE (default result.md).
 * Exit code 0 = data written or already present, 1 = rejected.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAMES, checkRow, mergeInto, serialise, parseDateAny } from './update.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function parseIssue(body) {
  const kv = {};
  for (const line of String(body || '').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z]+)\s*[:：]\s*(.*?)\s*$/);
    if (m) kv[m[1].toLowerCase()] = m[2];
  }
  const nums = (s) => String(s || '').split(/[^0-9]+/).filter(Boolean).map((x) => parseInt(x, 10));
  return { game: (kv.game || '').toLowerCase(), date: parseDateAny(kv.date), draw: (kv.draw || '').trim(), m: nums(kv.main).sort((a, b) => a - b), b: nums(kv.bonus).sort((a, b) => a - b), force: /^(yes|y|true|1)$/i.test(kv.force || '') };
}

/* returns {ok, message, rows?} ; pure apart from reading `current` rows passed in */
export function applyDraw(req, current, today = new Date()) {
  const g = GAMES[req.game];
  if (!g) return { ok: false, message: `Unknown game "${req.game}". Use one of: ${Object.keys(GAMES).join(', ')}.` };
  if (!req.date) return { ok: false, message: 'Missing or invalid date (use YYYY-MM-DD).' };
  if (Date.parse(req.date) > today.getTime() + 36 * 3600 * 1000) return { ok: false, message: `Date ${req.date} is in the future.` };
  let dn = null;
  if (req.draw) {
    if (req.game === 'mk6') { if (!/^\d\d\/\d{1,3}$/.test(req.draw)) return { ok: false, message: 'Mark Six draw number must look like 26/113.' }; dn = req.draw; }
    else { if (!/^\d+$/.test(req.draw)) return { ok: false, message: 'Draw number must be a number.' }; dn = parseInt(req.draw, 10); }
  }
  const row = { date: req.date, dn, m: req.m, b: req.b };
  if (!checkRow(req.game, row)) return { ok: false, message: `Numbers rejected: need ${g.mainN} different main numbers (1-${g.maxMain}) and ${g.bonusN} bonus number(s) (1-${g.maxBonus}). Got main [${req.m}] bonus [${req.b}].` };
  const old = current.find((r) => r.date === req.date);
  if (old && old.m.join() === row.m.join() && old.b.join() === row.b.join() && (dn == null || old.dn === dn)) return { ok: true, noChange: true, message: `Already stored for ${req.date}, nothing to change.` };
  if (old && !(old.m.join() === row.m.join() && old.b.join() === row.b.join()) && !req.force)
    return { ok: false, message: `${req.date} already has different numbers (main [${old.m}] bonus [${old.b}]). Nothing written. Add "force: yes" to overwrite.` };
  const merged = mergeInto(current, [row]);
  return { ok: true, rows: merged.rows, message: `${old ? 'Corrected' : 'Added'} ${req.game} ${req.date}${dn != null ? ' (' + dn + ')' : ''}: main ${row.m.join(' ')} + bonus ${row.b.join(' ')}. Total ${merged.rows.length} draws.` };
}

function main() {
  const out = process.env.RESULT_FILE || 'result.md';
  const finish = (ok, msg) => { fs.writeFileSync(out, (ok ? '✅ ' : '❌ ') + msg + '\n'); console.log(msg); process.exit(ok ? 0 : 1); };
  const req = parseIssue(process.env.ISSUE_BODY);
  const file = path.join(ROOT, 'data', req.game + '.json');
  if (!GAMES[req.game]) return finish(false, applyDraw(req, []).message);
  const cur = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { rows: [] };
  const rows = (cur.rows || []).map((a) => ({ date: a[0], dn: a[1], m: a[2], b: a[3] }));
  const r = applyDraw(req, rows);
  if (!r.ok) return finish(false, r.message);
  if (r.rows) fs.writeFileSync(file, serialise(req.game, 'manual entry (issue)', r.rows));
  finish(true, r.message);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
