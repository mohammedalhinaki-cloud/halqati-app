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

/* ---------- smart rollover plan ---------- */
/**
 * statuses: { "YYYY-MM-DD": "saved" | "missed" | "absent" } (keyed by date)
 * Cascade: a missed/absent day passes its WHOLE planned amount (incl. inherited
 * carry) to the next working day. Unmarked days are projected as planned.
 */
export function buildPlan(student, settings) {
  /* ============ the schedule model (final, user-specified) ============
   * DIRECTION: ascending (from <= to, e.g. الفاتحة -> الناس) walks the mushaf normally,
   * no mirroring. Only when the user explicitly picks a DESCENDING range (from > to) the
   * engine runs in mirrored quarter-space p = TOTAL_Q - q, and every display bound is
   * converted back to real mushaf positions. Garbage/legacy values clamp to full-Quran
   * ascending — a broken stored value must never silently reverse the plan.
   *
   * ROLLOVER («لم يحفظ»): the missed day keeps its red mark showing exactly its OWN slice;
   * it is NOT merged with the next day and NOT skipped. Everything owed today (own slice +
   * any backlog it had already received) rolls to the next working day — which rolls its own
   * to the next... one clean day of slide per miss, zero doubling. Review (مراجعة صغرى +
   * كبرى) defers identically and stacks across consecutive misses. Holidays are fully inert.
   *
   * Implementation: `scheduled` advances by the base amount for every working day (missed or
   * not) and `carry` holds the live deferred backlog (its own slice pushed out of missed
   * days). A day is always ABOUT the slice at schedule-slot minus carry — that IS the queue
   * front. One counter, no arrays, self-clearing at the range end.
   */
  let fromN = Math.trunc(Number(student.from));
  let toN = Math.trunc(Number(student.to));
  if (!(fromN >= 1 && fromN <= 114)) fromN = 1;
  if (!(toN >= 1 && toN <= 114)) toN = 114;
  const forward = fromN <= toN;
  const mapQ = (pos) => (forward ? pos : TOTAL_Q - pos);
  const startQ = forward ? rangeStartQ(fromN) : TOTAL_Q - rangeEndQ(fromN);
  const endQ = forward ? rangeEndQ(toN) : TOTAL_Q - rangeStartQ(toN);
  const totalK = Math.max(0, endQ - startQ); // size of the range in quarter-faces
  const baseQ = Math.max(1, toQ(student.dailyHifz || 0.5));
  const sughraQ = Math.max(0, toQ(Number(student.sughra) || 0)); // daily review (صغرى)
  const kubraQ = Math.max(0, toQ(Number(student.kubra) || 0)); // daily review (كبرى)
  const holidays = parseHolidays(settings.holidays);
  const days = calendarDays(settings.startDate, settings.endDate, holidays);
  const rows = [];
  let scheduled = startQ; // next unassigned schedule slot (advances EVERY working day, misses included)

  let carry = 0; // live deferred backlog (the contiguous queue tail behind the schedule)
  let savedQ = 0;
  let revS = 0; // review (صغرى/كبرى) backlog rolled into the next working day
  let revK = 0;
  const stats = { saved: 0, missed: 0, absent: 0, pending: 0 };

  for (const d of days) {
    if (d.holiday) {
      rows.push({ type: 'holiday', date: d.iso }); // no slot consumed: holidays are inert
      continue;
    }
    const st = (student.statuses && student.statuses[d.iso]) || null;
    const sFrom = scheduled; // this day's own scheduled slice
    scheduled = Math.min(scheduled + baseQ, endQ);
    const win = scheduled - sFrom;
    const inherited = Math.min(carry, Math.max(0, endQ - sFrom)); // backlog waiting on this day
    const headFrom = sFrom - inherited; // the queue front this day is about
    const qFrom = headFrom;
    const qTo = Math.min(headFrom + win, endQ);
    const shown = Math.max(0, qTo - qFrom);
    const totalDue = win + inherited; // everything owed today (own slice + relayed backlog)
    let deferredQ = 0, badge = inherited, revInS = 0, revInK = 0, revOutS = 0, revOutK = 0;
    if (st === 'missed' || st === 'absent') {
      // «لم يحفظ»: the red cell shows this day's own slice, announces everything rolling
      // forward (own + relayed), and holds the queue — the whole plan slides one day back.
      // Nothing merges into tomorrow; tomorrow simply performs what stands at the front.
      carry += win; // this day's own slice joins the tail (the relayed head stays queued too)
      deferredQ = totalDue > 0 ? totalDue : 0;
      revOutS = revS + sughraQ; // review stacks across consecutive misses
      revOutK = revK + kubraQ;
      revS = revOutS;
      revK = revOutK;
      stats[st]++;
    } else {
      // saved or projected-pending: performs the queue front (deferred content first).
      // Absorbing one queued slice retires one unit of backlog; a real «حفظ» additionally
      // re-absorbs its own share of the backlog so a catch-up day pays down the slide.
      if (inherited > 0) carry = Math.max(0, carry - win);
      if (st === 'saved') {
        savedQ += shown;
        stats.saved++;
      } else {
        stats.pending++;
      }
      revInS = revS; // the review backlog is performed on any normal day
      revInK = revK;
      revS = 0;
      revK = 0;
      if (inherited === 0) badge = 0; // no relay -> nothing to announce
    }
    const rFrom = mapQ(qFrom);
    const rTo = mapQ(qTo);
    rows.push({
      type: 'day',
      date: d.iso,
      holiday: false,
      status: st,
      baseQ,
      carryIn: badge,
      amountQ: win, // the day's own slice — never doubled
      plannedQ: st === 'missed' || st === 'absent' ? 0 : shown,
      fromQ: rFrom,
      toQ: rTo,
      qLo: Math.min(rFrom, rTo),
      qHi: Math.max(rFrom, rTo),
      forward,
      beyondPlan: false,
      empty: shown === 0,
      revS: st === 'missed' || st === 'absent' ? 0 : revInS,
      revK: st === 'missed' || st === 'absent' ? 0 : revInK,
      revDeferredS: revOutS,
      revDeferredK: revOutK,
      deferredQ,
    });
  }

  carry = Math.max(0, Math.min(carry, totalK - Math.max(0, scheduled - startQ - (scheduled === endQ ? carry : 0))));
  if (scheduled === endQ && startQ + (scheduled - startQ) === endQ) carry = Math.min(carry, Math.max(0, totalK - (scheduled - startQ - carry)));

  const totalQ = endQ - startQ;
  const sFromS = surahByNumber(fromN);
  const sToS = surahByNumber(toN);
  return {
    rows,
    totalQ,
    savedQ,
    // live backlog after the plan (capped by the range: rolled content vanishes with it)
    carryLeft: carry,
    stats,
    forward,
    fromN,
    toN,
    range: {
      fromSurah: sFromS.name,
      toSurah: sToS.name,
      faces: totalQ / QPP,
      planDays: days.filter((x) => !x.holiday).length,
    },
  };
}