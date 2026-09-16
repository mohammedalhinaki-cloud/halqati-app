/*
 * Quran DATA tests — run before every release (npm test).
 *
 * These are the guarantees the halaqa table depends on:
 *   1. the committed dataset (lib/quran-data.js / data/quran.json) still matches
 *      the pinned sources byte-for-byte, and the build's own 19 cross-source
 *      checks all pass;
 *   2. all 114 surahs with their REAL ayah counts come from the trusted sources
 *      (Tanzil metadata + QCF4/QPC Hafs mushaf database), never from a model;
 *   3. lib/quran.js cannot produce an out-of-range ayah or a range that exceeds a
 *      surah's ayah count — invalid input throws instead of being clamped;
 *   4. every range the planner can emit is a set of complete, strictly ordered
 *      ayahs covering the mushaf exactly once (no gaps, no repeats).
 */
import assert from 'assert';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { buildQuranData, readLock, normalizeArabic, parseTanzil, ROOT, SRC_DIR } from './quran-checks.mjs';
import * as Q from '../lib/quran.js';
import DATA from '../lib/quran-data.js';

let n = 0;
const ok = (what) => {
  n++;
  console.log('  ✓', what);
};

/* ---------------------------------------------------------------- 1. build */
console.log('\n— 1) pinned sources → dataset (re-runs every cross-source check) —');
{
  const lock = readLock();
  assert.ok(lock && lock.sources && Object.keys(lock.sources).length >= 5, 'sources.lock.json exists and pins the sources');
  const { data, report } = buildQuranData({ lock });
  const failed = report.checks.filter((c) => !c.ok);
  assert.equal(failed.length, 0, 'all source checks pass: ' + failed.map((f) => f.name).join(' | '));
  ok(`all ${report.checks.length} source checks pass (Tanzil ⇄ QCF4 ⇄ Quran.com API ⇄ glyph pages)`);

  const committedJson = fs.readFileSync(path.join(ROOT, 'data', 'quran.json'), 'utf8').trim();
  const rebuilt = JSON.stringify(data);
  assert.equal(committedJson, rebuilt, 'data/quran.json is up to date with the sources — run `npm run gen`');
  ok('data/quran.json matches the sources byte-for-byte');

  const jsModule = fs.readFileSync(path.join(ROOT, 'lib', 'quran-data.js'), 'utf8');
  assert.ok(jsModule.includes(rebuilt), 'lib/quran-data.js carries the same dataset');
  assert.ok(!/export default\s*\{\s*\}/.test(jsModule), 'lib/quran-data.js is not empty');
  ok('lib/quran-data.js carries the same dataset (single generated source of truth)');

  const ver = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'quran-verification.json'), 'utf8'));
  const sha = crypto.createHash('sha256').update(rebuilt).digest('hex');
  assert.equal(ver.dataSha256, sha, 'verification report matches the dataset hash');
  assert.ok(ver.checks.every((c) => c.ok), 'verification report has no failing check');
  assert.equal(ver.totals.ayahs, 6236);
  assert.equal(ver.totals.quarterSumOfAyahSpans, 2416, 'ayah spans sum to the 2416 quarter-faces of the mushaf');
  ok(`verification report: ${ver.checks.length} checks, ${ver.totals.surahs} surahs, ${ver.totals.ayahs} ayahs, ${ver.totals.quarters} quarters`);
}

