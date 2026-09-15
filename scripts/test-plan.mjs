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
assert.equal(days[1].qHi, null, 'missed day has no content (red, shifted)');
assert.equal(days[2].amountQ, 2, 'next day keeps EXACTLY its daily dose — no merge, no burdening');
assert.equal(days[2].qLo, 2008, '22nd = slot1 = Monday content (Sunday missed -> Monday content on Tuesday...); 21st stays red-empty');
assert.ok(days[2].amountQ === 2, 'dose stays exactly base 2');
assert.equal(days[2].shiftedBy, 1, 'one miss before this day — plan shifted by one');
assert.equal(days[1].shiftBefore, 0, 'the missed day itself had no shift before it');
assert.equal(days[1].shiftedBy, 1, 'after it, the plan carries one permanent day of delay');
assert.equal(days[0].qLo, 2006, 'day 1 starts at range start');
assert.equal(days[1].qLo, null, 'missed day shows NO content (kept red/shifted)');
assert.equal(days[3].qLo, 2010, 'following days each shifted by exactly one slot — the whole plan slides');
assert.equal(days[4].qLo, 2012, 'delay persists forever, never merged');
ok('missed day → red + full one-day slide (SHIFT, never merge)');

/* 5. shift semantics: two misses slide the plan 2 days; saving consumes queue-first */
p = buildPlan({ ...base, statuses: { '2026-09-21': 'missed', '2026-09-22': 'absent', '2026-09-27': 'saved' } }, settings);
days = p.rows.filter((r) => r.type === 'day');
assert.equal(days[3].amountQ, 2, 'daily dose is constant even with 2 days queued');
assert.equal(days[3].qLo, 2008, '27th = slot (3-1) = the content the 22nd was to receive (21 missed -> +1)');
assert.equal(days[3].qHi, 2010);
assert.equal(p.savedQ, 2, 'only the marked save counts in progress');
assert.equal(days[4].qLo, 2010, 'plan resumes right after');
assert.deepEqual([p.stats.saved, p.stats.missed, p.stats.absent], [1, 1, 1]);
ok('shift stacks across days (no merged mega-days); saved pulls from queue first');

/* 6. beyond-plan extension only for real queues */
p = buildPlan({ ...base, statuses: { '2026-09-20': 'missed', '2026-09-21': 'missed' } }, { ...settings, endDate: '2026-09-21' });
days = p.rows.filter((r) => r.type === 'day');
assert.equal(days.length, 4, 'slide of 2 days -> exactly 2 extra working days (22, 23 Sep)');
assert.equal(days[2].beyondPlan, true);
assert.equal(days[2].qLo, 2006, 'first extra day carries the first slid slot');
assert.equal(p.carryLeft, 0, 'shift model never queues extra burden');
assert.equal(p.remainingQ, 410 - 0, 'unmarked progress is 0 — the visible days are previews');
p = buildPlan({ ...base, statuses: { '2026-09-20': 'missed', '2026-09-21': { hifz: 'saved' } } }, { ...settings, endDate: '2026-09-21' });
assert.equal(p.savedQ, 2, 'saving on the shifted slot consumes the DEFERRED content (slot 0)');
assert.equal(p.rows.filter((r) => r.type === 'day')[1].qLo, 2006, 'the 21st shows Sunday content');
assert.equal(p.carryLeft, 0, 'nothing merges — the plan merely slid');
ok('extension day at plan end; queue drains only via saves (no merge)');

/* 7. range clamping: small surah range exhausts without overrun */
p = buildPlan({ ...base, from: 112, to: 114 }, settings); // الاخلاص..الناس = 1 face
const small = p.totalQ;
days = p.rows.filter((r) => r.type === 'day');
assert.equal(small, 4, 'Al-Ikhlas..An-Nas = 4 quarter-faces (1 page)');
assert.ok(days.every((r) => r.qLo == null || (r.qLo >= 2412 && r.qHi <= 2416)), 'cursor never leaves the range');
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
  assert.equal(days.length, 2, 'daily doses 2+1 drain the 3-quarter range exactly — no bogus extension needed');
  assert.equal(days[0].qHi, 2416, 'reverse day1 ends at mushaf end');
  assert.equal(days[0].qLo, 2414);
  assert.equal(days[0].qLo, 2414); assert.equal(days[0].qHi, 2416); // display span normalized; direction lives in qLo/qHi order of travel (row.direction)
  assert.equal(days[1].qHi, 2414);
  assert.equal(days[1].qLo, 2413);
  assert.equal(days[1].amountQ, 1, 'last day shrinks to the remaining slice only');
  assert.equal(plan.savedQ, 3);
  assert.equal(plan.carryLeft, 0); // shift model: no queue burden
  assert.equal(plan.savedQ, 3);
  assert.ok(spanLabel(days[0].qLo, days[0].qHi).surah !== '\u2014', 'span label resolves for reverse day');
}
ok('reverse-range: any two surahs, descending plan, mirrored engine verified (direction field + normalized span)');


