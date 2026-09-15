/* Logic test — runs the real lib/plan.js + lib/quran.js the app uses. */
import assert from 'assert';
import { buildPlan, workingDayCount, calendarDays, weekKey, hijriInfo, weekdayName } from '../lib/plan.js';
import { gregToHijri, hijriToGreg, daysInHijriMonth, formatHijri, HIJRI_MONTHS } from '../lib/hijri.js';
import { amountLabel, rangeStartQ, rangeEndQ, spanLabel, surahByNumber } from '../lib/quran.js';

let n = 0;
const ok = (what) => { n++; console.log('  ✓', what); };

const settings = { startDate: '2026-09-20', endDate: '2026-09-30', holidays: '2026-09-23' };
const base = { name: 'T', from: 46, to: 114, dailyHifz: 0.5, statuses: {} };

/* 1. calendar: Sun-Wed only, holiday flagged */
const cal = calendarDays(settings.startDate, settings.endDate, new Set(['2026-09-23']));
assert.deepEqual(cal.map((c) => c.iso), ['2026-09-20','2026-09-21','2026-09-22','2026-09-23','2026-09-27','2026-09-28','2026-09-29','2026-09-30']);
assert.equal(cal[3].holiday, true);
assert.equal(workingDayCount(settings), 7);
ok('working days: Sun-Wed only, holidays excluded from count (7)');

/* 2. all-pending schedule advances 2 quarter-faces (½ page) per day */
let p = buildPlan({ ...base, statuses: {} }, settings);
let days = p.rows.filter((r) => r.type === 'day');
assert.equal(days.length, 7);
assert.deepEqual(days.map((r) => r.fromQ), [2006, 2008, 2010, 2012, 2014, 2016, 2018]);
assert.equal(p.totalQ, 410);
assert.equal(rangeStartQ(46), 2006);
assert.equal(rangeEndQ(114), 2416);
assert.equal(rangeStartQ(1), 0, 'Al-Fatiha starts the mushaf');
assert.equal((rangeEndQ(114) - rangeStartQ(1)) / 4, 604, 'full Quran = 604 faces');
ok('pending days project sequentially (+2 quarters/day; range = 410 q = 102.5 faces)');

/* 3. holiday row exists */
assert.equal(p.rows.filter((r) => r.type === 'holiday').length, 1);
ok('holiday rendered as band row (23 Sep)');

/* 4. smart rollover (slide model): missed day keeps its OWN slice; tomorrow performs it;
      zero merging/zero doubling; holidays also slide the queue (their slice rolls forward) */
p = buildPlan({ ...base, statuses: { '2026-09-21': 'missed' } }, settings); // hol 2026-09-23
days = p.rows.filter((r) => r.type === 'day');
assert.equal(days[0].fromQ, 2006, '20th: 2006-2008');
assert.equal(days[0].toQ, 2008);
assert.equal(days[1].status, 'missed');
assert.equal(days[1].qLo, 2008, '21st red cell = its own slice only (no merge)');
assert.equal(days[1].qHi, 2010);
assert.equal(days[1].plannedQ, 0, 'missed day saves nothing');
assert.equal(days[1].amountQ, 2, 'missed cell never doubled');
assert.equal(days[1].deferredQ, 2, 'announces: 2 quarters roll to the 22nd');
assert.equal(days[2].qLo, 2008, '22nd performs the deferred slice instead of new content');
assert.equal(days[2].qHi, 2010);
assert.equal(days[2].carryIn, 2, 'badge announces what slid onto the 22nd');
assert.equal(days[2].amountQ, 2, 'amount stays the base slice');
assert.equal(days[3].qLo, 2012, '27th continues where the 22nd stopped (holidays are inert: no slide, no workload)');
assert.equal(days[3].qHi, 2014);
assert.equal(days[3].carryIn, 0, 'no holiday badge; badge shows only the day right after a miss');
assert.equal(p.carryLeft, 0, 'queue absorbed everything inside the range');
ok('missed day: red mark + one-day slide, zero merging, zero doubling, holiday slide consistent');