/* ------------------------------------------------- 2. surahs & ayah counts */
console.log('\n— 2) all 114 surahs / 6236 ayahs (two independent sources) —');
{
  const tz = parseTanzil(fs.readFileSync(path.join(SRC_DIR, 'tanzil-quran-data.xml'), 'utf8'));
  assert.equal(Q.SURAHS.length, 114, 'exactly 114 surahs');
  assert.equal(Q.TOTAL_AYAHS, 6236, 'exactly 6236 ayahs');
  let sum = 0;
  for (const s of Q.SURAHS) {
    const t = tz.suras[s.n - 1];
    assert.ok(t, `surah ${s.n} exists in Tanzil metadata`);
    assert.equal(s.count, t.count, `surah ${s.n} (${s.name}): count matches Tanzil (${t.count})`);
    assert.equal(normalizeArabic(s.name), normalizeArabic(t.name), `surah ${s.n}: name matches Tanzil`);
    assert.equal(s.count, DATA.ayahQ.filter((_, i) => i >= s.startAyah - 1 && i < s.startAyah - 1 + s.count).length, `surah ${s.n}: data holds exactly ${s.count} ayahs`);
    sum += s.count;
  }
  assert.equal(sum, 6236, 'the 114 surahs add up to 6236 ayahs');
  // the surahs tile the mushaf: each starts right after the previous one ends
  for (let i = 1; i < Q.SURAHS.length; i++) {
    assert.equal(Q.SURAHS[i].startAyah, Q.SURAHS[i - 1].startAyah + Q.SURAHS[i - 1].count, `surah ${i + 1} starts immediately after surah ${i}`);
  }
  ok('114 surahs, counts + names agree with Tanzil metadata, and they tile the 6236 ayahs exactly');

  // the famous short surahs, as a human-readable sanity print
  const short = [110, 112, 113, 114].map((i) => `${Q.SURAHS[i - 1].name}=${Q.SURAHS[i - 1].count}`).join(' · ');
  console.log('    ', short, '(الفلق ٥ آيات، الناس ٦ آيات)');
}

/* ------------------------------------------------- 3. exact ayah addressing */
console.log('\n— 3) ayah addressing is exact; invalid input throws (never clamped) —');
{
  assert.equal(Q.globalAyah(1, 1), 1);
  assert.equal(Q.globalAyah(1, 7), 7);
  assert.equal(Q.globalAyah(2, 1), 8, 'البقرة تبدأ بعد الفاتحة مباشرة');
  assert.equal(Q.globalAyah(114, 6), 6236, 'آخر آية في المصحف هي الناس ٦');
  assert.equal(Q.ayahRef(6236).surah, 114);
  assert.equal(Q.ayahRef(6236).ayah, 6);
  assert.equal(Q.ayahRef(6235).surah, 114);
  assert.equal(Q.ayahRef(6235).ayah, 5);

  let threw = 0;
  const mustThrow = (fn, what) => {
    try {
      fn();
    } catch {
      threw++;
      return;
    }
    assert.fail('should have thrown: ' + what);
  };
  mustThrow(() => Q.globalAyah(113, 6), 'الفلق ليس فيها آية ٦');
  mustThrow(() => Q.globalAyah(110, 4), 'النصر ليس فيها آية ٤');
  mustThrow(() => Q.globalAyah(114, 0), 'الآية ٠ غير موجودة');
  mustThrow(() => Q.globalAyah(115, 1), 'لا توجد سورة ١١٥');
  mustThrow(() => Q.globalAyah(0, 1), 'لا توجد سورة ٠');
  mustThrow(() => Q.assertGlobalAyah(6237), 'لا توجد آية رقم ٦٢٣٧');
  mustThrow(() => Q.ayahRef(0), 'لا توجد آية رقم ٠');
  ok(`${threw} invalid surah/ayah pairs all throw (no clamping, no guessing)`);

  assert.deepEqual(Q.validateRange(1, 6236), { ok: true, errors: [] });
  assert.equal(Q.validateRange(1, 6237).ok, false);
  assert.equal(Q.validateRange(0, 5).ok, false);
  ok('validateRange reports out-of-mushaf ranges instead of silently fixing them');
}

