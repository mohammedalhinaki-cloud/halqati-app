/*
 * Quran data checks — the single place where the app's Quranic data is built and
 * verified. Used by BOTH:
 *   • scripts/build-quran-data.mjs  (generates lib/quran-data.js + data/quran.json)
 *   • scripts/test-quran-data.mjs   (re-verifies the generated artifact in CI)
 *
 * Hard rules enforced here (see README «Data & accuracy»):
 *   1. NOTHING is guessed. Every ayah count, name and page comes from a pinned
 *      source file whose sha256 is checked against data/sources/sources.lock.json.
 *   2. Two independent lineages must agree on every surah: Tanzil metadata
 *      (tanzil.net quran-data.xml) and the QCF4/QPC Hafs mushaf database
 *      (Madinah Mushaf 1441H, the layout served by Quran.com).
 *   3. Two more lineages are used as anchored spot checks: the Quran.com API v4
 *      page listings and the QCF4 per-page glyph files.
 *   4. Any disagreement, missing ayah, out-of-range value or non-monotonic
 *      layout ABORTS the build — a wrong table is never produced.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const LINES_PER_PAGE = 15;
export const QUARTERS_PER_PAGE = 4;
export const TOTAL_PAGES = 604;
export const TOTAL_QUARTERS = TOTAL_PAGES * QUARTERS_PER_PAGE; // 2416
export const TOTAL_AYAHS = 6236;

export const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
export const SRC_DIR = path.join(ROOT, 'data', 'sources');

/* ------------------------------------------------------------------ helpers */

export const sha256 = (file) =>
  crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

/**
 * Quarter-face (¼ وجه) position of a mushaf line.
 * 1 face (وجه) = 1 page = 15 lines = 4 quarter-faces (≈3.75 lines each).
 * This is the accounting unit of the Tahfiz card; it is derived — never guessed.
 */
export function qOf(page, line) {
  if (!Number.isInteger(page) || page < 1 || page > TOTAL_PAGES) throw new Error(`bad page ${page}`);
  if (!Number.isInteger(line) || line < 1 || line > LINES_PER_PAGE) throw new Error(`bad line ${line}`);
  return (page - 1) * QUARTERS_PER_PAGE + Math.floor(((line - 1) * QUARTERS_PER_PAGE) / LINES_PER_PAGE);
}

/** Strip diacritics/hamza spelling so two Arabic spellings can be compared. */
export function normalizeArabic(s) {
  return String(s || '')
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, '')
    .replace(/[\u0622\u0623\u0625\u0627\u0671]/g, '\u0627')
    .replace(/\u0649/g, '\u064A')
    .replace(/\u0629/g, '\u0647')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Parse the attribute bag of one XML tag. */
