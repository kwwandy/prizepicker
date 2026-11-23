// node scripts/test-parsers.mjs  — checks the parsers, validation and merge with small made-up samples (no network).
import assert from 'node:assert/strict';
import { parseUkXml, parseUkCsv, parsePbJson, parseMk6Csv, parseHkjc, parseDateAny, checkRow, mergeInto, AUTO } from './update.mjs';

assert.equal(parseDateAny('2026-09-30T00:00:00.000'), '2026-09-30');
assert.equal(parseDateAny('30-Sep-2026'), '2026-09-30');
assert.equal(parseDateAny('Wed 30th September 2026'), '2026-09-30');
assert.equal(parseDateAny('30/09/2026'), '2026-09-30');
assert.equal(parseDateAny('31/02/2026'), null);

const lotto = 'DrawDate,Ball 1,Ball 2,Ball 3,Ball 4,Ball 5,Ball 6,Bonus Ball,Ball Set,Machine,DrawNumber\n30-Sep-2026,41,3,12,9,27,55,18,5,Merlin,2999\n';
const l = parseUkCsv(lotto, 'lotto');
assert.deepEqual(l[0], { date: '2026-09-30', dn: 2999, m: [3, 9, 12, 27, 41, 55], b: [18] });
assert.ok(checkRow('lotto', l[0]));

const euro = 'DrawDate,Ball 1,Ball 2,Ball 3,Ball 4,Ball 5,Lucky Star 1,Lucky Star 2,UK Millionaire Maker,DrawNumber\n2026-10-02,50,1,22,33,44,12,2,X,1900\n';
const e = parseUkCsv(euro, 'euro');
assert.deepEqual(e[0].m, [1, 22, 33, 44, 50]); assert.deepEqual(e[0].b, [2, 12]); assert.ok(checkRow('euro', e[0]));

const tb = 'DrawDate,Ball 1,Ball 2,Ball 3,Ball 4,Ball 5,Thunderball,DrawNumber\n17-Oct-2026,28,9,18,23,27,1,3993\n';
assert.ok(checkRow('tb', parseUkCsv(tb, 'tb')[0]));

const xml = '<?xml version="1.0"?><draw-results><game type="lotto"><draw><draw-number>3217</draw-number><draw-date>2026-10-21</draw-date></draw><balls><set>L1</set><ball number="1">21</ball><ball number="2">28</ball><ball number="3">29</ball><ball number="4">37</ball><ball number="5">48</ball><ball number="6">57</ball><bonus-ball type="bonusball" number="1">25</bonus-ball></balls><balls><set>L2</set><ball number="1">4</ball><ball number="2">38</ball><ball number="3">43</ball><ball number="4">45</ball><ball number="5">51</ball><ball number="6">58</ball><bonus-ball type="bonusball" number="1">30</bonus-ball></balls></game></draw-results>';
const x = parseUkXml(xml, 'lotto');
assert.deepEqual(x[0], { date: '2026-10-21', dn: 3217, m: [21, 28, 29, 37, 48, 57], b: [25] });
const xe = '<draw-results><game type="euro"><draw><draw-number>1991</draw-number><draw-date>2026-10-20</draw-date></draw><balls><set>14</set><ball number="1">9</ball><ball number="2">15</ball><ball number="3">16</ball><ball number="4">37</ball><ball number="5">43</ball><bonus-ball type="luckystar" number="1">7</bonus-ball><bonus-ball type="luckystar" number="2">10</bonus-ball></balls><raffle number="1">VPKN28846</raffle></game></draw-results>';
assert.deepEqual(parseUkXml(xe, 'euro')[0].b, [7, 10]);

const sfl = 'DrawDate,Ball 1,Ball 2,Ball 3,Ball 4,Ball 5,Life Ball,DrawNumber\n2026-10-01,1,2,3,4,47,10,500\n';
assert.ok(checkRow('sfl', parseUkCsv(sfl, 'sfl')[0]));