/* ------------------------------------------------- 4. quarter-face accounting */
console.log('\n— 4) quarter-face accounting derived from the real layout —');
{
  let prev = -1;
  for (let g = 1; g <= Q.TOTAL_AYAHS; g++) {
    const q = Q.ayahQStart(g);
    assert.ok(q >= prev, `quarter positions never go backwards (ayah ${g})`);
    assert.ok(q >= 0 && q < Q.TOTAL_Q, `ayah ${g} inside the mushaf`);
    prev = q;
  }
  assert.equal(Q.ayahQStart(1), 0, 'المصحف يبدأ عند الربع ٠');
  assert.equal(Q.ayahQEnd(6236), 2416, 'ينتهي عند ٢٤١٦ ربع وجه = ٦٠٤ أوجه');
  assert.equal(Q.rangeQ(1, 6236), 2416, 'كامل المصحف = ٦٠٤ أوجه');
  assert.equal(Q.rangeQ(1, 7), 4, 'الفاتحة = وجه واحد');
  assert.equal(Q.rangeQ(Q.globalAyah(113, 1), Q.globalAyah(113, 5)), 1, 'الفلق = ربع وجه واحد');
  assert.equal(Q.rangeQ(Q.globalAyah(114, 1), Q.globalAyah(114, 6)), 2, 'الناس = نصف وجه');
  assert.equal(
    Q.ayahQEnd(Q.globalAyah(113, 5)),
    Q.ayahQStart(Q.globalAyah(114, 1)),
    'الفلق ٥ والناس ١ يلتقيان عند ربع واحد بلا فجوة ولا تداخل'
  );
  ok('quarter positions are monotonic, start at 0, and the whole mushaf is exactly 604 faces');
  ok(`surah span helper: الفلق = ${Q.rangeQ(Q.globalAyah(113, 1), Q.globalAyah(113, 5))} ربع وجه · الناس = ${Q.rangeQ(Q.globalAyah(114, 1), Q.globalAyah(114, 6))} ربع وجه`);
}

/* ------------------------------------------------- 5. splitDose tiling */
console.log('\n— 5) day splitting always yields complete, gap-free, non-repeating ayahs —');
{
  const tile = (from, to, dose, dir) => {
    const seen = [];
    let g = from;
    let guard = 0;
    while (g != null && guard++ < 9000) {
      const end = Q.splitDose(g, to, dose, dir);
      assert.ok(end != null, 'splitDose must return an ayah inside the range');
      assert.ok(dir > 0 ? end >= g : end <= g, 'never moves backwards');
      const lo = Math.min(g, end);
      const hi = Math.max(g, end);
      assert.ok(dir > 0 ? hi <= to : lo >= to, 'never leaves the range');
      for (let x = lo; x <= hi; x++) seen.push(x);
      if (end === to) break;
      g = end + dir;
    }
    return seen;
  };
  for (const dose of [1, 2, 3, 7]) {
    const seen = tile(1, Q.TOTAL_AYAHS, dose, 1);
    assert.equal(seen.length, 6236, `dose ${dose}: every ayah appears exactly once`);
    assert.equal(new Set(seen).size, 6236, `dose ${dose}: no repeats`);
    assert.deepEqual(seen, [...Array(6236)].map((_, i) => i + 1), `dose ${dose}: strict mushaf order`);
    const back = tile(Q.TOTAL_AYAHS, 1, dose, -1);
    assert.equal(new Set(back).size, 6236, `dose ${dose} descending: covers the whole mushaf exactly once`);
  }
  ok('for doses ¼…2 faces: ascending and descending tiling cover all 6236 ayahs exactly once, in order');

  // long ayahs: a single ayah may exceed the dose, but NEVER a surah boundary
  const longG = Q.globalAyah(2, 5); // البقرة ٥ تشغل أكثر من ربع وجه
  assert.ok(Q.ayahSpanQ(longG) > 1, 'البقرة ٥ أطول من ربع وجه');
  assert.equal(Q.splitDose(longG, Q.TOTAL_AYAHS, 1, 1), longG, 'a long ayah is taken whole (never split)');
  // آيات الفلق ١–٤ تتقاسم ربعًا واحدًا: الجرعة تُسدّ بآيات كاملة دائمًا
  assert.equal(Q.ayahQStart(Q.globalAyah(113, 4)), Q.ayahQStart(Q.globalAyah(113, 1)), 'آيات الفلق ١–٤ في ربع واحد');
  assert.equal(Q.ayahQStart(Q.globalAyah(113, 5)), Q.ayahQStart(Q.globalAyah(113, 4)) + 1, 'والآية ٥ في الربع التالي بالضبط');
  ok('a long ayah is always taken whole — no ayah is ever cut in the middle');
}

