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

/* 4. smart rollover: missed -> its whole amount cascades to next working day */
p = buildPlan({ ...base, statuses: { '2026-09-21': 'missed' } }, settings);
days = p.rows.filter((r) => r.type === 'day');
assert.equal(days[1].status, 'missed');
assert.equal(days[1].plannedQ, 0, 'missed day saves nothing');
assert.equal(days[2].amountQ, 4, '22nd = base 2 + carry 2');
assert.equal(days[2].carryIn, 2);
assert.equal(days[2].fromQ, 2008, 'missed day does not advance the mushaf cursor');
ok('missed day → 0 saved, full amount moved to next working day');

/* 5. double cascade: 21 missed + 22 absent -> 27 gets 6 (1.5 faces), saved counts */
p = buildPlan({ ...base, statuses: { '2026-09-21': 'missed', '2026-09-22': 'absent', '2026-09-27': 'saved' } }, settings);
days = p.rows.filter((r) => r.type === 'day');
assert.equal(days[3].amountQ, 6, 'absent+missed stack: 2+2+2');
assert.equal(days[3].carryIn, 4);
assert.equal(days[3].fromQ, 2008);
assert.equal(days[3].toQ, 2014);
assert.equal(p.savedQ, 6);
assert.equal(days[4].fromQ, 2014, 'after a saved catch-up day, schedule resumes');
assert.deepEqual([p.stats.saved, p.stats.missed, p.stats.absent, p.stats.pending], [1, 1, 1, 4]);
ok('cascade stacks across multiple days; saved resumes cursor; stats correct');

/* 6. overflow beyond plan end auto-extends */
p = buildPlan({ ...base, statuses: { '2026-09-20': 'missed', '2026-09-21': 'missed' } }, { ...settings, endDate: '2026-09-21' });
days = p.rows.filter((r) => r.type === 'day');
assert.equal(days.length, 3);
assert.equal(days[2].beyondPlan, true);
assert.equal(days[2].amountQ, 6);
assert.equal(days[2].fromQ, 2006);
assert.equal(p.carryLeft, 0);
ok('unfinished carry extends into new working days after plan end (22 Sep, 1.5 faces)');

/* 7. range clamping: small surah range exhausts without overrun */
p = buildPlan({ ...base, from: 112, to: 114 }, settings); // الاخلاص..الناس = 1 face
const small = p.totalQ;
days = p.rows.filter((r) => r.type === 'day');
assert.equal(small, 4, 'Al-Ikhlas..An-Nas = 4 quarter-faces (1 page)');
assert.ok(days.every((r) => r.fromQ >= 2412 && r.toQ <= 2416), 'cursor never leaves the range');
assert.equal(days.filter((r) => r.empty).length, 5, 'days after the range is exhausted are empty');
assert.equal(p.rows.filter((r) => r.beyondPlan).length, 0, 'no extension needed (carry consumed)');
ok('range clamps: cursor pinned inside 2412..2416, surplus days marked empty');

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
  assert.equal(days.length, 3, 'two plan days + one beyondPlan extension day (leftover carry)');
  assert.equal(days[0].qHi, 2416, 'reverse day1 ends at mushaf end');
  assert.equal(days[0].qLo, 2414);
  assert.ok(days[0].toQ < days[0].fromQ, 'reverse rows move downward');
  assert.equal(days[1].qHi, 2414);
  assert.equal(days[1].qLo, 2413);
  assert.equal(days[2].empty, true, 'extension day shows range complete');
  assert.equal(plan.savedQ, 3);
  assert.equal(plan.carryLeft, 0);
  assert.ok(spanLabel(days[0].qLo, days[0].qHi).surah !== '\u2014', 'span label resolves for reverse day');
}
ok('reverse-range: any two surahs, descending plan, mirrored engine verified');

console.log(`\nALL ${n} PLAN/QURAN CHECKS PASSED`);