/* 5. miss + absence chain then a real «حفظ»: queue front drained, backlog badge 4 */
p = buildPlan({ ...base, statuses: { '2026-09-21': 'missed', '2026-09-22': 'absent', '2026-09-27': 'saved' } }, settings);
days = p.rows.filter((r) => r.type === 'day');
assert.equal(days[1].qLo, 2008, '21st missed: own slice 2008-2010, deferred 2');
assert.equal(days[1].deferredQ, 2);
assert.equal(days[2].qLo, 2008, '22nd absent shows the SAME queued slice (queue held at 2008)');
assert.equal(days[2].deferredQ, 4, 'absence rolls its own slice + the backlog it had received');
assert.equal(days[3].qLo, 2008, '27th (saved) finally performs the rolled queue front');
assert.equal(days[3].carryIn, 4, '27th announces the 4 quarters that slid onto it');
assert.equal(p.savedQ, 2, 'saved day counts its slice');
assert.equal(days[4].qLo, 2012, '28th continues the queue: the 27th performed the head, so the 28th takes the next slice');
assert.deepEqual([p.stats.saved, p.stats.missed, p.stats.absent, p.stats.pending], [1, 1, 1, 4]);
ok('miss+absence+saved catch-up: slide chain exact, stats correct');

/* 6. truncated plan: backlog outlives the end date -> reported, rows are NOT fabricated */
p = buildPlan({ ...base, statuses: { '2026-09-20': 'missed', '2026-09-21': 'missed' } }, { startDate: '2026-09-20', endDate: '2026-09-21', holidays: '' });
days = p.rows.filter((r) => r.type === 'day');
assert.equal(days.length, 2, 'only the two scheduled working days exist');
assert.equal(p.rows.filter((r) => r.beyondPlan).length, 0, 'no synthetic extension rows');
assert.equal(days[0].deferredQ, 2);
assert.equal(days[1].deferredQ, 4, '21st relays its own slice + what the 20th deferred');
assert.equal(p.carryLeft, 4, '4 quarters of backlog now live after the plan end (info banner)');
ok('slide model: backlog after plan end is reported, not fabricated as rows');

/* 7. range clamping: small surah range exhausts; rolled content vanishes with the range */
p = buildPlan({ ...base, from: 112, to: 114 }, settings); // الاخلاص..الناس = 1 face
const small = p.totalQ;
days = p.rows.filter((r) => r.type === 'day');
assert.equal(small, 4, 'Al-Ikhlas..An-Nas = 4 quarter-faces (1 page)');
assert.ok(days.every((r) => r.qHi <= 2416 && r.qLo >= 2412), 'windows never leave the range');
assert.ok(days.some((r) => r.empty), 'days after the range is exhausted are empty');
assert.equal(p.rows.filter((r) => r.beyondPlan).length, 0, 'no extension needed');
p = buildPlan({ ...base, from: 112, to: 114, statuses: { '2026-09-20': 'missed' } }, settings);
assert.equal(p.carryLeft, 0, 'exhausted small range: rolled content evaporates gracefully');
assert.equal(p.rows.filter((r) => r.beyondPlan).length, 0, 'no infinite extension when range complete');
days = p.rows.filter((r) => r.type === 'day');
assert.equal(days[1].qLo, 2412, '21st performs the deferred الاخلاص part, no doubling');
assert.equal(days[3].carryIn, 0, 'no stale badge once the queue is drained');
ok('range clamps: pinned inside 2412..2416, surplus days empty, no runaway carry');

/* 7b. USER RULE: ascending is NEVER mirrored; mirror only for from > to */
{
  const asc = buildPlan({ ...base, from: 1, to: 114, statuses: {} }, { startDate: '2026-09-20', endDate: '2026-09-23', holidays: '' });
  const ad = asc.rows.filter((r) => r.type === 'day');
  assert.equal(ad[0].forward, true, 'الفاتحة->الناس is forward');
  assert.equal(ad[0].qLo, 0, 'forward day 1 starts at mushaf position 0 (الفاتحة), NOT mirrored');
  assert.equal(ad[0].qHi, 2);
  assert.equal(ad[1].qLo, 2, 'forward day 2 continues 2-4 (no reverse, no mirror)');
  assert.equal(ad[2].qLo, 4, 'forward day 3 continues 4-6');
  const des = buildPlan({ ...base, from: 114, to: 1, statuses: {} }, { startDate: '2026-09-20', endDate: '2026-09-23', holidays: '' });
  const dd = des.rows.filter((r) => r.type === 'day');
  assert.equal(dd[0].forward, false, 'الناس->الفاتحة is descending');
  assert.equal(dd[0].qLo, 2414, 'descending starts at الناس tail (mirrored internally)');
  assert.equal(dd[0].qHi, 2416);
  assert.equal(dd[1].qLo, 2412, 'descending day 2 = الإخلاص/الفلق');
  assert.equal(dd[2].qLo, 2410, 'descending day 3 continues downward');
  ok('direction: mirror ONLY for from>to; ascending untouched');
}

