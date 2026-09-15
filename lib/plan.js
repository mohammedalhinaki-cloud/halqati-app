import { rangeStartQ, rangeEndQ, surahByNumber, QPP, toQ, TOTAL_Q } from './quran.js';

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
    if (dow >= 0 && dow <= 3) {
      const key = iso(d);
      out.push({ iso: key, holiday: holidaySet.has(key) });
    }
    d = addDays(d, 1);
  }
  return out;
}

export function workingDayCount(settings) {
  return calendarDays(settings.startDate, settings.endDate, parseHolidays(settings.holidays)).filter(
    (x) => !x.holiday
  ).length;
}

/* ---------- plan engine: shifted slots + three independent streams ---------- */
/**
 * The range is chopped into daily SLOTS of exactly `dailyHifz`. Working day i
 * (holidays and non Sun–Wed excluded) is scheduled slot  k = i - missesBefore(i).
 * A day marked «لم يحفظ/غائب» burns one miss => EVERY later day shows the slot
 * one place earlier — the plan slides, a day never receives two days of work
 * (no merge), and the missed day itself stays red/empty.
 *
 * Streams, each with independent marks:
 *   hifz  — the slot engine above («حفظ / لم يحفظ / غائب»).
 *   minor — AUTOMATIC: yesterday's slice (saved or planned) is today's review.
 *   major — OPTIONAL (majorEnabled): real saves queue for marking; «لم تتم»
 *           inserts a gap in the queue (slide), hifz/minor are untouched.
 *
 * Direction: mirror in quarter-space ONLY when from > to (descending range).
 * from <= to — or invalid values — plain ascending mushaf order, never mirrored.
 * statuses: legacy flat ("date":"saved" = hifz) or per-stream ({hifz,major}).
 */
