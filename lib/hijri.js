import moment from 'moment-hijri';
import { arNum } from './quran.js';

export const HIJRI_MONTHS = [
  'محرم',
  'صفر',
  'ربيع الأول',
  'ربيع الآخر',
  'جمادى الأولى',
  'جمادى الآخرة',
  'رجب',
  'شعبان',
  'رمضان',
  'شوال',
  'ذو القعدة',
  'ذو الحجة',
];

export const WEEKDAYS_SHORT = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

/* ---------- conversions (moment-hijri engine; verified identical to Intl
   islamic-umalqura for 2026-2028, zero drift over 720 days) ---------- */

/** gregorian 'YYYY-MM-DD' -> {y, m (1-12), d} */
export function gregToHijri(gregISO) {
  const m = moment(gregISO, 'YYYY-MM-DD');
  if (!m.isValid()) return null;
  return { y: m.iYear(), m: m.iMonth() + 1, d: m.iDate() };
}

/** hijri y/m/d -> gregorian 'YYYY-MM-DD' */
export function hijriToGreg(y, m, d) {
  // NB: build the ISO string manually — moment's default locale here renders
  // digits as Arabic-Indic, which must never leak into stored keys.
  const dt = moment(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, 'iYYYY-iMM-iDD').toDate();
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

/** number of days in a Hijri month (29 or 30) */
export function daysInHijriMonth(y, m) {
  // endOf('iMonth') is hijri-granular (plain daysInMonth() is gregorian)
  return moment(`${y}-${String(m).padStart(2, '0')}-01`, 'iYYYY-iMM-iDD').endOf('iMonth').iDate();
}

/* ---------- formatting ---------- */
const HIJRI_INTL = (() => {
  try {
    return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-arab', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return null;
  }
})();

function asDate(dateOrISO) {
  if (dateOrISO instanceof Date) return dateOrISO;
  const m = moment(String(dateOrISO), 'YYYY-MM-DD', true);
  return m.isValid() ? m.toDate() : null;
}

/** main API: format any Date/'YYYY-MM-DD' as Hijri via Intl Umm al-Qura */
export function formatHijri(dateOrISO) {
  const d = asDate(dateOrISO);
  if (!d || !HIJRI_INTL) return '—';
  const parts = {};
  for (const p of HIJRI_INTL.formatToParts(d)) parts[p.type] = p.value;
  return `${parts.day} ${parts.month} ${parts.year}هـ`;
}

/** {dm, y, full} — used by table cells & bands */
export function hijriInfo(dateOrISO) {
  const d = asDate(dateOrISO);
  if (!d || !HIJRI_INTL) return { dm: '—', y: '', full: '—' };
  const parts = {};
  for (const p of HIJRI_INTL.formatToParts(d)) parts[p.type] = p.value;
  return {
    dm: `${parts.day} ${parts.month}`,
    y: `${parts.year}هـ`,
    full: `${parts.day} ${parts.month} ${parts.year}هـ`,
  };
}

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Arabic weekday name for a gregorian ISO date */
export function weekdayName(isoStr) {
  const d = asDate(isoStr);
  if (!d) return '—';
  return new Intl.DateTimeFormat('ar', { weekday: 'long' }).format(d);
}
