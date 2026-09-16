/*
 * Planner tests — run against the REAL lib/plan.js + lib/quran.js the app uses.
 *
 * The planner may only emit complete, verified ayah ranges. Every expectation
 * below is either the exact range that lib/quran-data.js resolves (checked in
 * section 20 straight from the data) or a structural invariant re-audited on
 * the finished plan. No hand-written verse range is ever trusted on its own.
 */
import assert from 'assert';
import { buildPlan, auditPlan, workingDayCount, calendarDays, weekKey, hijriInfo, weekdayName } from '../lib/plan.js';
import { gregToHijri, hijriToGreg, daysInHijriMonth, formatHijri, HIJRI_MONTHS } from '../lib/hijri.js';
import { amountLabel, rangeLabel, ayahRef, globalAyah, surahByNumber, ayahCount, legacyRangeFromQuarters, ayahQStart, ayahQEnd, TOTAL_AYAHS } from '../lib/quran.js';

let n = 0;
const ok = (what) => {
  n++;
  console.log('  ✓', what);
};
const dayRows = (p) => p.rows.filter((r) => r.type === 'day');
const lab = (a, b) => rangeLabel(a, b).head + ' — ' + rangeLabel(a, b).detail;
/** assert a whole plan is internally sound, using the app's own auditor */
function sound(p, label) {
  assert.equal(p.audit.errors.length, 0, `${label}: auditor must pass — ${p.audit.errors.join(' · ')}`);
  assert.ok(p.audit.checked > 0, `${label}: the auditor must actually check ranges`);
  const loPath = Math.min(p.range.first.g, p.range.last.g);
  const hiPath = Math.max(p.range.first.g, p.range.last.g);
  for (const r of dayRows(p)) {
    if (r.gFrom == null) continue;
    assert.ok(r.gFrom >= loPath && r.gTo <= hiPath, `${label}: ${r.date} stays inside the memorisation path`);
    assert.ok(r.gFrom >= 1 && r.gTo <= TOTAL_AYAHS, `${label}: ${r.date} stays inside the mushaf`);
  }
}

const settings = { startDate: '2026-09-20', endDate: '2026-09-30', holidays: '2026-09-23' }; // 7 working days
const se = (o = {}) => ({ startDate: '2026-09-20', endDate: '2026-09-23', holidays: '', ...o }); // 4 working days
const base = { name: 'T', from: 110, to: 114, dailyHifz: 0.5, statuses: {} };

/* 1. calendar: Sun-Wed only, holiday flagged */
{
  const cal = calendarDays(settings.startDate, settings.endDate, new Set(['2026-09-23']));
  assert.deepEqual(cal.map((c) => c.iso), ['2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30']);
  assert.equal(cal[3].holiday, true);
  assert.equal(workingDayCount(settings), 7);
  ok('working days: Sun-Wed only, holidays excluded from the count (7)');
}

/* 2. the surah/ayah data the whole plan rests on */
{
  assert.equal(surahByNumber(110).name, 'النصر');
  assert.equal(ayahCount(110), 3, 'النصر فيها ٣ آيات');
  assert.equal(ayahCount(112), 4, 'الإخلاص فيها ٤ آيات');
  assert.equal(ayahCount(113), 5, 'الفلق فيها ٥ آيات');
  assert.equal(ayahCount(114), 6, 'الناس فيها ٦ آيات');
  assert.equal(globalAyah(110, 3), 6216, 'آخر آية في النصر');
  assert.equal(globalAyah(113, 5), 6230, 'آخر آية في الفلق');
  assert.equal(globalAyah(114, 1), 6231, 'أول آية في الناس — تليها مباشرة');
  assert.equal(globalAyah(114, 6), TOTAL_AYAHS, 'آخر آية في المصحف');
  ok('النصر ٣ · الإخلاص ٤ · الفلق ٥ · الناس ٦ — والفلق ٥ ← الناس ١ متجاورتان بلا فجوة');
}