const pb = JSON.stringify([{ draw_date: '2026-09-30T00:00:00.000', winning_numbers: '44 06 23 33 04 13', multiplier: '2' }, { draw_date: 'bad', winning_numbers: '1 2' }]);
const p = parsePbJson(pb);
assert.equal(p.length, 1); assert.deepEqual(p[0], { date: '2026-09-30', dn: null, m: [4, 6, 23, 33, 44], b: [13] }); assert.ok(checkRow('pb', p[0]));

const mk6 = 'draw_date,ball_1,ball_2,ball_3,ball_4,ball_5,ball_6,extra_ball,draw_year,draw_number_in_year,has_results\n2026-10-15,5,9,12,30,40,49,7,2026,110,true\n2026-10-17,,,,,,,,2026,111,false\n';
const k = parseMk6Csv(mk6);
assert.equal(k.length, 1); assert.deepEqual(k[0], { date: '2026-10-15', dn: '26/110', m: [5, 9, 12, 30, 40, 49], b: [7] }); assert.ok(checkRow('mk6', k[0]));

assert.ok(!checkRow('lotto', { date: '2026-01-01', m: [1, 1, 2, 3, 4, 5], b: [6] }), 'duplicates rejected');
assert.ok(!checkRow('mk6', { date: '2026-01-01', m: [1, 2, 3, 4, 5, 50], b: [6] }), 'out of range rejected');

const mg = mergeInto([{ date: '2026-01-01', dn: 1, m: [1], b: [2] }], [{ date: '2026-01-01', dn: null, m: [1], b: [2] }, { date: '2026-01-03', dn: 2, m: [3], b: [4] }]);
assert.equal(mg.added, 1); assert.equal(mg.changed, 0); assert.equal(mg.rows[0].dn, 1); assert.equal(mg.rows.length, 2);

assert.deepEqual(AUTO[1], []);
console.log('all parser tests passed');

const hk = JSON.stringify({ data: { lotteryDraws: [
  { year: '2026', no: 123, drawDate: '2026-11-19+08:00', status: 'Result', drawResult: { drawnNo: [45, 12, 18, 32, 47, 49], xDrawnNo: 41 } },
  { year: '2026', no: 124, drawDate: '2026-11-21+08:00', status: 'Open', drawResult: null },
  { year: '2026', no: 125, drawDate: '2026-11-24+08:00', drawResult: { drawnNo: [], xDrawnNo: null } }] } });
const hr = parseHkjc(hk);
assert.equal(hr.length, 1); assert.deepEqual(hr[0], { date: '2026-11-19', dn: '26/123', m: [12, 18, 32, 45, 47, 49], b: [41] }); assert.ok(checkRow('mk6', hr[0]));
assert.throws(() => parseHkjc('{"errors":[{"message":"bad"}]}'));
assert.deepEqual(AUTO[3].includes('mk6') && AUTO[5].includes('mk6') && AUTO[0].includes('mk6'), true);
console.log('hkjc parser ok');

import { parseIssue, applyDraw } from './add-draw.mjs';
const rq = parseIssue('game: mk6\ndate: 2026-10-22\ndraw: 26/113\nmain: 31 2 5 7 8 21\nbonus: 29\nforce: no\n');
assert.deepEqual(rq, { action: 'add', game: 'mk6', date: '2026-10-22', draw: '26/113', m: [2, 5, 7, 8, 21, 31], b: [29], force: false, special: false });
const base = [
  { date: '2026-10-17', dn: '26/111', m: [3, 13, 27, 29, 30, 40], b: [9] },
  { date: '2026-10-20', dn: '26/112', m: [2, 5, 7, 8, 21, 29], b: [31] }];
