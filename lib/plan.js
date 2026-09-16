/*
 * lib/plan.js — the plan engine.
 *
 * The unit of work is a WHOLE AYAH RANGE from lib/quran.js (the single, verified
 * Quran source). Quarter-faces (¼ وجه) are only used to measure/dose the amount
 * of work a day holds, never to name the content: a day's slice is built by
 * taking complete ayahs until the daily dose is reached (always at least one
 * ayah), so a range is:
 *   • always inside the student's range,
 *   • always a set of complete successive ayahs in mushaf order,
 *   • never able to exceed a surah's ayah count or to skip/repeat an ayah, and
 *   • labelled straight from the verified surah/ayah data (never snapped).
 *
 * Streams (each with independent marks):
 *   hifz  — the slot engine («حفظ / لم يحفظ / غائب»). A day marked missed/absent
 *           keeps its own slice visible and does NOT advance the plan, so the
 *           whole schedule slides one day: nothing is ever merged into another
 *           day's dose and no ayah is skipped.
 *   minor — AUTOMATIC queue: the ayah range actually saved on day X is due for
 *           review on day X+1, chunked with the same daily dose.
 *   major — OPTIONAL descending ride over the WHOLE mushaf with its own chosen
 *           dose; «لم تتم / غائب / لا يوجد» slide it independently.
 *
 * buildPlan() ends with an AUDIT of every range it produced (bounds, ordering,
 * contiguity, coverage). If the audit finds a problem the plan is not returned:
 * it throws, so a wrong table can never reach the screen.
 */
import {
  TOTAL_AYAHS,
  QPP,
  toQ,
  surahByNumber,
  surahSpanRange,
  globalAyah,
  ayahRef,
  rangeQ,
  splitDose,
  makeRange,
  validateRange,
  legacyRangeFromQuarters,
} from './quran.js';

/* ---------- dates (all local-time, YYYY-MM-DD strings) ---------- */
export function parseISO(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return new Date(NaN);
  return new Date(+m[1], +m[2] - 1, +m[3]);
}
export function iso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function addDays(d, n) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}
/** Sunday-start week key: Sun..Wed of the same halaqa week share one key */
export function weekKey(isoStr) {
  const d = parseISO(isoStr);
  return iso(addDays(d, -d.getDay())); // getDay: Sunday=0
}

/* Hijri labels live in lib/hijri.js (Intl Umm al-Qura) */
export { hijriInfo, formatHijri, weekdayName } from './hijri.js';

export function parseHolidays(str) {
  return new Set(
    String(str || '')
      .split(/[,،\s]+/)
      .map((s) => s.trim())
      .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s))
  );
}

/**
 * Every Sun..Wed calendar date in [start..end] (inclusive).
 * Returns [{iso, holiday:boolean}] — holidays kept for display, flagged.
 */
export function calendarDays(startStr, endStr, holidaySet) {
  const out = [];
  if (!startStr || !endStr) return out;
  let d = parseISO(startStr);
  const end = parseISO(endStr);
  let guard = 0;
  while (d <= end && guard++ < 4000) {
    const dow = d.getDay(); // Sunday=0 .. Wednesday=3 are working days
    if (dow >= 0 && dow <= 3) out.push({ iso: iso(d), holiday: holidaySet.has(iso(d)) });
    d = addDays(d, 1);
  }
  return out;
}

export function workingDayCount(settings) {
  return calendarDays(settings.startDate, settings.endDate, parseHolidays(settings.holidays)).filter((x) => !x.holiday).length;
}

/* ---------- manual pins --------------------------------------------------- */
/**
 * A manual pin is stored as a real ayah range: {s1,a1,s2,a2} (surah+ayah pairs)
 * — the same source of truth as everything else. Legacy quarter pins {qLo,qHi}
 * are migrated with lib/quran.js legacyRangeFromQuarters(); an unmappable legacy
 * pin is DROPPED and reported, never approximated.
 */