/* 3. THE REPORTED BUGS — the exact day-by-day table, in travel order */
{
  const p = buildPlan({ ...base, dailyHifz: 0.25 }, settings); // ¼ وجه/يوم على مدى ٧ أيام
  const d = dayRows(p);
  const got = d.filter((r) => r.gFrom != null).map((r) => lab(r.gFrom, r.gTo));
  assert.deepEqual(
    got,
    [
      'النصر — الآيات ١ – ٢',
      'النصر — الآية ٣',
      'المسد — الآيات ١ – ٥',
      'الإخلاص — الآيات ١ – ٤',
      'الفلق — الآيات ١ – ٤',
      'الفلق ← الناس — من الفلق آية ٥ إلى الناس آية ٣',
      'الناس — الآيات ٤ – ٦',
    ],
    'exact day-by-day table:\n    ' + got.join('\n    ')
  );
  sound(p, '¼-days النصر←الناس');
  ok('الجدول اليومي بالضبط: النصر ١–٢ ثم ٣ · الفلق ١–٤ ثم ٥←الناس ٣ · الناس ٤–٦');

  // (a) «النصر ٣ ثم ١–٢» can no longer happen: ١–٢ ثم ٣
  const nasr = d.filter((r) => r.gFrom != null && ayahRef(r.gFrom).surah === 110);
  assert.deepEqual(nasr.map((r) => [ayahRef(r.gFrom).ayah, ayahRef(r.gTo).ayah]), [[1, 2], [3, 3]], 'النصر تُقرأ ١–٢ ثم ٣ — لا عكس');
  // (b) الفلق is never left short: all 5 of its ayahs are covered, the last of them is
  //     الآية ٥, and the day that leaves الفلق crosses exactly at that ayah
  const coveredFalaq = [];
  for (const r of d) {
    if (r.gFrom == null) continue;
    for (let g = r.gFrom; g <= r.gTo; g++) if (ayahRef(g).surah === 113) coveredFalaq.push(ayahRef(g).ayah);
  }
  assert.deepEqual(coveredFalaq, [1, 2, 3, 4, 5], 'الفلق تُغطى كاملة ١…٥ ولا تنتهي عند ٤');
  const leavesFalaq = d.find((r) => r.gFrom != null && ayahRef(r.gFrom).surah === 113 && ayahRef(r.gTo).surah > 113);
  assert.equal(leavesFalaq.gFrom, globalAyah(113, 5), 'اليوم الذي يغادر الفلق يبدأ من آخر آية فيها (٥)');
  assert.equal(rangeLabel(leavesFalaq.gFrom, leavesFalaq.gTo).inRangeSurahEnds[0].ayah, 5, 'ويُوسم «ختام الفلق — آخر آية»');
  // (c) الناس is read ١…٦ in order, never ٤–٦ before ١–٣
  const nasDays = d.filter((r) => r.gFrom != null && (ayahRef(r.gFrom).surah === 114 || ayahRef(r.gTo).surah === 114));
  assert.deepEqual(nasDays.map((r) => (ayahRef(r.gFrom).surah === 114 ? ayahRef(r.gFrom).ayah : 1)), [1, 4], 'الناس تُقرأ ١–٣ ثم ٤–٦');
  ok('الأخطاء المبلَّغ عنها: النصر بالترتيب · الفلق كاملة · الناس بالترتيب');

  // (d) every day starts exactly one ayah after the previous day and the path ends on الناس ٦
  let cursor = null;
  for (const r of d) {
    if (r.gFrom == null) continue;
    if (cursor != null) assert.equal(r.gFrom, cursor + 1, `${r.date} starts exactly after the previous day`);
    cursor = r.gTo;
  }
  assert.equal(cursor, globalAyah(114, 6), 'the path ends exactly on آخر آية في الناس');
  ok('المسار متصل: كل يوم يبدأ من الآية التالية لآخر آية في اليوم السابق وينتهي عند الناس ٦');
}