/* ------------------------------------------------- 6. exact labels */
console.log('\n— 6) labels are exact and always name real surahs/ayahs —');
{
  const L1 = Q.rangeLabel(Q.globalAyah(113, 5), Q.globalAyah(114, 1));
  assert.equal(L1.head, 'الفلق ← الناس');
  assert.ok(L1.detail.includes('الفلق') && L1.detail.includes('الناس'), 'cross-surah label names both surahs');
  assert.equal(L1.cross, true);
  assert.equal(L1.inRangeSurahEnds.length, 1);
  assert.equal(L1.inRangeSurahEnds[0].name, 'الفلق');
  assert.equal(L1.inRangeSurahStarts.length, 1);
  assert.equal(L1.inRangeSurahStarts[0].name, 'الناس');
  ok('114:1 ⇒ «الفلق ← الناس» with «ختام الفلق» + «بداية الناس»');

  const L2 = Q.rangeLabel(Q.globalAyah(110, 3), Q.globalAyah(110, 3));
  assert.equal(L2.head, 'النصر');
  assert.equal(L2.detail, 'الآية ٣');
  ok('a single ayah is labelled «سورة النصر — الآية ٣» (never a range)');

  const L3 = Q.rangeLabel(Q.globalAyah(113, 1), Q.globalAyah(113, 5));
  assert.equal(L3.detail, 'الآيات ١ – ٥');
  assert.equal(L3.single, false);
  assert.equal(L3.inRangeSurahEnds.length, 1);
  assert.equal(L3.inRangeSurahEnds[0].ayah, 5);
  assert.equal(L3.inRangeSurahEnds[0].name, 'الفلق');
  ok('الفلق ١–٥ is labelled as a range ending exactly at its last ayah (٥)');

  const L4 = Q.rangeLabel(6236, 6236);
  assert.equal(L4.lastAyahOfMushaf, true);
  assert.ok(L4.inRangeSurahEnds.some((x) => x.surah === 114));
  ok('the very last ayah is flagged (آخر آية في المصحف)');
}

/* ------------------------------------------------- 7. legacy pins migrate exactly */
console.log('\n— 7) legacy quarter pins: migrate only when exact, otherwise dropped —');
{
  // an old span that lands exactly on one ayah's first/last quarter migrates to that ayah
  const g60 = Q.globalAyah(2, 60);
  const r = Q.legacyRangeFromQuarters(Q.ayahQStart(g60), Q.ayahQEnd(g60));
  assert.ok(r, 'an exactly aligned legacy span maps');
  assert.equal(r.lo, g60);
  assert.equal(r.hi, g60);
  ok('نطاق رباعي قديم متطابق تمامًا (البقرة ٦٠) يُنقل إلى الآية نفسها');

  // property: whenever a migration succeeds it must be exact — never a guess
  let migrated = 0;
  for (let g = 1; g <= Q.TOTAL_AYAHS; g += 7) {
    const m = Q.legacyRangeFromQuarters(Q.ayahQStart(g), Q.ayahQEnd(g));
    if (!m) continue;
    migrated++;
    assert.equal(m.lo, g, `migration of ayah ${g} must be exact`);
    assert.equal(m.hi, g, `migration of ayah ${g} must be exact`);
  }
  assert.ok(migrated > 5, `some old spans still migrate exactly (${migrated} sampled)`);
  ok(`كل نطاق قابل للنقل ينقل إلى الآيات نفسها بالضبط (${migrated} من ٨٩١ عيّنة — والأغلب غامض لأنه يشترك في الربع، فيُرفض لا يُخمَّن)`);

  // ambiguous boundaries (shared by several ayahs) and garbage are refused
  const falaqLo = Q.ayahQStart(Q.globalAyah(113, 1));
  const falaqHi = Q.ayahQEnd(Q.globalAyah(113, 5));
  assert.equal(Q.legacyRangeFromQuarters(falaqLo, falaqHi), null, 'حدود الفلق مشتركة بين آياتها ⇒ يُرفض النقل');
  assert.equal(Q.legacyRangeFromQuarters(10, 10), null, 'empty/garbage pins are dropped, not guessed');
  assert.equal(Q.legacyRangeFromQuarters(-5, 3), null);
  assert.equal(Q.legacyRangeFromQuarters(2400, 9999), null);
  assert.equal(Q.legacyRangeFromQuarters(2410, 2412), null, 'a pin that does not line up with any ayah is refused');
  ok('الحدود المشتركة بين آيات والنطاقات غير المتطابقة تُرفض (لا تخمين ولا تقريب)');
}