function readPin(pin, travelDir, issues, label) {
  if (!pin || typeof pin !== 'object') return null;
  if (Number.isFinite(Number(pin.s1)) && Number.isFinite(Number(pin.a1)) && Number.isFinite(Number(pin.s2)) && Number.isFinite(Number(pin.a2))) {
    try {
      const loG = globalAyah(Number(pin.s1), Number(pin.a1));
      const hiG = globalAyah(Number(pin.s2), Number(pin.a2));
      const r = makeRange(loG, hiG);
      return travelDir < 0 ? { from: r.hi, to: r.lo } : { from: r.lo, to: r.hi };
    } catch (e) {
      issues.push(`${label}: ${e.message}`);
      return null;
    }
  }
  if (Number.isFinite(Number(pin.qLo)) && Number.isFinite(Number(pin.qHi))) {
    const r = legacyRangeFromQuarters(pin.qLo, pin.qHi);
    if (!r) {
      issues.push(`${label}: مقدار قديم بالنظام الربعي (${pin.qLo}–${pin.qHi}) لا يمكن تحويله إلى آيات محددة بدقة — أُلغي، يرجى إعادة تثبيت المقدار من القائمة الجديدة`);
      return null;
    }
    return travelDir < 0 ? { from: r.hi, to: r.lo } : { from: r.lo, to: r.hi };
  }
  return null;
}

