import DATA from './quran-data.js';

export const META = DATA.meta;
export const SURAHS = DATA.surahs; // [{n,name,count,page,startQ,endQ,qp[]}] in quarters
export const TOTAL_Q = SURAHS[SURAHS.length - 1].endQ; // 2416 quarter-faces
export const QPP = META.quartersPerPage; // 4 quarter-faces per page/face

const starts = SURAHS.map((s) => s.startQ);

/** index of surah containing a quarter-face position (clamped) */
export function surahIndexOf(qPos) {
  let lo = 0,
    hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= qPos) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export function surahByNumber(n) {
  return SURAHS[n - 1];
}

/** start quarter of an ayah (1-based within its surah) */
export function ayahStartQ(surahahIndex, ayahNo) {
  const s = SURAHS[surahahIndex];
  return s.qp[Math.max(1, Math.min(s.count, ayahNo)) - 1];
}

/** last ayah of the surah whose start quarter <= p (1-based) */
function ayahAt(surahahIndex, p) {
  const s = SURAHS[surahahIndex];
  let lo = 1,
    hi = s.count;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (s.qp[mid - 1] <= p) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** First ayah whose QCF marker is at or after this quarter position. */
function ayahAtStart(surahahIndex, p) {
  const s = SURAHS[surahahIndex];
  let lo = 1, hi = s.count;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (s.qp[mid - 1] < p) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Human label for a planned span [aQ, bQ) of quarter-faces.
 * Returns { surah, range } e.g. { surah: "الأحقاف", range: "من الآية ٢١ إلى الآية ٢٦" }
 */
export function spanLabel(aQ, bQ) {
  if (bQ <= aQ) return { surah: '—', range: '' };
  const i1 = surahIndexOf(aQ);
  const i2 = surahIndexOf(bQ - 1);
  const a1 = ayahAtStart(i1, aQ);
  const a2 = ayahAt(i2, bQ - 1);
  if (i1 === i2) {
    return {
      surah: SURAHS[i1].name,
      range: a1 === a2 ? `الآية ${arNum(a1)}` : `الآية ${arNum(a1)} – ${arNum(a2)}`,
    };
  }
  return {
    surah: `${SURAHS[i1].name} ← ${SURAHS[i2].name}`,
    range: `${arNum(a1)} من الأولى – ${arNum(a2)} من الثانية`,
  };
}

/** start quarter-face position of a student's range */
export function rangeStartQ(surahNo) {
  return surahByNumber(surahNo).startQ;
}
export function rangeEndQ(surahNo) {
  return surahByNumber(surahNo).endQ;
}

/** Convert a custom ayah endpoint into the quarter-face range used by plans. */
export function ayahRangeQ(surahFrom, ayahFrom, surahTo = surahFrom, ayahTo = ayahFrom) {
  const a = surahByNumber(Number(surahFrom));
  const b = surahByNumber(Number(surahTo));
  if (!a || !b) return null;
  const lo = ayahStartQ(Number(surahFrom) - 1, Number(ayahFrom));
  const endStart = ayahStartQ(Number(surahTo) - 1, Number(ayahTo));
  return { lo: Math.min(lo, endStart), hi: Math.min(TOTAL_Q, Math.max(lo, endStart + 1)) };
}

/* ---------- Arabic-friendly formatting ---------- */
const DIGITS = '\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669';
export function arNum(x) {
  return String(x).replace(/\d/g, (d) => DIGITS[+d]);
}
/** decimal face count, e.g. 102.5 -> "١٠٢٫٥" */
export function arDec(x) {
  return arNum(Number(x.toFixed(2)).toString().replace('.', '٫'));
}

const REM_NAMES = { 1: 'ربع', 2: 'نصف', 3: 'ثلاثة أرباع' };
export function faceWord(w) {
  if (w === 1) return 'وجه';
  if (w === 2) return 'وجهان';
  if (w >= 3 && w <= 10) return `${arNum(w)} أوجه`;
  return `${arNum(w)} وجهًا`;
}
/** amount label from quarter-faces: q=5 -> "وجه وربع", q=2 -> "نصف وجه" */
export function amountLabel(q) {
  if (!q) return '—';
  const whole = Math.floor(q / QPP);
  const rem = q % QPP;
  if (!whole) return `${REM_NAMES[rem]} وجه`;
  return rem ? `${faceWord(whole)} و${REM_NAMES[rem]}` : faceWord(whole);
}

/** dropdown options for daily amounts (value = faces) */
export const AMOUNT_OPTS = [
  { v: 0.25, label: 'ربع وجه' },
  { v: 0.5, label: 'نصف وجه' },
  { v: 0.75, label: 'ثلاثة أرباع وجه' },
  { v: 1, label: 'وجه' },
  { v: 1.5, label: 'وجه ونصف' },
  { v: 2, label: 'وجهان' },
];
export const AMOUNT_OPTS_OPTIONAL = [{ v: 0, label: 'لا يوجد' }, ...AMOUNT_OPTS];
export const toQ = (faces) => Math.round(faces * QPP);