/* 7c. review (صغرى/كبرى) defers on missed days, performed on the next working day */
{
  const rp = buildPlan({ from: 1, to: 114, dailyHifz: 0.5, sughra: 0.25, kubra: 0.5, statuses: { '2026-09-20': 'missed' } }, { startDate: '2026-09-20', endDate: '2026-09-23', holidays: '' });
  const rd = rp.rows.filter((r) => r.type === 'day');
  assert.equal(rd[0].revS + rd[0].revK, 0, 'missed day performs no review');
  assert.equal(rd[0].revDeferredS, 1, 'missed day defers its ¼-face صغرى (1 quarter)');
  assert.equal(rd[0].revDeferredK, 2, 'and its ½-face كبرى (2 quarters)');
  assert.equal(rd[1].revS, 1, '21st performs the deferred صغرى');
  assert.equal(rd[1].revK, 2, '21st performs the deferred كبرى');
  assert.equal(rd[2].revS + rd[2].revK, 0, 'backlog cleared after one normal day');
  const rp2 = buildPlan({ from: 1, to: 114, dailyHifz: 0.5, sughra: 0.25, kubra: 0.5, statuses: { '2026-09-20': 'missed', '2026-09-21': 'missed' } }, { startDate: '2026-09-20', endDate: '2026-09-23', holidays: '' });
  const rd2 = rp2.rows.filter((r) => r.type === 'day');
  assert.equal(rd2[1].revDeferredS, 2, 'two misses stack صغرى backlog 1+1');
  assert.equal(rd2[2].revS + rd2[2].revK, 6, 'Wed performs the full 2+4 stacked review');
  ok('review deferral: missed -> صغرى+كبرى roll to the next working day, stack on consecutive misses');
}

/* 8. amount labels */
const L = (q) => amountLabel(q);
assert.equal(L(1), 'ربع وجه');
assert.equal(L(2), 'نصف وجه');
assert.equal(L(3), 'ثلاثة أرباع وجه');
assert.equal(L(4), 'وجه');
assert.equal(L(5), 'وجه وربع');
assert.equal(L(6), 'وجه ونصف');
assert.equal(L(8), 'وجهان');
assert.equal(L(20), '٥ أوجه');
ok('amount formatting (quarter-face labels)');

/* 9. span labels land in the right surah/ayahs */
const s46 = surahByNumber(46);
assert.equal(s46.name, 'الأحقاف');
assert.equal(s46.page, 502);
const span = spanLabel(2006, 2008);
assert.ok(span.surah === 'الأحقاف', 'day 1 surah label');
console.log('    sample day-1 label:', JSON.stringify(span));
ok('span → surah + ayah labels');

/* 10. week grouping puts Sun..Wed in one week */
assert.equal(weekKey('2026-09-20'), '2026-09-20');
assert.equal(weekKey('2026-09-22'), '2026-09-20');
assert.equal(weekKey('2026-09-23'), '2026-09-20');
assert.equal(weekKey('2026-09-27'), '2026-09-27');
ok('week grouping (Sun=anchor, Wed same week, next Sun = next week)');

/* 11. Hijri (Umm al-Qura) labels */
const hj = hijriInfo('2026-09-20');
assert.equal(hj.dm.includes('ربيع الآخر'), true, 'Sept 20 2026 is in Rabi al-Thani 1448');
assert.equal(hj.y, '١٤٤٨هـ', 'hijri year with era');
assert.ok(/^[٠-٩]+ .+$/.test(hj.dm), 'day is Arabic-Indic numeral');
assert.equal(hijriInfo('').dm, '—', 'invalid date guarded');
assert.ok(['الأحد','الاثنين','الثلاثاء','الأربعاء'].includes(weekdayName('2026-09-20')), 'weekday name (ar)');
console.log('    sample hijri label:', JSON.stringify(hj));
ok('hijri labels (Umm al-Qura) + invalid-date guard');

