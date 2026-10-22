// node scripts/test-parsers.mjs  — checks the parsers, validation and merge with small made-up samples (no network).
import assert from 'node:assert/strict';
import { parseUkXml, parseUkCsv, parsePbJson, parseMk6Csv, parseMk6Json, parseDateAny, checkRow, mergeInto, AUTO } from './update.mjs';

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

const xml = '<?xml version="1.0"?><draw-results><game type="lotto"><draw><draw-number>3217</draw-number><draw-date>2026-10-21</draw-date></draw><balls><set>L1</set><ball number="1">21</ball><ball number="2">28</ball><ball number="3">3</ball><ball number="4">40</ball><ball number="5">9</ball><ball number="6">12</ball><ball number="7">18</ball></balls></game></draw-results>';
const x = parseUkXml(xml, 'lotto');
assert.deepEqual(x[0], { date: '2026-10-21', dn: 3217, m: [3, 9, 12, 21, 28, 40], b: [18] });

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

const kj = parseMk6Json(JSON.stringify({ code: 0, data: { list: [{ issue: '26/112', drawResult: '31,2,5,7,8,21,29', drawTime: '2026-10-20 21:30:00', code: 'hk6' }, { issue: 'x', drawResult: '1,2' }] } }));
assert.equal(kj.length, 1); assert.deepEqual(kj[0], { date: '2026-10-20', dn: '26/112', m: [2, 5, 7, 8, 21, 31], b: [29] }); assert.ok(checkRow('mk6', kj[0]));
console.log('mk6 json parser ok');