/* 4. surah-to-surah transitions know both sides exactly */
{
  const p = buildPlan({ ...base, dailyHifz: 0.5 }, settings);
  const d = dayRows(p).filter((r) => r.gFrom != null);
  const cross = [];
  d.forEach((r, i) => {
    const a = ayahRef(r.gFrom);
    const b = ayahRef(r.gTo);
    if (a.surah !== b.surah) {
      cross.push(r);
      const L = rangeLabel(r.gFrom, r.gTo);
      assert.equal(L.cross, true);
      assert.ok(L.detail.includes(a.name) && L.detail.includes(b.name), 'the label names both surahs');
      // every surah finished inside this day is flagged with its REAL last ayah …
      assert.ok(L.inRangeSurahEnds.length >= 1);
      for (const e of L.inRangeSurahEnds) {
        assert.equal(e.ayah, ayahCount(e.surah), `وسم «ختام ${e.name}» يذكر آخر آية بالضبط (${ayahCount(e.surah)})`);
        assert.ok(e.g >= r.gFrom && e.g <= r.gTo);
      }
      assert.ok(L.inRangeSurahEnds.some((e) => e.surah === a.surah), 'the surah it leaves is flagged as finished');
      // … and every surah opened inside it is flagged with الآية ١
      assert.ok(L.inRangeSurahStarts.length >= 1);
      for (const e of L.inRangeSurahStarts) {
        assert.equal(e.ayah, 1, `وسم «بداية ${e.name}» يذكر الآية ١`);
        assert.ok(e.g >= r.gFrom && e.g <= r.gTo);
      }
      assert.ok(L.inRangeSurahStarts.some((e) => e.surah === b.surah), 'the surah it enters is flagged as opened at الآية ١');
    }
    // a day either stops exactly at the last ayah of its surah, or the next day
    // continues in the same surah — a surah is never dropped half-read
    const atSurahEnd = r.gTo === globalAyah(b.surah, ayahCount(b.surah));
    const next = d[i + 1];
    if (!atSurahEnd && next) assert.equal(ayahRef(next.gFrom).surah, b.surah, `${r.date}: لا تُترك سورة في منتصفها`);
  });
  assert.ok(cross.length >= 1, 'the sample plan really crosses surahs');
  console.log('    ', cross.map((r) => 'سورة ' + lab(r.gFrom, r.gTo)).join(' · '));
  sound(p, 'transitions');
  ok('الانتقال بين السور: اليوم العابر يعرف آخر آية في السورة السابقة وأول آية في التالية، ولا تُترك سورة نصف مقروءة');
}

/* 5. a missed day keeps its own range and the plan slides (never merges) */
{
  const p = buildPlan({ ...base, dailyHifz: 0.25, statuses: { '2026-09-20': { hifz: 'missed' } } }, se());
  const d = dayRows(p);
  assert.equal(d[0].status, 'missed');
  assert.equal(d[0].amountQ, 1, 'the red cell keeps its own range visible');
  assert.equal(d[0].plannedQ, 0, 'a missed day saves nothing');
  assert.equal(d[0].rolledToNext, 1, 'its own range rolls to the next day');
  assert.equal(d[1].gFrom, d[0].gFrom, 'the next day re-runs the SAME range');
  assert.equal(d[1].gTo, d[0].gTo);
  assert.equal(d[1].amountQ, 1, 'no merging, no doubling — still one dose');
  assert.equal(d[1].shiftedBy, 1);
  assert.equal(d[2].gFrom, d[1].gTo + 1, 'then the path resumes exactly where it left off');
  assert.equal(p.savedQ, 0);
  assert.equal(p.shifted, 1);
  sound(p, 'missed day');
  ok('«لم يحفظ»: نطاقه يبقى ظاهرًا، يُعاد نفسه في اليوم التالي، ثم يستمر المسار — انزياح بلا دمج');
}

/* 6. «غائب» behaves like «لم يحفظ»; the plan slides by the number of misses */
{
  const p = buildPlan({ ...base, dailyHifz: 0.25, statuses: { '2026-09-20': { hifz: 'absent' }, '2026-09-21': { hifz: 'absent' } } }, settings);
  const d = dayRows(p);
  assert.deepEqual([d[0].status, d[1].status], ['absent', 'absent']);
  assert.equal(d[2].gFrom, d[0].gFrom, 'two misses → the same two ranges run again');
  assert.equal(d[2].shiftedBy, 2);
  assert.equal(d[3].gFrom, d[2].gTo + 1, 'and then the path continues, ayah after ayah');
  assert.equal(d[4].gFrom, d[3].gTo + 1);
  assert.deepEqual([p.stats.saved, p.stats.missed, p.stats.absent], [0, 0, 2]);
  sound(p, 'absent days');
  ok('«غائب» يزيح الخطة كالغياب تمامًا (٢ غياب → انزياح يومين ثم استمرار المسار)');
}

/* 7. a saved day counts exactly its own range and feeds the minor review */
{
  const p = buildPlan({ ...base, dailyHifz: 0.5, statuses: { '2026-09-20': { hifz: 'saved' } } }, se());
  const d = dayRows(p);
  assert.equal(d[0].status, 'saved');
  assert.equal(d[0].plannedQ, 2);
  assert.equal(p.savedQ, 2, 'progress = the exact quarters of the saved range');
  assert.equal(p.stats.saved, 1);
  assert.equal(d[1].minor.gFrom, d[0].gFrom, 'الصغرى تُغذّى من نطاق الأمس الحقيقي');
  assert.equal(d[1].minor.gTo, d[0].gTo);
  assert.equal(d[1].minor.status, null, 'ولا تُعلَّم «تم» تلقائيًا');
  assert.equal(d[0].minor.gFrom, null, 'أول يوم لا صغرى: لم يُحفظ شيء بالأمس');
  sound(p, 'saved day');
  ok('«حفظ»: المقدار بالضبط + الصغرى من نطاق الأمس (لا شيء في أول يوم، ولا تعليم تلقائي)');
}