function attrs(tag) {
  const out = {};
  for (const m of tag.matchAll(/([a-zA-Z_]+)="([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}
const tags = (xml, name) => [...xml.matchAll(new RegExp(`<${name}\\b[^>]*/>`, 'g'))].map((m) => attrs(m[0]));

/** Tanzil metadata file (tanzil.net quran-data.xml, CC-BY 3.0). */
export function parseTanzil(xml) {
  const suras = tags(xml, 'sura').map((a) => ({
    n: +a.index,
    name: a.name,
    count: +a.ayas,
    startAyah: +a.start, // 0-based index of the sura's first ayah in mushaf order
    place: a.type,
    order: +a.order,
    rukus: +a.rukus,
  }));
  const juzs = tags(xml, 'juz').map((a) => ({ n: +a.index, sura: +a.sura, ayah: +a.aya }));
  const hizbs = tags(xml, 'hizb').map((a) => ({ n: +a.index, sura: +a.sura, ayah: +a.aya }));
  const pages = tags(xml, 'page').map((a) => ({ n: +a.index, sura: +a.sura, ayah: +a.aya }));
  const sajdas = tags(xml, 'sajda').map((a) => ({ n: +a.index, sura: +a.sura, ayah: +a.aya, type: a.type }));
  return { suras, juzs, hizbs, pages, sajdas };
}

class Report {
  constructor() {
    this.checks = [];
  }
  ok(name, detail) {
    this.checks.push({ name, ok: true, detail });
    return true;
  }
  /** returns true when the condition holds, records the check either way */
  expect(cond, name, detail) {
    this.checks.push({ name, ok: !!cond, detail });
    if (!cond) this.failures.push(`${name}${detail ? ' — ' + detail : ''}`);
    return !!cond;
  }
  fail(name, detail) {
    return this.expect(false, name, detail);
  }
}

/**
 * Build the canonical Quran dataset from the pinned sources.
 * @param {object} opts  { srcDir, lock, allowMissingLock }
 * @returns {{ data, report, sources }}
 */
export function buildQuranData({ srcDir = SRC_DIR, lock, allowMissingLock = false } = {}) {
  const read = (f) => path.join(srcDir, f);
  const files = {
    tanzil: 'tanzil-quran-data.xml',
    qcf4Index: 'qcf4-index.json',
    qcf4Verses: 'qcf4-verses.json',
    apiAnchors: 'quran-com-api-anchors.json',
    pageModelNotes: 'page-model-notes.json',
  };
  const sources = {};
  for (const [k, f] of Object.entries(files)) {
    if (!fs.existsSync(read(f))) throw new Error(`missing source file: data/sources/${f}`);
    sources[k] = { file: `data/sources/${f}`, sha256: sha256(read(f)) };
  }
  const pagesSampleDir = path.join(srcDir, 'qcf4-pages-sample');
  const pageSamples = fs.existsSync(pagesSampleDir)
    ? fs.readdirSync(pagesSampleDir).filter((f) => /^\d+\.json$/.test(f)).sort()
    : [];
  for (const f of pageSamples) {
    sources[`page${f.replace('.json', '')}`] = {
      file: `data/sources/qcf4-pages-sample/${f}`,
      sha256: sha256(path.join(pagesSampleDir, f)),
    };
  }

  if (lock) {
    for (const [k, s] of Object.entries(sources)) {
      const pinned = lock.sources?.[k];
      if (!pinned) throw new Error(`source «${k}» is not pinned in sources.lock.json (${s.file})`);
      if (pinned.sha256 !== s.sha256)
        throw new Error(
          `source «${k}» (${s.file}) changed!\n  pinned: ${pinned.sha256}\n  actual: ${s.sha256}\n` +
            `If this change is intentional, verify the new file and update data/sources/sources.lock.json.`
        );
    }
  } else if (!allowMissingLock) {
    throw new Error('no sources.lock.json supplied — refusing to build Quran data without pinned checksums');
  }

  const report = new Report();
  report.failures = [];

  const tanzil = parseTanzil(fs.readFileSync(read(files.tanzil), 'utf8'));
  const index = JSON.parse(fs.readFileSync(read(files.qcf4Index), 'utf8'));
  const verses = JSON.parse(fs.readFileSync(read(files.qcf4Verses), 'utf8'));
  const anchors = JSON.parse(fs.readFileSync(read(files.apiAnchors), 'utf8'));
  const notes = JSON.parse(fs.readFileSync(read(files.pageModelNotes), 'utf8'));

  /* ---------------- 1. surah list: two independent lineages must agree ----- */
  report.expect(tanzil.suras.length === 114, 'Tanzil: 114 suras', `got ${tanzil.suras.length}`);
  report.expect(index.chapters.length === 114, 'QCF4: 114 chapters', `got ${index.chapters.length}`);
  const tanzilSum = tanzil.suras.reduce((n, s) => n + s.count, 0);
  const qcf4Sum = index.chapters.reduce((n, c) => n + c.verses_count, 0);
  report.expect(tanzilSum === TOTAL_AYAHS, 'Tanzil: exactly 6236 ayahs', `got ${tanzilSum}`);
  report.expect(qcf4Sum === TOTAL_AYAHS, 'QCF4: exactly 6236 ayahs', `got ${qcf4Sum}`);

  const chapters = index.chapters.slice().sort((a, b) => a.id - b.id);
  const badCounts = [];
  const badNames = [];
  for (const t of tanzil.suras) {
    const c = chapters[t.n - 1];
    if (!c) {
      badCounts.push(`surah ${t.n}: missing from QCF4`);
      continue;
    }
    if (c.verses_count !== t.count)
      badCounts.push(`surah ${t.n} (${t.name}): Tanzil=${t.count} QCF4=${c.verses_count}`);
    if (normalizeArabic(c.name_arabic) !== normalizeArabic(t.name))
      badNames.push(`surah ${t.n}: Tanzil="${t.name}" QCF4="${c.name_arabic}"`);
  }
  report.expect(badCounts.length === 0, 'every surah has the same ayah count in both sources', badCounts.join(' | '));
  report.expect(badNames.length === 0, 'every surah name agrees in both sources (after normalisation)', badNames.join(' | '));

  /* ---------------- 2. per-ayah records: page + line + order --------------- */
  const keys = Object.keys(verses);
  report.expect(keys.length === TOTAL_AYAHS, 'QCF4: a record for every one of the 6236 ayahs', `got ${keys.length}`);

  const ayahs = []; // 0-based global order
  const seenPages = new Set();
  for (const c of chapters) {
    for (let a = 1; a <= c.verses_count; a++) {
      const e = verses[`${c.id}:${a}`];
      if (!e) {
        report.fail('every ayah key exists', `missing ${c.id}:${a}`);
        continue;
      }
      if (!Number.isInteger(e.page) || e.page < 1 || e.page > TOTAL_PAGES)
        report.fail('ayah page in range', `${c.id}:${a} page=${e.page}`);
      if (!Array.isArray(e.lines) || !e.lines.length) report.fail('ayah has lines', `${c.id}:${a}`);
      for (const L of e.lines) {
        if (!Number.isInteger(L.line) || L.line < 1 || L.line > LINES_PER_PAGE)
          report.fail('ayah line in range', `${c.id}:${a} line=${L.line}`);
      }
      const first = Math.min(...e.lines.map((L) => L.line));
      const last = Math.max(...e.lines.map((L) => L.line));
      seenPages.add(e.page);
      ayahs.push({
        g: ayahs.length + 1, // 1-based global ayah number (mushaf order)
        surah: c.id,
        ayah: a,
        page: e.page,
        line: first,
        lastLine: last,
        q: qOf(e.page, first),
      });
    }
  }
  report.expect(seenPages.size === TOTAL_PAGES, 'every one of the 604 pages carries at least one ayah', `got ${seenPages.size}`);

  // mushaf order is strict: (page, line) never goes backwards
  let monotonic = true;
  for (let i = 1; i < ayahs.length; i++) {
    const p = ayahs[i - 1],
      c = ayahs[i];
    if (c.page < p.page || (c.page === p.page && c.line < p.line)) {
      monotonic = false;
      report.fail('mushaf order is monotonic', `${p.surah}:${p.ayah} (p${p.page} l${p.line}) -> ${c.surah}:${c.ayah} (p${c.page} l${c.line})`);
      break;
    }
  }
  report.expect(monotonic, 'ayah layout is monotonic in mushaf order (page, then line)');

  // Every surah must BEGIN on the page the QCF4 index declares. (The index's
  // last-page field follows the older Madinah pagination for 6 surahs; those are
  // pinned in page-model-notes.json and checked below instead of being ignored.)
  const badFirstPage = [];
  const unexpectedLastPage = [];
  for (const c of chapters) {
    const first = ayahs.find((x) => x.surah === c.id && x.ayah === 1);
    const last = ayahs.filter((x) => x.surah === c.id).pop();
    if (!first || !last) continue;
    if (first.page !== c.pages[0]) badFirstPage.push(`${c.id}: first page ${first.page} != ${c.pages[0]}`);
    if (last.page !== c.pages[1]) unexpectedLastPage.push({ surah: c.id, name: c.name_arabic, indexLastPage: c.pages[1], layoutLastPage: last.page });
  }
  report.expect(badFirstPage.length === 0, 'every surah begins on the page the QCF4 index declares', badFirstPage.join(' | '));
  const pinnedLast = notes.indexLastPageDeviations || [];
  const lastMismatch =
    unexpectedLastPage.length !== pinnedLast.length ||
    unexpectedLastPage.some(
      (x) =>
        !pinnedLast.some(
          (p) => p.surah === x.surah && p.indexLastPage === x.indexLastPage && p.layoutLastPage === x.layoutLastPage
        )
    );
  report.expect(
    !lastMismatch,
    `the 6 known index last-page deviations are exactly the pinned ones (${pinnedLast.map((p) => p.name).join(', ')})`,
    `actual: ${unexpectedLastPage.map((x) => `${x.name} ${x.indexLastPage}→${x.layoutLastPage}`).join(', ')}`
  );

  /* ---------------- 3. Tanzil page boundaries -> independent page check ---- */
  if (tanzil.pages.length !== TOTAL_PAGES)
    report.fail('Tanzil: 604 page entries', `got ${tanzil.pages.length}`);
  const pagesSorted = tanzil.pages.slice().sort((a, b) => a.n - b.n);
  // ayah index (0-based) of every Tanzil page start
  const tanzilPageStart = pagesSorted.map((p) => {
    const s = tanzil.suras[p.sura - 1];
    return (s ? s.startAyah : 0) + (p.ayah - 1);
  });
  const deviations = [];
  let worstDelta = 0;
  for (let i = 0; i < ayahs.length; i++) {
    // last page whose start index <= i
    let lo = 0,
      hi = tanzilPageStart.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (tanzilPageStart[mid] <= i) lo = mid;
      else hi = mid - 1;
    }
    const tzPage = lo + 1;
    const delta = ayahs[i].page - tzPage;
    if (delta !== 0) {
      worstDelta = Math.max(worstDelta, Math.abs(delta));
      deviations.push({ key: `${ayahs[i].surah}:${ayahs[i].ayah}`, tanzilPage: tzPage, qcf4Page: ayahs[i].page });
    }
  }
  // Tanzil's page table follows the older Madinah pagination: a small, closed
  // set of ayahs sits one page earlier/later. Anything new or >1 page = failure.
  const pinnedDev = notes.tanzilPageDeviations || [];
  const devMatches =
    deviations.length === pinnedDev.length &&
    deviations.every(
      (d, i) => d.key === pinnedDev[i].key && d.tanzilPage === pinnedDev[i].tanzilPage && d.qcf4Page === pinnedDev[i].qcf4Page
    );
  report.expect(devMatches, `Tanzil page table agrees with the layout on ${ayahs.length - deviations.length}/${ayahs.length} ayahs; the rest are the pinned older-print deviations`, JSON.stringify(deviations.slice(0, 4)));
  report.expect(worstDelta <= 1, 'every pagination difference between the two prints is exactly one page', `worst delta=${worstDelta}`);

  /* ---------------- 4. Quran.com API anchors (official API lineage) -------- */
  const pageLists = new Map(); // page -> [ 's:a', ... ]
  for (const a of ayahs) {
    if (!pageLists.has(a.page)) pageLists.set(a.page, []);
    pageLists.get(a.page).push(`${a.surah}:${a.ayah}`);
  }
  const anchorBad = [];
  for (const [page, list] of Object.entries(anchors.pages)) {
    const mine = (pageLists.get(+page) || []).join(',');
    const theirs = list.join(',');
    if (mine !== theirs) anchorBad.push(`page ${page}: api=[${theirs}] data=[${mine}]`);
  }
  report.expect(
    anchorBad.length === 0,
    `Quran.com API anchors (${Object.keys(anchors.pages).length} pages, incl. 604 = الفلق/الناس) match the data`,
    anchorBad.join(' | ')
  );

  /* ---------------- 5. per-page glyph files as an extra anchor ------------- */
  const sampleBad = [];
  let sampled = 0;
  for (const f of pageSamples) {
    const pf = JSON.parse(fs.readFileSync(path.join(pagesSampleDir, f), 'utf8'));
    const page = pf.page;
    const derived = new Map(); // verse_key -> first line
    for (const line of pf.lines || [])
      for (const w of line.words || [])
        if (w.verse_key && !derived.has(w.verse_key)) derived.set(w.verse_key, line.line);
    for (const [key, line] of derived) {
      const [s, a] = key.split(':').map(Number);
      const rec = ayahs.find((x) => x.surah === s && x.ayah === a);
      sampled++;
      if (!rec || rec.page !== page || rec.line !== line)
        sampleBad.push(`${key}: pages-file p${page} l${line} vs data p${rec?.page} l${rec?.line}`);
    }
  }
  report.expect(
    sampleBad.length === 0,
    `QCF4 page-glyph sample (${pageSamples.length} pages, ${sampled} ayahs) matches the per-ayah layout`,
    sampleBad.join(' | ')
  );

  /* ---------------- 6. quarter-face accounting ---------------------------- */
  // An ayah spans [q(this ayah), q(next ayah)); the last ayah of the mushaf ends at 2416.
  const ayahQ = ayahs.map((x) => x.q);
  let qMonotonic = true;
  for (let i = 1; i < ayahQ.length; i++)
    if (ayahQ[i] < ayahQ[i - 1]) {
      qMonotonic = false;
      report.fail('quarter positions are monotonic', `ayah ${i + 1} q=${ayahQ[i]} < ${ayahQ[i - 1]}`);
      break;
    }
  report.expect(qMonotonic, 'quarter-face positions never go backwards');
  report.expect(ayahQ[0] === 0, 'the mushaf starts at quarter-face 0', `got ${ayahQ[0]}`);
  const lastQ = ayahQ[ayahQ.length - 1];
  report.expect(lastQ < TOTAL_QUARTERS, 'every quarter position is inside the mushaf', `last=${lastQ}`);
  report.expect(ayahs.length === TOTAL_AYAHS, 'exactly 6236 ayah records built', `got ${ayahs.length}`);

  /* ---------------- 7. emit ------------------------------------------------ */
  let cursor = 0;
  const surahs = chapters.map((c) => {
    const first = cursor + 1; // 1-based global ayah number
    const count = c.verses_count;
    cursor += count;
    const qStart = ayahQ[first - 1];
    const qEnd = cursor < ayahQ.length ? ayahQ[cursor] : TOTAL_QUARTERS;
    return {
      n: c.id,
      name: c.name_arabic,
      count,
      startAyah: first,
      page: c.pages[0],
      lastPage: c.pages[1],
      qStart,
      qEnd,
      bismillah: !!c.bismillah_pre,
    };
  });

  const data = {
    meta: {
      generatedBy: 'scripts/build-quran-data.mjs',
      source: 'QCF4 / QPC Hafs Madinah Mushaf (1441H) layout + Tanzil metadata, cross-checked',
      pages: TOTAL_PAGES,
      linesPerPage: LINES_PER_PAGE,
      quartersPerPage: QUARTERS_PER_PAGE,
      totalQuarters: TOTAL_QUARTERS,
      totalAyahs: TOTAL_AYAHS,
      surahs: 114,
      sources: Object.fromEntries(
        Object.entries(sources).map(([k, v]) => [k, { file: v.file, sha256: v.sha256 }])
      ),
      checks: 'data/quran-verification.json',
    },
    surahs,
    ayahQ, // 6236 quarter-face starts, index 0 = 1:1
    ayahPage: ayahs.map((x) => x.page),
    ayahLine: ayahs.map((x) => x.line),
  };

  return { data, report, sources, ayahs };
}

/** Convenience: read the pinned lock file. */
export function readLock(srcDir = SRC_DIR) {
  const p = path.join(srcDir, 'sources.lock.json');
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
}