export function buildPlan(student, settings) {
  const rawFrom = Number(student.from);
  const rawTo = Number(student.to);
  const fromN = Number.isFinite(rawFrom) && rawFrom >= 1 && rawFrom <= 114 ? Math.trunc(rawFrom) : 1;
  const toN = Number.isFinite(rawTo) && rawTo >= 1 && rawTo <= 114 ? Math.trunc(rawTo) : 114;
  const descending = rawFrom > rawTo && Number.isFinite(rawFrom) && Number.isFinite(rawTo);
  const mapQ = (p) => (descending ? TOTAL_Q - p : p);
  const startQ = descending ? TOTAL_Q - rangeEndQ(fromN) : rangeStartQ(fromN);
  const endQ = descending ? TOTAL_Q - rangeStartQ(toN) : rangeEndQ(toN);
  const totalQ = Math.max(0, endQ - startQ);
  const baseQ = Math.max(1, toQ(student.dailyHifz || 0.5));
  const majorOn = !!student.majorEnabled;
  const majorBaseQ = Number(student.majorBaseQ) > 0 ? Number(student.majorBaseQ) : toQ(0.5);
  const totalSlots = Math.ceil(totalQ / baseQ);

  const holidays = parseHolidays(settings.holidays);
  const days = calendarDays(settings.startDate, settings.endDate, holidays);

  const stOf = (date, stream) => {
    const s = student.statuses && student.statuses[date];
    if (!s) return null;
    if (typeof s === 'string') return stream === 'hifz' ? s : null;
    return s[stream] || null;
  };

  const sliceQ = (k) => {
    if (k < 0 || k >= totalSlots) return null;
    const a = startQ + k * baseQ;
    const b = Math.min(a + baseQ, endQ);
    const lo = mapQ(a), hi = mapQ(b);
    return { lo: Math.min(lo, hi), hi: Math.max(lo, hi) };
  };
  // descending ride over the WHOLE Quran (major review): slot 0 ends at الناس (mushaf end)
  const sliceDescQ = (j) => {
    if (j < 0 || j >= totalSlots) return null;
    const b = TOTAL_Q - j * baseQ;
    const a = Math.max(0, b - baseQ);
    return { lo: a, hi: b };
  };
  const takeSpans = (queue, want) => {
    const taken = [];
    let left = want;
    while (left > 0 && queue.length) {
      const sp = queue[0];
      const q = sp.hi - sp.lo;
      if (q <= left) { taken.push({ ...sp }); queue.shift(); left -= q; }
      else { taken.push({ lo: sp.lo, hi: sp.lo + left }); sp.lo += left; left = 0; }
    }
    return taken;
  };

  const rows = [];
  let misses = 0;        // hifz-stream burned slots (shift count)
  let savedQ = 0;        // verified hifz progress (marked «حفظ» only)
  let mMisses = 0;       // major-stream burned slots
  const minorFed = [];    // minor queue: one entry per REAL saved slice
  const fedAt = [];       // that entry's save-day index (an entry matures the next day)
  let nMinor = 0;         // minor queue pointer (consumed + burned items)
  const stats = { saved: 0, missed: 0, absent: 0, pending: 0, minorDone: 0, minorPending: 0, minorMissed: 0, minorAbsent: 0, minorSavedQ: 0, major: { saved: 0, missed: 0, absent: 0, savedQ: 0, pendingDays: 0 } };

  let dayIdx = 0;
  let nextDue = 0;     // next slot that comes due for an unmarked day
  const step = (d, beyondPlan) => {
    const k = dayIdx - misses;
    const scheduled = sliceQ(k);
    // preview for unmarked days: what will actually come due tomorrow —
    // rolled misses re-run first (skip pointer), then the natural glide.
    const preview = null;
    const hStatus = stOf(d.iso, 'hifz');
    const row = { type: 'day', date: d.iso, holiday: false, beyondPlan, direction: descending ? 'desc' : 'asc', shiftBefore: misses };
    let hSpan = null;
    /* ---- hifz ---- */
    if (hStatus === 'saved') {
      hSpan = scheduled;
      if (scheduled) savedQ += scheduled.hi - scheduled.lo;
      nextDue = Math.min(nextDue, k); // the saved slot re-runs tomorrow, then the plan resumes
      stats.saved++;
    } else if (hStatus === 'missed' || hStatus === 'absent') {
      // red cell KEEPS its own slice for visibility; the same slice re-runs on
      // the next working day (nothing is ever added on top of another day's).
      hSpan = scheduled;
      row.rolledToNext = scheduled ? scheduled.hi - scheduled.lo : 0;
      misses++; // the plan slides: every later natural slot is one lower
      stats[hStatus]++;
    } else {
      {
        const pk = Math.max(k, nextDue);
        hSpan = sliceQ(pk);
        nextDue = pk + 1;
      }
      stats.pending++;
    }
    Object.assign(row, {
      status: hStatus,
      baseQ,
      slotIndex: k < 0 ? null : k,
      shiftedBy: misses,
      amountQ: scheduled ? scheduled.hi - scheduled.lo : 0,
      plannedQ: hStatus === 'saved' && scheduled ? scheduled.hi - scheduled.lo : 0,
      qLo: hSpan ? hSpan.lo : null,
      qHi: hSpan ? hSpan.hi : null,
      fromQ: hSpan ? hSpan.lo : null,
      toQ: hSpan ? hSpan.hi : null,
      forward: !descending,
      empty: scheduled == null,
    });

    /* ---- review streams ----
       minor (الصغرى): fed ONLY by real saves — a slice saved today becomes due
       TOMORROW, so the FIRST day of the plan has nothing at all (nothing was
       saved yesterday) and never mirrors today's own hifz. Nothing is ever
       auto-marked: the teacher marks «تم». An unmarked item stays due (frozen,
       not doubled); «لم تتم/غائب» burns that queue slot alone, so this stream
       slides independently of hifz and major.
       major (الكبرى): fully automatic descending ride over the WHOLE Quran
       starting at الناس — independent of the hifz range. */
    const normSt = (v) => (v === 'saved' ? 'done' : v || null);
    const minorStatus = normSt(stOf(d.iso, 'minor'));
    const mDue = nMinor < minorFed.length && fedAt[nMinor] < dayIdx; // saved earlier & not yet consumed
    const mSrc = mDue ? minorFed[nMinor] : null;
    let minorCell = { plannedQ: 0, qLo: null, qHi: null, status: minorStatus, preview: false, pendingDays: 0 };
    if (mSrc) {
      const q = Math.min(mSrc.hi - mSrc.lo, baseQ);
      minorCell = { plannedQ: q, qLo: mSrc.lo, qHi: mSrc.lo + q, status: minorStatus, pendingDays: dayIdx - fedAt[nMinor] };
      if (!minorStatus) stats.minorPending++;
      if (minorStatus === 'done') {
        stats.minorDone++;
        stats.minorSavedQ += q;
        nMinor++; // consumed: the queue advances one item
      } else if (minorStatus === 'missed' || minorStatus === 'absent') {
        stats[minorStatus === 'missed' ? 'minorMissed' : 'minorAbsent']++;
        nMinor++; // burned: it re-runs on the next working day, never merged
      }
    } else if (minorStatus === 'done') {
      stats.minorDone++; // the teacher marked something that was already cleared
    }
    row.minor = minorCell;

    if (majorOn) {
      const majStatus = normSt(stOf(d.iso, 'major'));
      let majCell = { plannedQ: 0, qLo: null, qHi: null, status: majStatus, pendingDays: mMisses };
      if (majStatus === 'missed' || majStatus === 'absent') {
        mMisses++;
        stats.major[majStatus]++;
      } else {
        const j = Math.max(0, dayIdx - mMisses);
        const span = j < totalSlots ? sliceDescQ(j) : null;
        if (span) {
          majCell = { plannedQ: span.hi - span.lo, qLo: span.lo, qHi: span.hi, status: majStatus === 'done' ? 'done' : null, preview: false, cycle: Math.floor(j / totalSlots) + 1, pendingDays: mMisses };
          if (majStatus === 'done') { stats.major.saved++; stats.major.savedQ += majCell.plannedQ; }
        }
      }
      stats.major.pendingDays = mMisses;
      row.major = majCell;
      row.major.pendingQ = Math.max(0, totalSlots - Math.max(0, dayIdx - mMisses)) * baseQ;
    }

    // feed: ONLY real saves queue tomorrow's minor review (matures next step)
    if (hStatus === 'saved' && scheduled) { minorFed.push({ ...scheduled, real: true, day: dayIdx }); fedAt.push(dayIdx); }

    dayIdx++;
    rows.push(row);
  };

  for (const d of days) {
    if (d.holiday) { rows.push({ type: 'holiday', date: d.iso }); continue; }
    step(d, false);
  }

  // extension: after the plan end, days materialize ONLY if they actually carry
  // work (marks). A purely shifted plan just notes the shortfall — otherwise an
  // endless slide would append infinite empty days. Marks inside the extension
  // region are read from student.statuses directly.
  let lastDay = days.length ? days[days.length - 1].iso : settings.endDate;
  if (lastDay && dayIdx < totalSlots + misses && settings.endDate) {
    const marksBeyond = Object.keys(student.statuses || {}).some((key) => {
      if (key <= settings.endDate) return false;
      const v = student.statuses[key];
      const h = typeof v === 'string' ? v : v && v.hifz;
      return !!h;
    });
    const extraNeeded = Math.max(misses, marksBeyond ? Math.min(totalSlots - dayIdx, 14) : 0);
    if (extraNeeded > 0) {
      // the visible plan grows by exactly the slid days (the delay the misses
      // caused) — nothing more; the full remainder is reported as carryLeft.
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

  stats.minorPendingQ = Math.max(0, minorFed.length - nMinor) * baseQ;
  stats.majorPendingQ = majorOn ? Math.max(0, totalSlots - Math.max(0, dayIdx - mMisses)) * baseQ : 0;

  const sFrom = surahByNumber(fromN);
  const sTo = surahByNumber(toN);
  return {
    rows,
    totalQ,
    savedQ,
    carryLeft: 0, // shift model: nothing is 'queued extra' — the schedule only slides
    remainingQ: Math.max(0, totalQ - savedQ),
    shifted: misses,
    stats,
    descending,
    minorPendingQ: stats.minorPendingQ,
    majorPendingQ: stats.majorPendingQ,
    range: {
      fromSurah: sFrom ? sFrom.name : '—',
      toSurah: sTo ? sTo.name : '—',
      faces: totalQ / QPP,
      planDays: days.filter((x) => !x.holiday).length,
    },
  };
}