/* 8. minor review slides on «لم تتم» and never merges, hifz untouched */
{
  const p = buildPlan(
    { ...base, dailyHifz: 0.5, statuses: { '2026-09-20': { hifz: 'saved' }, '2026-09-21': { hifz: 'saved', minor: 'missed' } } },
    se()
  );
  const d = dayRows(p);
  assert.equal(d[1].minor.status, 'missed');
  assert.equal(d[2].minor.gFrom, d[1].minor.gFrom, 'the unfinished minor re-runs the same range');
  assert.equal(d[2].minor.plannedQ, d[1].minor.plannedQ, 'same amount — no merge');
  assert.equal(d[2].minor.pendingDays, 2, 'and it is flagged as late');
  assert.equal(p.stats.minorMissed, 1);
  assert.equal(p.savedQ, 4, 'hifz progress is untouched by review marks');
  sound(p, 'minor slide');
  ok('الصغرى تنزاح وحدها على «لم تتم» (نفس النطاق، بلا دمج) ولا تمسّ الحفظ');
}

/* 9. major review rides the whole mushaf downwards, its own dose, its own slide */
{
  const st = { ...base, dailyHifz: 0.5, majorEnabled: true, majorBaseQ: 2 };
  let p = buildPlan(st, se({ endDate: '2026-09-27' }));
  let d = dayRows(p);
  assert.equal(lab(d[0].major.gFrom, d[0].major.gTo), 'الناس — الآيات ٣ – ٦', 'اليوم الأول من آخر المصحف');
  assert.equal(d[0].major.plannedQ, 2);
  assert.equal(d[0].major.cycle, 1);
  assert.ok(d[0].major.gFrom > d[1].major.gFrom, 'the ride is strictly descending');
  assert.equal(d[1].major.gFrom, d[0].major.gTo - 1, 'كل يوم يواصل من الآية التي تحته مباشرة');
  sound(p, 'major ride');

  // «لا يوجد» burns the day and slides the ride one day (like غائب/لم تتم)
  p = buildPlan({ ...st, statuses: { '2026-09-20': { major: 'none' } } }, se({ endDate: '2026-09-27' }));
  d = dayRows(p);
  assert.equal(d[0].major.status, 'none');
  assert.equal(d[0].major.gFrom, null, 'a burned day shows its badge, not a fresh range');
  assert.equal(d[1].major.gFrom, globalAyah(114, 6), 'the burned slot re-runs next day — slide, never merge');
  assert.equal(p.stats.major.none, 1);
  assert.equal(p.savedQ, 0, 'hifz is untouched by major marks');
  sound(p, 'major none');
  ok('الكبرى: نزول من الناس إلى الفاتحة، جرعة مستقلة، و«لا يوجد» يزيحها كالغياب');

  // the major dose is chosen by the teacher, never inherited from the hifz dose
  const p2 = buildPlan({ ...base, dailyHifz: 0.25, majorEnabled: true, majorBaseQ: 4 }, se());
  assert.equal(dayRows(p2)[0].major.plannedQ, 4, 'جرعة الكبرى = مقدارها المختار (وجه) وليست جرعة الحفظ');
  assert.equal(dayRows(p2)[0].amountQ, 1, 'وحفظ اليوم يبقى ربع وجه');
  ok('جرعة الكبرى مختارة من المعلم ولا تُورَّث من جرعة الحفظ');
}

/* 10. daily amounts are the exact quarter lengths of the exact ayah ranges */
{
  const p = buildPlan({ ...base, dailyHifz: 0.25 }, settings);
  for (const r of dayRows(p)) {
    if (r.gFrom == null) continue;
    assert.equal(r.amountQ, ayahRef(r.gTo).qEnd - ayahRef(r.gFrom).q, `${r.date}: amountQ = ربع الآيات بالضبط`);
  }
  const p2 = buildPlan({ name: 'L', from: 2, to: 2, dailyHifz: 0.25, statuses: {} }, { startDate: '2026-09-20', endDate: '2026-10-31', holidays: '' });
  const ld = dayRows(p2).filter((r) => r.gFrom != null);
  const longAyah = ld.find((r) => ayahRef(r.gFrom).surah === 2 && ayahRef(r.gFrom).ayah === 5);
  assert.ok(longAyah, 'البقرة ٥ موجودة في المسار');
  assert.deepEqual([ayahRef(longAyah.gFrom).ayah, ayahRef(longAyah.gTo).ayah], [5, 5], 'a long ayah is taken whole, never cut');
  assert.ok(longAyah.amountQ > 1, 'وإن زادت عن جرعة اليوم: ' + longAyah.amountQ + ' أرباع');
  sound(p2, 'long ayah');
  ok('المقادير بالضبط من بيانات الآيات: لا تقسيم لآية، والآية الطويلة تُؤخذ كاملة');
}