/* 14. ASCENDING default (user-reported bug): from <= to must NEVER mirror */
{
  const se = { startDate: '2026-09-20', endDate: '2026-09-26', holidays: '' };
  const p = buildPlan({ name: 'A', from: 1, to: 114, dailyHifz: 0.5, statuses: {} }, se);
  const days = p.rows.filter((r) => r.type === 'day');
  assert.equal(p.descending, false, '1 -> 114 is ascending');
  assert.equal(days[0].qLo, 0, 'ascending day 1 starts at Al-Fatiha quarter 0');
  assert.equal(spanLabel(days[0].qLo, days[0].qHi).surah, '\u0627\u0644\u0641\u0627\u062a\u062d\u0629', 'ascending day 1 = الفاتحة');
  assert.ok(days.every((r) => r.qLo == null || r.qLo >= 0));
  assert.ok(days[1].qLo >= days[0].qLo, 'ascending plan never goes backwards');
  // equal from/to must stay forward too (no mirror)
  const peq = buildPlan({ from: 114, to: 114, dailyHifz: 0.5, statuses: {} }, se);
  assert.equal(peq.descending, false, 'from === to is NOT mirrored');
  // NaN / invalid values default to ascending (never mirror)
  const pbad = buildPlan({ from: undefined, to: undefined, dailyHifz: 0.5, statuses: {} }, se);
  assert.equal(pbad.descending, false, 'invalid inputs default to ascending');
  // legacy flat status strings still read as hifz marks
  const pleg = buildPlan({ from: 1, to: 114, dailyHifz: 0.5, statuses: { '2026-09-20': 'saved' } }, se);
  assert.equal(pleg.rows.filter((r) => r.type === 'day')[0].status, 'saved', 'legacy flat statuses compatible');
  assert.equal(pleg.stats.saved, 1);
}
ok('ascending (from<=to) NEVER mirrors; legacy flat statuses compatible');

/* 15. minor review = automatic feed from yesterday's saved hifz */
{
  const se = { startDate: '2026-09-20', endDate: '2026-09-23', holidays: '' };
  const p = buildPlan({ from: 1, to: 114, dailyHifz: 0.5, statuses: { '2026-09-20': { hifz: 'saved' } } }, se);
  const days = p.rows.filter((r) => r.type === 'day');
  assert.ok(!days[0].minor || !days[0].minor.plannedQ, 'no minor before any save');
  assert.equal(days[1].minor.plannedQ, 2, "day 2 minor = day 1's saved 2 quarters — automatic");
  assert.equal(days[1].minor.status, 'done', 'minor is auto-satisfied (teacher never marks it)');
  assert.deepEqual([days[1].minor.qLo, days[1].minor.qHi], [0, 2]);
  assert.ok(!days[2].minor || days[2].minor.preview, 'day 3 has no real minor (nothing saved on day 2)');
}
ok('minor review auto-built from yesterday hifz (no manual entry)');

/* 16. major = optional independent shift stream */
{
  const se = { startDate: '2026-09-20', endDate: '2026-09-29', holidays: '' };
  const st = {
    from: 1, to: 114, dailyHifz: 0.5, majorEnabled: true, majorBaseQ: 2,
    statuses: {
      '2026-09-20': { hifz: 'saved' },
      '2026-09-21': { hifz: 'saved', major: 'missed' },
      '2026-09-22': { hifz: 'saved', major: 'done' },
      '2026-09-23': { hifz: 'saved', major: 'done' },
    },
  };
  const p = buildPlan(st, se);
  const days = p.rows.filter((r) => r.type === 'day');
  assert.equal(days[2].major.status, 'done');
  assert.equal(days[2].major.plannedQ, 2, 'after a major-miss, the due day processes the deferred slice (daily dose only)');
  assert.equal(days[3].major.plannedQ, 2, 'each major day = own daily dose, never merged');
  assert.equal(days[1].status, 'saved', 'hifz stream untouched by major marks');
  assert.equal(p.stats.saved, 4, 'hifz saves independent of major');
  assert.equal(p.stats.major.saved, 2);
  assert.equal(p.stats.major.missed, 1);
  assert.equal(p.savedQ, 8, 'hifz progress unaffected');
  assert.equal(p.stats.major.savedQ, 4, 'major reviewed 1 face total');
  // disabled major -> no major objects at all
  const poff = buildPlan({ ...st, majorEnabled: false }, se);
  assert.ok(poff.rows.filter((r) => r.type === 'day').every((r) => !r.major), 'major disabled -> absent from rows');
}
ok('major review: optional, independent shift, done/missed only touch itself');

console.log(`\nALL ${n} PLAN/QURAN CHECKS PASSED`);