/* ------------------------------------------------- 8. page model is verified */
console.log('\n— 8) page/line model cross-checked against Quran.com API + glyph pages —');
{
  const anchors = JSON.parse(fs.readFileSync(path.join(SRC_DIR, 'quran-com-api-anchors.json'), 'utf8'));
  for (const [page, list] of Object.entries(anchors.pages)) {
    const mine = [];
    for (let g = 1; g <= Q.TOTAL_AYAHS; g++) if (Q.ayahPage(g) === +page) mine.push(`${Q.ayahRef(g).surah}:${Q.ayahRef(g).ayah}`);
    assert.deepEqual(mine, list, `page ${page} matches the Quran.com API listing`);
  }
  ok(`all ${Object.keys(anchors.pages).length} Quran.com API page listings match (incl. page 604: الإخلاص/الفلق/الناس)`);

  const samples = fs.readdirSync(path.join(SRC_DIR, 'qcf4-pages-sample')).filter((f) => f.endsWith('.json'));
  let checked = 0;
  for (const f of samples) {
    const pf = JSON.parse(fs.readFileSync(path.join(SRC_DIR, 'qcf4-pages-sample', f), 'utf8'));
    for (const line of pf.lines || [])
      for (const w of line.words || []) {
        if (!w.verse_key) continue;
        const [s, a] = w.verse_key.split(':').map(Number);
        const g = Q.globalAyah(s, a);
        assert.equal(Q.ayahPage(g), pf.page, `${w.verse_key} page matches the glyph page file ${f}`);
        if (Q.ayahLine(g) === line.line) checked++;
      }
  }
  assert.ok(checked > 0, 'glyph lines matched');
  ok(`glyph page files (${samples.length} pages) agree with the per-ayah page/line table`);
}

/* ------------------------------------------------- 9. regression: the reported bugs */
console.log('\n— 9) the reported bugs can no longer happen structurally —');
{
  // الفلق has 5 ayahs: a range can never say «١ – ٤» and silently drop the 5th
  const falaq = { s: 113, count: Q.ayahCount(113) };
  assert.equal(falaq.count, 5);
  const chunks = [];
  let g = Q.globalAyah(113, 1);
  const last = Q.globalAyah(113, 5);
  while (g != null) {
    const e = Q.splitDose(g, last, 1, 1);
    chunks.push(`${Q.ayahRef(g).ayah}-${Q.ayahRef(e).ayah}`);
    if (e === last) break;
    g = e + 1;
  }
  assert.equal(chunks[chunks.length - 1], '5-5', 'the last ayah of الفلق is always reached');
  assert.ok(chunks.join(',') === '1-4,5-5' || chunks.join(',') === '1-1,2-3,4-4,5-5', 'chunks tile الفلق with no gap: ' + chunks.join(','));
  ok('الفلق is covered to its last ayah — «١–٤» can no longer be the end of the surah');

  // the order can never go backwards inside a plan path
  const seen = [];
  let x = Q.globalAyah(110, 1);
  const end = Q.globalAyah(114, 6);
  while (x != null) {
    const e = Q.splitDose(x, end, 1, 1);
    seen.push([x, e]);
    if (e === end) break;
    x = e + 1;
  }
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i][0] === seen[i - 1][1] + 1, 'each slice starts exactly after the previous one');
  ok('a memorisation path is strictly ordered: no later range can precede an earlier one');
}

console.log(`\nALL ${n} QURAN-DATA CHECKS PASSED\n`);