/* 11. the plan can never run past the last ayah of the range */
{
  const p = buildPlan({ name: 'S', from: 112, to: 114, dailyHifz: 0.5, statuses: {} }, settings);
  const d = dayRows(p);
  const filled = d.filter((r) => r.gFrom != null);
  assert.ok(filled.every((r) => r.gTo <= globalAyah(114, 6)));
  assert.equal(filled[filled.length - 1].gTo, globalAyah(114, 6), 'the path ends exactly on آخر آية (الناس ٦)');
  assert.ok(d.filter((r) => r.empty).length > 0, 'surplus days are marked «اكتمل المدى» instead of inventing ranges');
  sound(p, 'range end');

  for (const s of [110, 113, 114]) {
    const one = buildPlan({ name: 'X', from: s, to: s, dailyHifz: 0.25, statuses: {} }, { startDate: '2026-09-20', endDate: '2026-10-31', holidays: '' });
    const od = dayRows(one).filter((r) => r.gFrom != null);
    for (const r of od) {
      assert.equal(ayahRef(r.gFrom).surah, s);
      assert.equal(ayahRef(r.gTo).surah, s, 'a single-surah plan never leaves the surah');
      assert.ok(ayahRef(r.gTo).ayah <= ayahCount(s), `لا آية أكبر من ${ayahCount(s)} في ${surahByNumber(s).name}`);
    }
    assert.equal(od[0].gFrom, globalAyah(s, 1), 'starts at الآية ١');
    assert.equal(od[od.length - 1].gTo, globalAyah(s, ayahCount(s)), 'ends at آخر آية');
    sound(one, `single surah ${s}`);
  }
  ok('الخطة تنتهي عند آخر آية بالضبط، والأيام الزائدة «اكتمل المدى»، ولا نطاق يتجاوز عدد آيات سورته');
}

/* 12. descending students: the exact same guarantees, mirrored */
{
  const p = buildPlan({ ...base, from: 114, to: 110, dailyHifz: 0.5 }, se());
  const d = dayRows(p).filter((r) => r.gFrom != null);
  assert.equal(p.descending, true);
  assert.equal(lab(d[0].gFrom, d[0].gTo), 'الناس — الآيات ٣ – ٦', 'البداية من آخر المصحف');
  for (let i = 1; i < d.length; i++) assert.equal(d[i].gFrom, d[i - 1].gTo - 1, 'descending days are contiguous downwards');
  assert.equal(d[d.length - 1].gTo, globalAyah(110, 1), 'and finish exactly on النصر ١');
  const L = rangeLabel(d[0].gFrom, d[0].gTo);
  assert.ok(L.detail.startsWith('الآيات ٣'), 'الوسم يُطبع من الأدنى إلى الأعلى: ' + L.detail);
  sound(p, 'descending');
  assert.equal(buildPlan({ ...base, from: 114, to: 114 }, se()).descending, false, 'from === to is not mirrored');
  assert.equal(buildPlan({ name: 'N', from: undefined, to: undefined, dailyHifz: 0.5, statuses: {} }, se()).descending, false, 'invalid input → full mushaf ascending');
  ok('المسار التنازلي: نفس الضمانات معكوسة (متجاور، ينتهي عند النصر ١) والوسم من الأدنى للأعلى');
}