/* ---------- the engine ---------------------------------------------------- */
export function buildPlan(student, settings) {
  const issues = [];
  const validSurah = (x) => Number.isInteger(x) && x >= 1 && x <= 114;
  const rawFrom = Number(student.from);
  const rawTo = Number(student.to);
  const fromN = validSurah(rawFrom) ? rawFrom : 1;
  const toN = validSurah(rawTo) ? rawTo : 114;
  if (!validSurah(rawFrom) || !validSurah(rawTo)) issues.push('مدى السور غير صحيح — استُخدم المدى الكامل: الفاتحة ← الناس');

  const descending = fromN > toN;
  const dir = descending ? -1 : 1;
  const { loG, hiG } = surahSpanRange(Math.min(fromN, toN), Math.max(fromN, toN));
  const startG = descending ? hiG : loG; // first ayah of the plan
  const endG = descending ? loG : hiG; // last ayah of the plan (inclusive)

  const totalQ = rangeQ(loG, hiG);
  const baseQ = Math.max(1, toQ(student.dailyHifz || 0.5));
  const majorOn = !!student.majorEnabled;
  // The major-review dose is chosen by the teacher like the hifz wird; legacy
  // students without a choice fall back to نصف وجه.
  const majorBaseQ = Number(student.majorBaseQ) > 0 ? Number(student.majorBaseQ) : toQ(0.5);

  const overrides = student.overrides || {};
  const holidays = parseHolidays(settings.holidays);
  const days = calendarDays(settings.startDate, settings.endDate, holidays);

  const stOf = (date, stream) => {
    const s = student.statuses && student.statuses[date];
    if (!s) return null;
    if (typeof s === 'string') return stream === 'hifz' ? s : null;
    return s[stream] || null;
  };

  /* ---- hifz slice chain: slices[i] = the i-th daily dose, in travel order --- */
  let chain = [];
  let chainBase = 0; // index of chain[0]
  let chainOrigin = startG; // ayah where the NEXT slice starts
  let chainDone = false;
  const inTravel = (g) => (dir > 0 ? g <= endG : g >= endG);
  function sliceAt(i) {
    if (i < chainBase) return null;
    while (chain.length <= i - chainBase && !chainDone) {
      const prev = chain.length ? chain[chain.length - 1] : null;
      const from = prev ? prev.to + dir : chainOrigin;
      if (!inTravel(from)) {
        chainDone = true;
        break;
      }
      chain.push({ from, to: splitDose(from, endG, baseQ, dir) });
    }
    const j = i - chainBase;
    return j >= 0 && j < chain.length ? chain[j] : null;
  }
  /** a manual pin replaces the chain from that slot on (later slots rebuilt) */
  function resetChainAt(i, range) {
    chainBase = i;
    chain = range ? [{ from: range.from, to: range.to, manual: true }] : [];
    chainOrigin = range ? range.to + dir : chainOrigin;
    chainDone = false;
  }
  /** how many daily slices are still needed from index i to finish the range */
  function slicesLeftFrom(i) {
    let n = 0;
    while (n < 4000 && sliceAt(i + n)) n++;
    return n;
  }

  /* ---- major chain: descending ride over the whole mushaf ------------------ */
  const majorChain = [];
  let majorDone = false;
  function majorSliceAt(j) {
    while (majorChain.length <= j && !majorDone) {
      const prev = majorChain.length ? majorChain[majorChain.length - 1] : null;
      const from = prev ? prev.to - 1 : TOTAL_AYAHS;
      if (from < 1) {
        majorDone = true;
        break;
      }
      majorChain.push({ from, to: splitDose(from, 1, majorBaseQ, -1) });
    }
    return j < majorChain.length ? majorChain[j] : null;
  }
  /** number of slices in one full descent (people call it a دورة) */
  let majorRideLen = 0;
  function rideLength() {
    if (!majorRideLen) {
      let j = 0;
      while (j < 100000 && majorSliceAt(j)) j++;
      majorRideLen = Math.max(1, j);
    }
    return majorRideLen;
  }

  /* ---- state -------------------------------------------------------------- */
  const rows = [];
  let misses = 0; // hifz slots burned by «لم يحفظ/غائب» (the plan slides)
  let savedQ = 0; // verified hifz progress (marked «حفظ» only)
  let mMisses = 0; // major slots burned
  const minorFed = []; // one entry per real saved slice
  let nMinor = 0; // minor pointer (consumed + burned entries)
  let dayIdx = 0;
  let nextDue = 0; // lowest slot that still has to be performed
  let pinsUsed = false; // a manual pin rewrote the natural slice chain
  const stats = {
    saved: 0,
    missed: 0,
    absent: 0,
    pending: 0,
    minorDone: 0,
    minorPending: 0,
    minorMissed: 0,
    minorAbsent: 0,
    minorSavedQ: 0,
    major: { saved: 0, missed: 0, absent: 0, none: 0, savedQ: 0, pendingDays: 0, pendingQ: 0 },
  };

  const step = (d, beyondPlan) => {
    const k = dayIdx - misses;
    const row = {
      type: 'day',
      date: d.iso,
      holiday: false,
      beyondPlan,
      direction: descending ? 'desc' : 'asc',
      shiftBefore: misses,
      shiftedBy: misses,
      baseQ,
      slotIndex: k < 0 ? null : k,
      status: null,
      gFrom: null,
      gTo: null,
      amountQ: 0,
      plannedQ: 0,
      rolledToNext: 0,
      empty: false,
    };

    /* ---- hifz ---- */
    const pin = readPin(overrides[d.iso] && overrides[d.iso].hifz, dir, issues, `تثبيت الحفظ ${d.iso}`);
    const hStatus = stOf(d.iso, 'hifz');
    let content = pin;
    if (hStatus === 'saved') {
      content = pin || sliceAt(k);
      row.rolledToNext = 0;
      if (content) {
        savedQ += rangeQ(content.from, content.to);
        minorFed.push({ from: content.from, to: content.to, dir, day: dayIdx });
      }
      nextDue = Math.min(nextDue, Math.max(0, k)); // this slot still re-runs if the teacher un-does the mark
      stats.saved++;
    } else if (hStatus === 'missed' || hStatus === 'absent') {
      // The red cell keeps its OWN slice for visibility; the same slice re-runs
      // on the next working day — the plan slides, nothing is merged.
      content = pin || sliceAt(k);
      row.rolledToNext = content ? rangeQ(content.from, content.to) : 0;
      misses++;
      stats[hStatus]++;
    } else {
      const pk = Math.max(k, nextDue);
      content = pin || sliceAt(pk);
      nextDue = pk + 1;
      stats.pending++;
    }
    if (pin) {
      // a manual pin becomes the chain from this slot onward (later days rebuild from its end)
      resetChainAt(Math.max(0, k), pin);
      nextDue = Math.max(nextDue, Math.max(0, k) + 1);
      pinsUsed = true;
    }
    if (content) {
      row.status = hStatus;
      row.gFrom = content.from;
      row.gTo = content.to;
      row.amountQ = rangeQ(content.from, content.to);
      row.plannedQ = hStatus === 'saved' ? row.amountQ : 0;
      row.label = null; // filled by the UI via rangeLabel(row.gFrom, row.gTo)
    } else {
      row.status = hStatus;
      row.empty = true; // plan range finished
    }

    /* ---- minor review (fed only by real saves, due the next day) ---- */
    const normSt = (v) => (v === 'saved' ? 'done' : v || null);
    const minorStatus = normSt(stOf(d.iso, 'minor'));
    const mDue = nMinor < minorFed.length && minorFed[nMinor].day < dayIdx;
    let minor = { gFrom: null, gTo: null, plannedQ: 0, status: minorStatus, pendingDays: 0, preview: false, limitG: null };
    if (mDue) {
      const src = minorFed[nMinor];
      const chunkFrom = src.dir < 0 ? src.to : src.from;
      const chunkTo = splitDose(chunkFrom, src.dir < 0 ? src.from : src.to, baseQ, src.dir);
      minor = {
        gFrom: chunkFrom,
        gTo: chunkTo,
        limitG: src.dir < 0 ? src.from : src.to, // far end of what was really saved
        plannedQ: rangeQ(chunkFrom, chunkTo),
        status: minorStatus,
        pendingDays: dayIdx - src.day,
        preview: false,
        fromDay: src.day,
      };
      if (!minorStatus) stats.minorPending++;
      if (minorStatus === 'done') {
        stats.minorDone++;
        stats.minorSavedQ += minor.plannedQ;
        nMinor++;
      } else if (minorStatus === 'missed' || minorStatus === 'absent') {
        stats[minorStatus === 'missed' ? 'minorMissed' : 'minorAbsent']++;
        // «لم تتم / غائب» defers this review a whole day: the SAME chunk comes
        // back tomorrow. The queue pointer is deliberately NOT advanced —
        // sliding, never skipping and never merging.
      }
    } else if (minorStatus === 'done') {
      stats.minorDone++;
    }
    const minorPin = readPin(overrides[d.iso] && overrides[d.iso].minor, dir, issues, `تثبيت الصغرى ${d.iso}`);
    if (minorPin) minor = { ...minor, gFrom: minorPin.from, gTo: minorPin.to, plannedQ: rangeQ(minorPin.from, minorPin.to) };
    row.minor = minor;

    /* ---- major review (whole mushaf, its own dose, independent slide) ---- */
    if (majorOn) {
      const majStatus = normSt(stOf(d.iso, 'major'));
      let majCell = { gFrom: null, gTo: null, plannedQ: 0, status: majStatus, pendingDays: mMisses, cycle: 1 };
      if (majStatus === 'missed' || majStatus === 'absent' || majStatus === 'none') {
        mMisses++;
        stats.major[majStatus]++;
      } else {
        const j = Math.max(0, dayIdx - mMisses);
        const span = majorSliceAt(j);
        if (span) {
          majCell = {
            gFrom: span.from,
            gTo: span.to,
            plannedQ: rangeQ(span.from, span.to),
            status: majStatus === 'done' ? 'done' : null,
            preview: false,
            cycle: Math.floor(j / rideLength()) + 1,
            pendingDays: mMisses,
          };
          if (majStatus === 'done') {
            stats.major.saved++;
            stats.major.savedQ += majCell.plannedQ;
          }
        }
      }
      const majorPin = readPin(overrides[d.iso] && overrides[d.iso].major, -1, issues, `تثبيت الكبرى ${d.iso}`);
      if (majorPin) majCell = { ...majCell, gFrom: majorPin.from, gTo: majorPin.to, plannedQ: rangeQ(majorPin.from, majorPin.to) };
      // exact remaining work of the current descent (never an estimate)
      const nextMajor = majorSliceAt(Math.max(0, dayIdx - mMisses + (majStatus ? 1 : 0)));
      stats.major.pendingDays = mMisses;
      stats.major.pendingQ = nextMajor ? rangeQ(nextMajor.from, 1) : 0;
      row.major = majCell;
    }

    dayIdx++;
    rows.push(row);
  };

  for (const d of days) {
    if (d.holiday) {
      rows.push({ type: 'holiday', date: d.iso });
      continue;
    }
    step(d, false);
  }

  /* ---- extension: after the plan end, days materialise only for real marks --- */
  const lastDay = days.length ? days[days.length - 1].iso : settings.endDate;
  if (lastDay && settings.endDate && misses > 0) {
    const marksBeyond = Object.keys(student.statuses || {}).some((key) => {
      if (key <= settings.endDate) return false;
      const v = student.statuses[key];
      const h = typeof v === 'string' ? v : v && v.hifz;
      return !!h;
    });
    const stillNeeded = slicesLeftFrom(Math.max(0, nextDue));
    const extraNeeded = marksBeyond ? misses + Math.min(stillNeeded, 14) : misses;
    if (extraNeeded > 0) {
      let d = addDays(parseISO(settings.endDate), 1);
      let made = 0;
      let guard = 0;
      while (made < extraNeeded && guard++ < 370) {
        const dow = d.getDay();
        const key = iso(d);
        if (dow >= 0 && dow <= 3 && !holidays.has(key)) {
          step({ iso: key }, true);
          made++;
        }
        d = addDays(d, 1);
      }
    }
  }

  /* ---- audit: every range is re-checked before the table is returned ------ */
  const audit = auditPlan({
    chain,
    majorChain,
    rows,
    loG,
    hiG,
    startG,
    endG,
    dir,
    hasPins: pinsUsed,
    complete: !!(chain.length && chain[chain.length - 1].to === endG),
  });
  if (audit.errors.length) {
    const err = new Error('فشل تدقيق الجدول: ' + audit.errors.join(' · '));
    err.audit = audit;
    throw err;
  }

  const sFrom = surahByNumber(fromN);
  const sTo = surahByNumber(toN);
  stats.minorPendingQ = minorFed.slice(nMinor).reduce((acc, e) => acc + rangeQ(e.from, e.to), 0);
  stats.majorPendingQ = majorOn ? stats.major.pendingQ : 0;

  return {
    rows,
    loG,
    hiG,
    totalQ,
    savedQ,
    carryLeft: 0, // shift model: nothing is 'queued extra' — the schedule only slides
    remainingQ: Math.max(0, totalQ - savedQ),
    shifted: misses,
    stats,
    descending,
    dir,
    fromN,
    toN,
    baseQ,
    majorBaseQ,
    minorPendingQ: stats.minorPendingQ,
    majorPendingQ: stats.majorPendingQ,
    issues,
    audit,
    range: {
      fromSurah: sFrom.name,
      toSurah: sTo.name,
      first: ayahRef(startG), // exactly where the memorisation path starts
      last: ayahRef(endG), // exactly where it ends (inclusive)
      faces: totalQ / QPP,
      planDays: days.filter((x) => !x.holiday).length,
    },
  };
}

