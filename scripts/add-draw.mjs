#!/usr/bin/env node
/*
 * Add, correct or delete ONE draw in data/<game>.json from the text of a GitHub issue.
 * The issue body (env ISSUE_BODY) looks like:
 *     game: mk6
 *     date: 2026-10-22
 *     draw: 26/113        (optional)
 *     main: 1 2 3 4 5 6
 *     bonus: 7
 *     special: no         (yes = this draw is on a day that is not a regular draw day)
 *     force: no           (yes = overwrite a different draw on that date, or skip the draw-number / duplicate checks)
 * or, to remove a wrongly entered draw:
 *     action: delete
 *     game: mk6
 *     date: 2026-11-23
 * Writes a short human-readable result to the file in RESULT_FILE (default result.md).
 * Exit code 0 = data written or already present, 1 = rejected.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAMES, DAYS, checkRow, mergeInto, serialise, parseDateAny } from './update.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const yes = (s) => /^(yes|y|true|1)$/i.test(s || '');
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function parseIssue(body) {
  const kv = {};
  for (const line of String(body || '').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z]+)\s*[:：]\s*(.*?)\s*$/);
    if (m) kv[m[1].toLowerCase()] = m[2];
  }
  const nums = (s) => String(s || '').split(/[^0-9]+/).filter(Boolean).map((x) => parseInt(x, 10));
  return { action: (kv.action || 'add').toLowerCase(), game: (kv.game || '').toLowerCase(), date: parseDateAny(kv.date), draw: (kv.draw || '').trim(),
    m: nums(kv.main).sort((a, b) => a - b), b: nums(kv.bonus).sort((a, b) => a - b), force: yes(kv.force), special: yes(kv.special) };
}

/* "26/113" -> [26, 113]; 2999 -> [0, 2999] */
const dnParts = (dn) => { if (dn == null) return null; if (typeof dn === 'number') return [0, dn]; const m = String(dn).match(/^(\d\d)\/(\d+)$/); return m ? [+m[1], +m[2]] : null; };
const sameNums = (a, b) => a.m.join() === b.m.join() && a.b.join() === b.b.join();

/* returns {ok, message, rows?} ; pure apart from reading `current` rows passed in */
export function applyDraw(req, current, today = new Date()) {
  const g = GAMES[req.game];
  if (!g) return { ok: false, message: `Unknown game "${req.game}". Use one of: ${Object.keys(GAMES).join(', ')}.` };
  if (!req.date) return { ok: false, message: 'Missing or invalid date (use YYYY-MM-DD).' };
  const old = current.find((r) => r.date === req.date);

  if (req.action === 'delete') {
    if (!old) return { ok: false, message: `No ${req.game} draw is stored for ${req.date}, nothing to delete.` };
    const rows = current.filter((r) => r.date !== req.date);
    return { ok: true, rows, message: `Deleted ${req.game} ${req.date}${old.dn != null ? ' (' + old.dn + ')' : ''}: main ${old.m.join(' ')} + bonus ${old.b.join(' ')}. Total ${rows.length} draws.` };
  }
  if (req.action !== 'add') return { ok: false, message: `Unknown action "${req.action}" (use add or delete).` };

  if (Date.parse(req.date) > today.getTime() + 36 * 3600 * 1000) return { ok: false, message: `Date ${req.date} is in the future.` };
  const wd = new Date(req.date + 'T00:00:00Z').getUTCDay();
  if (!DAYS[req.game].includes(wd) && !req.special)
    return { ok: false, message: `${req.date} is a ${WD[wd]}, but ${req.game} is normally drawn on ${DAYS[req.game].map((d) => WD[d]).join('/')}. If this really was a special draw, add "special: yes".` };

  let dn = null;
  if (req.draw) {
    if (req.game === 'mk6') { if (!/^\d\d\/\d{1,3}$/.test(req.draw)) return { ok: false, message: 'Mark Six draw number must look like 26/113.' }; dn = req.draw; }
    else { if (!/^\d+$/.test(req.draw)) return { ok: false, message: 'Draw number must be a number.' }; dn = parseInt(req.draw, 10); }
  }
  const row = { date: req.date, dn, m: req.m, b: req.b };
  if (!checkRow(req.game, row)) return { ok: false, message: `Numbers rejected: need ${g.mainN} different main numbers (1-${g.maxMain}) and ${g.bonusN} bonus number(s) (1-${g.maxBonus}). Got main [${req.m}] bonus [${req.b}].` };

  if (old && sameNums(old, row) && (dn == null || old.dn === dn)) return { ok: true, noChange: true, message: `Already stored for ${req.date}, nothing to change.` };
  if (old && !sameNums(old, row) && !req.force)
    return { ok: false, message: `${req.date} already has different numbers (main [${old.m}] bonus [${old.b}]). Nothing written. Add "force: yes" to overwrite.` };

  if (!req.force) {
    /* same numbers as another draw: almost always a double entry */
    const dup = current.slice(-400).find((r) => r.date !== req.date && sameNums(r, row));
    if (dup) return { ok: false, message: `These exact numbers were already drawn on ${dup.date}${dup.dn != null ? ' (' + dup.dn + ')' : ''}, so this looks like a duplicate entry. Nothing written. Add "force: yes" only if you checked.` };
    /* draw number must follow the neighbours */
    if (dn != null) {
      const others = current.filter((r) => r.date !== req.date);
      const clash = others.find((r) => r.dn != null && String(r.dn) === String(dn));
      if (clash) return { ok: false, message: `Draw number ${dn} is already used by ${clash.date}. Nothing written. Add "force: yes" only if you checked.` };
      const prev = [...others].reverse().find((r) => r.date < req.date && dnParts(r.dn)), next = others.find((r) => r.date > req.date && dnParts(r.dn));
      const cur = dnParts(dn);
      if (prev) {
        const p = dnParts(prev.dn);
        const expected = req.game === 'mk6' && p[0] !== cur[0] ? [cur[0], 1] : [p[0], p[1] + 1];
        if (!next && (cur[0] !== expected[0] || cur[1] !== expected[1]))
          return { ok: false, message: `Draw number ${dn} does not follow the previous draw ${prev.dn} (${prev.date}); expected ${req.game === 'mk6' ? String(expected[0]).padStart(2, '0') + '/' + expected[1] : expected[1]}. Nothing written. Add "force: yes" only if you checked.` };
        if (next && (cur[0] < p[0] || (cur[0] === p[0] && cur[1] <= p[1])))
          return { ok: false, message: `Draw number ${dn} is not after ${prev.dn} (${prev.date}). Nothing written.` };
      }
      if (next) { const n = dnParts(next.dn); if (cur[0] > n[0] || (cur[0] === n[0] && cur[1] >= n[1])) return { ok: false, message: `Draw number ${dn} is not before ${next.dn} (${next.date}). Nothing written.` }; }
    }
  }
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