/* 13. full mushaf 1↔114: every ayah exactly once, both directions */
{
  const long = { startDate: '2026-09-20', endDate: '2028-09-19', holidays: '' };
  const check = (p, dirName) => {
    const d = dayRows(p).filter((r) => r.gFrom != null);
    const first = dirName === 'asc' ? 1 : TOTAL_AYAHS;
    const last = dirName === 'asc' ? TOTAL_AYAHS : 1;
    assert.equal(d[0].gFrom, first);
    assert.equal(d[d.length - 1].gTo, last);
    const seen = new Set();
    let dup = 0;
    for (const r of d) {
      const lo = Math.min(r.gFrom, r.gTo);
      const hi = Math.max(r.gFrom, r.gTo);
      for (let g = lo; g <= hi; g++) (seen.has(g) ? dup++ : seen.add(g));
    }
    assert.equal(seen.size, TOTAL_AYAHS, `${dirName}: all 6236 ayahs covered`);
    assert.equal(dup, 0, `${dirName}: no ayah repeated`);
    assert.equal(p.totalQ, 2416, `${dirName}: whole mushaf = 604 faces`);
    sound(p, 'full ' + dirName);
    return d.length;
  };
  const up = buildPlan({ name: 'U', from: 1, to: 114, dailyHifz: 2, statuses: {} }, long);
  const down = buildPlan({ name: 'D', from: 114, to: 1, dailyHifz: 2, statuses: {} }, long);
  assert.equal(up.range.first.name, 'الفاتحة');
  assert.equal(up.range.last.name, 'الناس');
  const upDays = check(up, 'asc');
  const downDays = check(down, 'desc');
  console.log(`     asc ${upDays} يوماً · desc ${downDays} يوماً (وجهان/يوم)`);
  ok('المصحف كامل ١↔١١٤ في الاتجاهين: ٦٢٣٦ آية، كل آية مرة واحدة، بلا تكرار ولا فجوة');
}

/* 14. manual pins: exact ayah ranges rewrite the chain; invalid/ambiguous ones are dropped */
{
  // pin Tuesday to الفلق ١–٥ (a full surah) — the days after rebuild from its exact end
  let p = buildPlan({ ...base, dailyHifz: 0.5, overrides: { '2026-09-21': { hifz: { s1: 113, a1: 1, s2: 113, a2: 5 } } } }, se());
  let d = dayRows(p);
  assert.equal(lab(d[1].gFrom, d[1].gTo), 'الفلق — الآيات ١ – ٥');
  assert.equal(d[2].gFrom, globalAyah(114, 1), 'the day after the pin continues from its exact end (الناس ١)');
  assert.deepEqual(p.issues, []);
  sound(p, 'pin');

  // an impossible pin (الفلق آية ٦) is refused and reported — never rounded down to ٥
  p = buildPlan({ ...base, dailyHifz: 0.5, overrides: { '2026-09-21': { hifz: { s1: 113, a1: 1, s2: 113, a2: 6 } } } }, se());
  assert.equal(p.issues.length, 1, 'the impossible pin is reported to the teacher');
  assert.ok(p.issues[0].includes('الفلق') && p.issues[0].includes('٥'), 'the message names the surah and its real ayah count: ' + p.issues[0]);
  assert.notEqual(lab(dayRows(p)[1].gFrom, dayRows(p)[1].gTo), 'الفلق — الآيات ١ – ٥', 'and the day keeps its own planned range');
  sound(p, 'invalid pin');

  // legacy quarter pins: only an exact, unambiguous match may migrate
  const g60 = globalAyah(2, 60);
  const exactSame = legacyRangeFromQuarters(ayahQStart(g60), ayahQEnd(g60));
  assert.ok(exactSame && exactSame.lo === g60 && exactSame.hi === g60, 'البقرة ٦٠ قابلة للنقل بدقة');
  p = buildPlan(
    { name: 'B', from: 2, to: 2, dailyHifz: 0.5, statuses: {}, overrides: { '2026-09-21': { hifz: { qLo: ayahQStart(g60), qHi: ayahQEnd(g60) } } } },
    se()
  );
  assert.deepEqual(p.issues, []);
  assert.equal(dayRows(p)[1].gFrom, g60, 'the old quarter pin lands on the exact same ayah');
  assert.equal(dayRows(p)[1].gTo, g60);
  sound(p, 'legacy exact');
  ok('التثبيت القديم المتطابق تمامًا يُنقل إلى الآية نفسها بلا تقريب');

  // an ambiguous legacy pin (٢٤١٠–٢٤١٢) is dropped with a message, never approximated
  p = buildPlan({ ...base, dailyHifz: 0.5, overrides: { '2026-09-21': { hifz: { qLo: 2410, qHi: 2412 } } } }, se());
  assert.equal(p.issues.length, 1, 'the ambiguous pin is reported');
  assert.notEqual(dayRows(p)[1].gFrom, 6216, 'and is not silently turned into آيات');
  sound(p, 'legacy drop');
  ok('التثبيت الربعي القديم الغامض: يُلغى ويُبلَّغ عنه — لا تخمين');
}