/* ---------- audit ---------------------------------------------------------- */
/**
 * Verifies, from the data alone, that what the table will show is Quranically
 * sound:
 *   • every range is a valid ayah range inside the mushaf;
 *   • hifz ranges never leave the student's own range;
 *   • when no manual pin rewrote the chain: the slices tile the range EXACTLY —
 *     strictly ordered, no ayah skipped, no ayah repeated, no range crossing a
 *     surah's last ayah, covering [first…last] once;
 *   • minor chunks are always inside a range that was really saved earlier;
 *   • major chunks are always inside the single descending mushaf ride.
 * Exported so the test-suite can audit arbitrary plans.
 */
export function auditPlan({ chain = [], majorChain = [], rows = [], loG, hiG, startG, endG, dir, hasPins = false, complete = true }) {
  const errors = [];
  let checked = 0;
  const inside = (gFrom, gTo, bounds) => {
    const lo = Math.min(gFrom, gTo);
    const hi = Math.max(gFrom, gTo);
    return lo >= bounds.lo && hi <= bounds.hi;
  };
  const checkRange = (gFrom, gTo, where, bounds) => {
    checked++;
    const v = validateRange(gFrom, gTo);
    if (!v.ok) {
      errors.push(`${where}: ${v.errors.join(' · ')}`);
      return false;
    }
    if (bounds && !inside(gFrom, gTo, bounds)) errors.push(`${where}: خارج المدى المسموح [${bounds.lo}..${bounds.hi}] → [${gFrom}..${gTo}]`);
    return true;
  };

  /* 1. the daily slices must tile the student's range exactly:
        strict order, no gap, no repetition, every ayah exactly once */
  const asAyahs = (a, b) => Math.abs(a - b) + 1;
  if (!hasPins && chain.length) {
    let expect = startG;
    let covered = 0;
    for (const s of chain) {
      if (!s) break;
      if (s.from !== expect) errors.push(`تسلسل الحفظ: قفزة عند الآية ${s.from} (المتوقع ${expect})`);
      if (!inside(s.from, s.to, { lo: loG, hi: hiG })) errors.push(`تسلسل الحفظ: نطاق خارج مدى الطالب [${s.from}..${s.to}]`);
      if ((s.to - s.from) * dir < 0) errors.push(`تسلسل الحفظ: نطاق مقلوب [${s.from}..${s.to}]`);
      covered += asAyahs(s.from, s.to);
      expect = s.to + dir;
      checked++;
    }
    const last = chain.filter(Boolean).pop();
    const rangeLen = hiG - loG + 1;
    if (complete) {
      if (last && last.to !== endG) errors.push(`تسلسل الحفظ: آخر نطاق ينتهي عند ${last.to} بدل ${endG}`);
      if (covered !== rangeLen) errors.push(`التغطية: ${covered} آية بدل ${rangeLen} (نقص أو تكرار)`);
    } else if (last) {
      // the plan is cut off by the calendar (endDate), so it must stop BEFORE the
      // range end — and the slices so far must still tile [start…last] exactly:
      const awayFromEnd = dir > 0 ? last.to < endG : last.to > endG;
      if (!awayFromEnd) errors.push(`تسلسل الحفظ: الخطة تدّعي نهاية المدى عند ${last.to} دون تغطية كاملة`);
      const reachable = Math.abs(last.to - startG) + 1;
      if (covered !== reachable) errors.push(`التغطية الجزئية: ${covered} آية بدل ${reachable} (نقص أو تكرار)`);
    }
  }

  /* 2. every displayed range is valid, in bounds and an exact slice of its chain */
  const sliceIn = (arr, gFrom, gTo) => arr.filter(Boolean).some((s) => Math.min(s.from, s.to) === Math.min(gFrom, gTo) && Math.max(s.from, s.to) === Math.max(gFrom, gTo));
  const savedBefore = [];
  for (const r of rows) {
    if (r.type !== 'day') continue;
    if (r.gFrom != null && r.gTo != null) {
      if (!checkRange(r.gFrom, r.gTo, `حفظ ${r.date}`, { lo: loG, hi: hiG })) continue;
      if (!hasPins && !sliceIn(chain, r.gFrom, r.gTo)) errors.push(`حفظ ${r.date}: [${r.gFrom}..${r.gTo}] ليس من شرائح الخطة`);
      if (r.status === 'saved') {
        // saved progress must continue exactly where the previous save ended:
        // never a skipped ayah, never an ayah saved twice
        const prev = savedBefore[savedBefore.length - 1];
        if (prev) {
          if (Math.min(prev.from, prev.to) === Math.min(r.gFrom, r.gTo)) errors.push(`تكرار: نطاق محفوظ مرتين [${r.gFrom}..${r.gTo}]`);
          if (!hasPins && prev.to + dir !== r.gFrom) errors.push(`تقدّم الحفظ: ${r.date} يبدأ عند ${r.gFrom} بعد ${prev.to}`);
        } else if (!hasPins && r.gFrom !== startG) {
          errors.push(`تقدّم الحفظ: أول يوم محفوظ يبدأ عند ${r.gFrom} بدل ${startG}`);
        }
        savedBefore.push({ from: r.gFrom, to: r.gTo });
        checked++;
      }
    }
    if (r.minor && r.minor.gFrom != null) {
      if (checkRange(r.minor.gFrom, r.minor.gTo, `صغرى ${r.date}`, { lo: 1, hi: TOTAL_AYAHS })) {
        const ok = savedBefore.some((s) => inside(r.minor.gFrom, r.minor.gTo, { lo: Math.min(s.from, s.to), hi: Math.max(s.from, s.to) }));
        if (!ok) errors.push(`صغرى ${r.date}: [${r.minor.gFrom}..${r.minor.gTo}] ليست من محفوظ سابق`);
      }
    }
    if (r.major && r.major.gFrom != null) {
      if (checkRange(r.major.gFrom, r.major.gTo, `كبرى ${r.date}`, { lo: 1, hi: TOTAL_AYAHS })) {
        if (majorChain.length && !sliceIn(majorChain, r.major.gFrom, r.major.gTo)) errors.push(`كبرى ${r.date}: [${r.major.gFrom}..${r.major.gTo}] ليست من مسار الكبرى`);
      }
    }
  }
  return { checked, errors };
}
