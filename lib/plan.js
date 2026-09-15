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
  let mMisses = 0;       // major-stream deferrals (days)
  const mFed = [];        // slices saved (real-q), maturing into review slots day by day
  let mConsumedQ = 0;     // quarters already reviewed by «تمت» days
  const stats = { saved: 0, missed: 0, absent: 0, pending: 0, major: { saved: 0, missed: 0, absent: 0, savedQ: 0, pendingDays: 0 } };

  let dayIdx = 0;
  const step = (d, beyondPlan) => {
    const k = dayIdx - misses;
    const scheduled = sliceQ(k);
    const hStatus = stOf(d.iso, 'hifz');
    const row = { type: 'day', date: d.iso, holiday: false, beyondPlan, direction: descending ? 'desc' : 'asc', shiftBefore: misses };
    let hSpan = null;
    /* ---- hifz ---- */
    if (hStatus === 'saved') {
      hSpan = scheduled;
      if (scheduled) savedQ += scheduled.hi - scheduled.lo;
      stats.saved++;
    } else if (hStatus === 'missed' || hStatus === 'absent') {
      misses++; // the day burns its slot; the plan slides from here on
      stats[hStatus]++;
    } else {
      hSpan = scheduled; // unmarked: pure schedule preview (no verified progress)
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

    /* ---- minor (automatic: yesterday's slice — saved or planned) ---- */
    if (hStatus !== 'saved') {
      const prev = rows.length ? rows[rows.length - 1] : null;
      if (prev && prev.qLo != null) {
        row.minor = { plannedQ: prev.qHi - prev.qLo, qLo: prev.qLo, qHi: prev.qHi, status: prev.status === 'saved' ? 'done' : null, preview: prev.status !== 'saved' };
      }
    } else {
      const prev = rows.length ? rows[rows.length - 1] : null;
      if (prev && prev.qLo != null) {
        row.minor = { plannedQ: prev.qHi - prev.qLo, qLo: prev.qLo, qHi: prev.qHi, status: prev.status === 'saved' ? 'done' : null, preview: prev.status !== 'saved' };
      }
    }

    /* ---- major (optional, independent shifted queue) ----
       feed: every saved hifz day queues its slice for review; review days
       consume majorBaseQ from the queue. «لم تتم» burns nothing: it inserts a
       gap (mMisses++), so the whole review plan slides one day. */
    if (majorOn) {
      if (hStatus === 'saved' && scheduled) mFed.push(scheduled);
      const mStatus = stOf(d.iso, 'major');
      const mIdx = dayIdx - mMisses;
      const dueSlots = Math.max(0, Math.min(mFed.length, mIdx)); // matured feed slots
      const fedQ = mFed.slice(0, dueSlots).reduce((a, x) => a + x.hi - x.lo, 0);
      const avail = Math.max(0, fedQ - mConsumedQ);
      const spansOf = (want) => {
        const queue = mFed.slice(0, dueSlots).map((x) => ({ ...x }));
        let skip = mConsumedQ;
        while (skip > 0 && queue.length) {
          const q = queue[0].hi - queue[0].lo;
          if (q <= skip) { skip -= q; queue.shift(); }
          else { queue[0].lo += skip; skip = 0; }
        }
        return takeSpans(queue, want);
      };
      if (mStatus === 'done' || mStatus === 'saved') {
        const spans = avail > 0 ? spansOf(Math.min(majorBaseQ, avail)) : [];
        const q = spans.reduce((a, x) => a + x.hi - x.lo, 0);
        mConsumedQ += q;
        stats.major.saved++;
        stats.major.savedQ += q;
        row.major = spans.length
          ? { plannedQ: q, qLo: spans[0].lo, qHi: spans[spans.length - 1].hi, status: 'done' }
          : { plannedQ: 0, qLo: null, qHi: null, status: 'done' };
      } else if (mStatus === 'missed' || mStatus === 'absent') {
        mMisses++;
        stats.major[mStatus === 'missed' ? 'missed' : 'absent']++;
        row.major = { plannedQ: 0, qLo: null, qHi: null, status: mStatus, pendingDays: mMisses };
      } else if (avail > 0) {
        const spans = spansOf(Math.min(majorBaseQ, avail));
        row.major = { plannedQ: spans.reduce((a, x) => a + x.hi - x.lo, 0), qLo: spans[0].lo, qHi: spans[spans.length - 1].hi, status: null, pendingDays: mMisses, preview: true };
      } else {
        row.major = { plannedQ: 0, qLo: null, qHi: null, status: null, pendingDays: mMisses };
      }
      stats.major.pendingDays = mMisses;
    }

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

  stats.minorPendingQ = 0;
  const allFedQ = mFed.reduce((a, x) => a + x.hi - x.lo, 0);
  stats.majorPendingQ = Math.max(0, allFedQ - mConsumedQ);

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