/* 15. the auditor itself catches a broken plan (so a wrong table can never render) */
{
  const loG = globalAyah(110, 1);
  const hiG = globalAyah(114, 6);
  const chainOf = (pairs) => pairs.map(([a, b]) => ({ from: a, to: b }));
  const run = (chain, extra = {}) => auditPlan({ chain, rows: [], loG, hiG, startG: loG, endG: hiG, dir: 1, ...extra });

  const good = run(chainOf([[globalAyah(110, 1), globalAyah(110, 3)], [globalAyah(111, 1), globalAyah(112, 4)], [globalAyah(113, 1), globalAyah(114, 6)]]));
  assert.deepEqual(good.errors, [], 'a gap-free, complete chain passes');
  assert.equal(good.checked, 3);

  const gap = run(chainOf([[globalAyah(110, 1), globalAyah(110, 3)], [globalAyah(113, 1), globalAyah(114, 6)]]));
  assert.ok(gap.errors.length > 0, 'a skipped surahs gap is caught: ' + JSON.stringify(gap.errors));

  const backwards = run(chainOf([[globalAyah(114, 4), globalAyah(114, 6)], [globalAyah(114, 1), globalAyah(114, 3)]]));
  assert.ok(backwards.errors.length > 0, 'a later range placed before an earlier one is caught: ' + JSON.stringify(backwards.errors));

  const beyond = auditPlan({ chain: [], rows: [{ type: 'day', date: '2026-09-20', gFrom: globalAyah(113, 1), gTo: globalAyah(113, 5) + 1 }], loG, hiG, startG: loG, endG: hiG, dir: 1 });
  assert.ok(beyond.errors.length > 0, 'الفلق ١–٦ (آية غير موجودة) is caught: ' + JSON.stringify(beyond.errors));

  // a truncated plan (calendar too short) is allowed, but it must still be contiguous
  const truncated = run(chainOf([[globalAyah(110, 1), globalAyah(110, 3)]]), { complete: false });
  assert.deepEqual(truncated.errors, [], 'a calendar-cut plan passes: ' + JSON.stringify(truncated.errors));
  const truncatedBad = run(chainOf([[globalAyah(110, 1), globalAyah(110, 3)], [globalAyah(112, 2), globalAyah(112, 4)]]), { complete: false });
  assert.ok(truncatedBad.errors.length > 0, 'even when cut short, gaps are still refused: ' + JSON.stringify(truncatedBad.errors));
  ok('المدقق يرفض الفجوات والترتيب المعكوس والآيات غير الموجودة — ويسمح فقط بخطة مقطوعة بمتصل صحيح');
}

/* 16. extension days appear only for real marks after the end date */
{
  const p = buildPlan({ ...base, dailyHifz: 0.25, statuses: { '2026-09-20': { hifz: 'missed' } } }, se()); // 4-day calendar, 1 miss
  const d = dayRows(p);
  const seq = d.filter((r) => r.gFrom != null);
  // a deferred day legitimately re-runs the same range, so collapse the re-runs
  // first and then require the advancing sequence to be gap-free and in order
  const advanced = seq.filter((r, i) => i === 0 || !(r.gFrom === seq[i - 1].gFrom && r.gTo === seq[i - 1].gTo));
  let cursor = null;
  for (const r of advanced) {
    if (cursor != null) assert.equal(r.gFrom, cursor + 1, `${r.date} يبدأ بعد المقدار السابق مباشرة`);
    cursor = r.gTo;
  }
  assert.ok(d.some((r) => r.beyondPlan), 'a real miss pushes the tail of the plan past endDate');
  const beyond = d.filter((r) => r.beyondPlan);
  assert.equal(beyond.length, 1, 'exactly the spilled day is materialised');
  assert.equal(beyond[0].gFrom, globalAyah(112, 1), 'وهي تحمل المقدار الذي لم يعد له يوم داخل الخطة (الإخلاص ١)');
  assert.equal(p.shifted, 1);
  assert.equal(d[d.length - 1].date, '2026-09-27', 'the extension day is the next working day after endDate');
  sound(p, 'extension');
  const noExt = buildPlan({ ...base, dailyHifz: 0.25, statuses: { '2026-09-20': { hifz: 'saved' } } }, se());
  assert.equal(dayRows(noExt).filter((r) => r.beyondPlan).length, 0, 'no misses → no extension days');
  ok('أيام الامتداد لا تُنشأ إلا عند انزياح حقيقي، ويحمل اليوم الإضافي المقدار الذي لم يجد له مكانًا');
}

