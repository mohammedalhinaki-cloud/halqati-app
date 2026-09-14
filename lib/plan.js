import { rangeStartQ, rangeEndQ, surahByNumber, QPP, toQ } from './quran.js';

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

/* ---------- Hijri (Umm al-Qura) date labels ---------- */
let HIJRI;
try {
  HIJRI = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-arab', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    era: 'short',
  });
} catch {}
/** returns { dm: "٩ ربيع الآخر", y: "١٤٤هـ", full: " ربيع الآخر ١٤٨هـ" } */
export function hijriInfo(isoStr) {
  if (!HIJRI) return { dm: '—', y: '', full: '—' };
  const d = parseISO(isoStr);
  if (isNaN(d)) return { dm: '—', y: '', full: '—' };
  const parts = {};
  for (const p of HIJRI.formatToParts(d)) parts[p.type] = p.value;
  return {
    dm: `${parts.day} ${parts.month}`,
    y: `${parts.year}${parts.era || ''}`,
    full: `${parts.day} ${parts.month} ${parts.year}${parts.era || ''}`,
  };
}
export function weekdayName(isoStr) {
  return new Intl.DateTimeFormat('ar', { weekday: 'long' }).format(parseISO(isoStr));
}

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
  const startQ = rangeStartQ(student.from);
  const endQ = rangeEndQ(student.to);
  const baseQ = Math.max(1, toQ(student.dailyHifz || 0.5));
  const holidays = parseHolidays(settings.holidays);
  const days = calendarDays(settings.startDate, settings.endDate, holidays);
  const rows = [];
  let cursor = startQ;
  let carry = 0;
  let savedQ = 0;
  let stats = { saved: 0, missed: 0, absent: 0, pending: 0 };

  const step = (d, beyondPlan) => {
    const amt = baseQ + carry;
    let st = (student.statuses && student.statuses[d.iso]) || null;
    if (beyondPlan && !st) st = null;
    const avail = Math.max(0, endQ - cursor);
    const planned = Math.min(amt, avail);
    let from = cursor,
      to = cursor;
    carry = 0;
    if (st === 'saved') {
      to = cursor + planned;
      cursor += planned;
      savedQ += planned;
      stats.saved++;
      if (planned < amt) carry = amt - planned;
    } else if (st === 'missed' || st === 'absent') {
      stats[st]++;
      carry = amt;
    } else {
      // pending: project as if saved, so the schedule stays readable
      to = cursor + planned;
      if (planned > 0) cursor += planned;
      if (planned < amt && avail > 0) carry = amt - planned;
      if (!beyondPlan || avail > 0) stats.pending++;
    }
    rows.push({
      type: 'day',
      date: d.iso,
      holiday: !!d.holiday,
      status: st,
      baseQ,
      carryIn: amt - baseQ,
      amountQ: amt,
      plannedQ: to - from,
      fromQ: from,
      toQ: to,
      beyondPlan,
      empty: avail === 0,
    });
  };

  for (const d of days) {
    if (d.holiday) {
      rows.push({ type: 'holiday', date: d.iso });
      continue;
    }
    step(d, false);
  }

  // extension: unfinished carry pushes into new working days after the plan end
  if (carry > 0 && settings.endDate) {
    let d = addDays(parseISO(settings.endDate), 1);
    let extra = 0;
    while (carry > 0 && extra < 365) {
      const dow = d.getDay();
      const key = iso(d);
      if (dow >= 0 && dow <= 3 && !holidays.has(key)) {
        step({ iso: key }, true);
        extra++;
      }
      d = addDays(d, 1);
    }
  }

  const totalQ = endQ - startQ;
  const sFrom = surahByNumber(student.from);
  const sTo = surahByNumber(student.to);
  return {
    rows,
    totalQ,
    savedQ,
    carryLeft: carry,
    stats,
    range: {
      fromSurah: sFrom.name,
      toSurah: sTo.name,
      faces: totalQ / QPP,
      planDays: days.filter((x) => !x.holiday).length,
    },
  };
}