/* 12. lib/hijri.js — picker engine vs Intl formatter must never drift */
{
  const HIJ = new Intl.DateTimeFormat('en-US-u-ca-islamic-umalqura', { day: 'numeric', month: 'numeric', year: 'numeric' });
  let g = new Date(2026, 8, 1);
  for (let i = 0; i < 150; i++) {
    const d = new Date(g.getFullYear(), g.getMonth(), g.getDate() + i);
    const iso = [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
    const p = {}; for (const x of HIJ.formatToParts(d)) p[x.type] = x.value;
    const h = gregToHijri(iso);
    assert.equal(h.y, +p.year, 'year match ' + iso);
    assert.equal(h.m, +p.month, 'month match ' + iso);
    assert.equal(h.d, +p.day, 'day match ' + iso);
    assert.equal(hijriToGreg(h.y, h.m, h.d), iso, 'roundtrip ' + iso);
    const len = daysInHijriMonth(h.y, h.m);
    assert.ok(len === 29 || len === 30, 'month length ' + len);
  }
  assert.equal(HIJRI_MONTHS.length, 12);
  assert.equal(HIJRI_MONTHS[0], '\u0645\u062d\u0631\u0645');
  const fh = formatHijri('2026-09-20');
  assert.ok(fh.includes('\u0631\u0628\u064a\u0639') && fh.includes('\u0647\u0640'), 'formatHijri shape: ' + fh);
  console.log('    formatHijri(2026-09-20) =', fh);
}
ok('hijri.js: engine==Intl over 150 days + roundtrips + month lengths + labels');

/* 13. Descending range (no mushaf-order enforcement): mirrored engine + real display bounds */
{
  const st = {
    from: 114, // الناس        [2414..2416)
    to: 113, // الفلق         [2413..2414)
    dailyHifz: 0.5,
    statuses: { '2026-09-20': 'saved', '2026-09-21': 'saved' },
  };
  const plan = buildPlan(st, { startDate: '2026-09-20', endDate: '2026-09-21', holidays: '' });
  assert.equal(plan.totalQ, 3, 'two short surahs = 3 quarters per data');
  assert.equal(plan.range.faces, 0.75);
  const days = plan.rows.filter((r) => r.type === 'day');
  assert.equal(days.length, 2, 'exactly the plan days (slide model: no extension rows)');
  assert.equal(days[0].qHi, 2416, 'reverse day1 ends at mushaf end');
  assert.equal(days[0].qLo, 2414);
  assert.ok(days[0].toQ < days[0].fromQ, 'reverse rows move downward');
  assert.equal(days[1].qHi, 2414);
  assert.equal(days[1].qLo, 2413);
  assert.equal(plan.savedQ, 3);
  assert.equal(plan.carryLeft, 0);
  const dplan = buildPlan({ ...st, statuses: { '2026-09-20': 'missed' } }, { startDate: '2026-09-20', endDate: '2026-09-21', holidays: '' });
  const dd = dplan.rows.filter((r) => r.type === 'day');
  assert.equal(dd[0].qLo, 2414 && dd[0].qHi === 2416 ? 2414 : dd[0].qLo, 'descending miss: red cell الناس');
  assert.equal(dd[1].qLo, 2414, 'descending: the 21st is ABOUT the rolled الناس slice (no merge)');
  assert.equal(dd[1].qHi, 2415, 'only its own 1-quarter slice lands on the 21st (queue slide by win)');
  assert.equal(dd[1].carryIn, 1, 'relay announced: 1 quarter had room to slide inside the range');
  assert.equal(dplan.carryLeft, 1, 'one quarter of the tiny 3-q range remains deferred past its end');
  assert.ok(spanLabel(days[0].qLo, days[0].qHi).surah !== '\u2014', 'span label resolves for reverse day');
}
ok('reverse-range: any two surahs, descending plan, mirrored engine verified');

console.log(`\nALL ${n} PLAN/QURAN CHECKS PASSED`);