const now = new Date('2026-10-28T10:00:00Z');
const A = (o, rows = base) => applyDraw({ ...rq, ...o }, rows, now);
let r2 = A({}); assert.ok(r2.ok && r2.rows.length === 3 && r2.rows[2].dn === '26/113');
assert.ok(!A({ date: '2026-12-01' }).ok, 'future date');
assert.ok(!A({ m: [1, 1, 2, 3, 4, 5] }).ok, 'duplicate numbers in one draw');
assert.ok(!A({ game: 'xx' }).ok, 'unknown game');
assert.ok(!A({ date: '2026-10-20' }).ok, 'existing different date needs force');
assert.ok(A({ date: '2026-10-20', force: true, draw: '' }).ok, 'force overwrites');
assert.ok(A({ date: '2026-10-20', m: base[1].m, b: base[1].b, draw: '' }).noChange, 'same data = no change');
assert.ok(!A({ draw: 'abc' }).ok, 'bad draw label');
/* the mistakes that really happened */
assert.ok(/Mon/.test(A({ date: '2026-10-26' }).message) && !A({ date: '2026-10-26' }).ok, 'Monday is not a Mark Six day');
assert.ok(A({ date: '2026-10-26', special: true, draw: '26/113' }).ok, 'special draw on another weekday is allowed');
assert.ok(!A({ draw: '26/115' }).ok, 'draw number skips 113/114');
assert.ok(!A({ draw: '26/112' }).ok, 'draw number already used');
assert.ok(!A({ m: base[1].m, b: base[1].b }).ok, 'same numbers as an earlier draw = duplicate entry');
assert.ok(A({ draw: '26/115', force: true }).ok, 'force skips the sequence check');
assert.ok(A({ draw: '' }).ok, 'draw number optional');
/* new year restarts at 1 */
const ny = [{ date: '2026-12-29', dn: '26/145', m: [1, 2, 3, 4, 5, 6], b: [7] }];

const t2 = new Date('2027-01-03T00:00:00Z');
assert.ok(applyDraw({ ...rq, date: '2027-01-02', draw: '27/1', m: [8, 9, 10, 11, 12, 13], b: [14] }, ny, t2).ok, 'new year 27/1');
assert.ok(!applyDraw({ ...rq, date: '2027-01-02', draw: '27/2', m: [8, 9, 10, 11, 12, 13], b: [14] }, ny, t2).ok, 'new year must start at 27/1');
/* gap filling between two stored draws */
const gap = [{ date: '2026-10-17', dn: '26/111', m: [3, 13, 27, 29, 30, 40], b: [9] }, { date: '2026-10-22', dn: '26/114', m: [4, 11, 12, 16, 38, 48], b: [5] }];
assert.ok(applyDraw({ ...rq, date: '2026-10-20', draw: '26/112', m: [2, 5, 7, 8, 21, 29], b: [31] }, gap, now).ok, 'fill a gap');
assert.ok(!applyDraw({ ...rq, date: '2026-10-20', draw: '26/115', m: [2, 5, 7, 8, 21, 29], b: [31] }, gap, now).ok, 'gap fill number after next');
/* delete */
const d = applyDraw({ ...rq, action: 'delete', date: '2026-10-20' }, base, now); assert.ok(d.ok && d.rows.length === 1);
assert.ok(!applyDraw({ ...rq, action: 'delete', date: '2026-10-21' }, base, now).ok, 'delete missing date');
assert.ok(!applyDraw({ ...rq, action: 'remove' }, base, now).ok, 'unknown action');
/* every other game: weekday guard */
assert.ok(!applyDraw({ game: 'lotto', date: '2026-10-21', draw: '', m: [1, 2, 3, 4, 5, 6], b: [7], action: 'add' }, [], now).ok === false, 'Wed Lotto ok');
assert.ok(!applyDraw({ game: 'lotto', date: '2026-10-22', draw: '', m: [1, 2, 3, 4, 5, 6], b: [7], action: 'add' }, [], now).ok, 'Thu Lotto rejected');
console.log('add-draw tests ok');