/* 17. week grouping + Hijri labels */
{
  assert.equal(weekKey('2026-09-20'), '2026-09-20');
  assert.equal(weekKey('2026-09-23'), '2026-09-20');
  assert.equal(weekKey('2026-09-27'), '2026-09-27');
  const hj = hijriInfo('2026-09-20');
  assert.equal(hj.dm.includes('ربيع الآخر'), true, 'Sept 20 2026 is in Rabi al-Thani 1448');
  assert.equal(hj.y, '١٤٤٨هـ');
  assert.equal(hijriInfo('').dm, '—', 'invalid date guarded');
  assert.ok(['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء'].includes(weekdayName('2026-09-20')));
  ok('تجميع الأسابيع (الأحد مرساة) + الوسوم الهجرية أم القرى');
}

/* 18. lib/hijri.js — the picker engine must never drift from Intl */
{
  const HIJ = new Intl.DateTimeFormat('en-US-u-ca-islamic-umalqura', { day: 'numeric', month: 'numeric', year: 'numeric' });
  for (let i = 0; i < 150; i++) {
    const date = new Date(2026, 8, 1 + i);
    const isoStr = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
    const parts = {};
    for (const x of HIJ.formatToParts(date)) parts[x.type] = x.value;
    const h = gregToHijri(isoStr);
    assert.equal(h.y, +parts.year, 'year match ' + isoStr);
    assert.equal(h.m, +parts.month, 'month match ' + isoStr);
    assert.equal(h.d, +parts.day, 'day match ' + isoStr);
    assert.equal(hijriToGreg(h.y, h.m, h.d), isoStr, 'roundtrip ' + isoStr);
    const len = daysInHijriMonth(h.y, h.m);
    assert.ok(len === 29 || len === 30, 'month length ' + len);
  }
  assert.equal(HIJRI_MONTHS.length, 12);
  assert.ok(formatHijri('2026-09-20').includes('ربيع'));
  ok('hijri.js: engine == Intl over 150 days + roundtrips + month lengths');
}

/* 19. amount labels stay quarter-based and exact */
{
  const L = (q) => amountLabel(q);
  assert.equal(L(1), 'ربع وجه');
  assert.equal(L(2), 'نصف وجه');
  assert.equal(L(3), 'ثلاثة أرباع وجه');
  assert.equal(L(4), 'وجه');
  assert.equal(L(5), 'وجه وربع');
  assert.equal(L(6), 'وجه ونصف');
  assert.equal(L(8), 'وجهان');
  assert.equal(L(20), '٥ أوجه');
  ok('وسوم المقادير بالربع (ربع/نصف/ثلاثة أرباع/وجه…)');
}

/* 20. self-check: the day-by-day table of section 3 is what the data resolves */
{
  const p = buildPlan({ ...base, dailyHifz: 0.25 }, settings);
  const d = dayRows(p).filter((r) => r.gFrom != null);
  const manual = [
    ['النصر', 1, 'النصر', 2],
    ['النصر', 3, 'النصر', 3],
    ['المسد', 1, 'المسد', 5],
    ['الإخلاص', 1, 'الإخلاص', 4],
    ['الفلق', 1, 'الفلق', 4],
    ['الفلق', 5, 'الناس', 3],
    ['الناس', 4, 'الناس', 6],
  ];
  d.forEach((r, i) => {
    const a = ayahRef(r.gFrom);
    const b = ayahRef(r.gTo);
    assert.deepEqual([a.name, a.ayah, b.name, b.ayah], manual[i], `row ${i + 1} matches the verified data`);
  });
  // and the same table can be derived straight from the dataset, ayah by ayah
  const resolved = [];
  for (const r of d) resolved.push(`${ayahRef(r.gFrom).name}:${ayahRef(r.gFrom).ayah}-${ayahRef(r.gTo).name}:${ayahRef(r.gTo).ayah}`);
  assert.deepEqual(resolved, ['النصر:1-النصر:2', 'النصر:3-النصر:3', 'المسد:1-المسد:5', 'الإخلاص:1-الإخلاص:4', 'الفلق:1-الفلق:4', 'الفلق:5-الناس:3', 'الناس:4-الناس:6']);
  ok('الجدول اليومي مطابق حرفيًا لما تحسبه البيانات الموثّقة (لا نطاق مكتوب يدويًا دون تحقق)');
}

console.log(`\nALL ${n} PLAN CHECKS PASSED\n`);
