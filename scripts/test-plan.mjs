/* Logic test — runs the real lib/plan.js + lib/quran.js the app uses. */
import assert from 'assert';
import { buildPlan, workingDayCount, calendarDays, weekKey } from '../lib/plan.js';
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

console.log(`\nALL ${n} PLAN/QURAN CHECKS PASSED`);
