'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { HIJRI_MONTHS, WEEKDAYS_SHORT, gregToHijri, hijriToGreg, daysInHijriMonth, formatHijri, todayISO } from '../lib/hijri.js';
import { arNum } from '../lib/quran';

function shift(y, m, delta) {
  let mm = m + delta;
  let yy = y;
  while (mm < 1) { mm += 12; yy--; }
  while (mm > 12) { mm -= 12; yy++; }
  return { y: yy, m: mm };
}

export default function HijriDatePicker({ value, onChange, label }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => {
    const h = gregToHijri(value || todayISO());
    return h ? { y: h.y, m: h.m } : { y: 1448, m: 1 };
  });
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const { cells, monthLen } = useMemo(() => {
    const monthLen = daysInHijriMonth(view.y, view.m);
    const firstGreg = hijriToGreg(view.y, view.m, 1);
    const firstDow = new Date(firstGreg + 'T12:00:00').getDay(); // Sunday=0
    const cells = [];
    for (let i = 0; i < firstDow; i++) cells.push(null);
    for (let d = 1; d <= monthLen; d++) cells.push({ d, greg: hijriToGreg(view.y, view.m, d) });
    return { cells, monthLen };
  }, [view]);

  const today = todayISO();
  const selH = gregToHijri(value || '');
  const years = [view.y - 2, view.y - 1, view.y, view.y + 1, view.y + 2, view.y + 3];

  return (
    <div className="relative" ref={rootRef}>
      {label && <span className="field-label">{label}</span>}
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          const h = gregToHijri(value || todayISO());
          if (h) setView({ y: h.y, m: h.m });
        }}
        className="field flex w-full items-center justify-between text-right"
      >
        <span className={value ? 'font-bold text-slate-800' : 'text-slate-400'}>{value ? formatHijri(value) : 'اختر التاريخ'}</span>
        <span className="text-slate-400">📅</span>
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-72 rounded-xl border-2 border-slate-700 bg-white p-3 shadow-xl">
          {/* header: nav + selects */}
          <div className="mb-2 flex items-center gap-1">
            <button type="button" className="btn border border-slate-300 px-2 py-1 text-slate-600 hover:bg-slate-100" onClick={() => setView((v) => shift(v.y, v.m, -1))} aria-label="الشهر السابق">
              ›
            </button>
            <button type="button" className="btn border border-slate-300 px-2 py-1 text-slate-600 hover:bg-slate-100" onClick={() => setView((v) => shift(v.y, v.m, 1))} aria-label="الشهر التالي">
              ‹
            </button>
            <select
              className="field flex-1 py-1"
              value={view.m}
              onChange={(e) => setView((v) => ({ ...v, m: Number(e.target.value) }))}
            >
              {HIJRI_MONTHS.map((n, i) => (
                <option key={n} value={i + 1}>
                  {n}
                </option>
              ))}
            </select>
            <select
              className="field w-24 py-1"
              value={view.y}
              onChange={(e) => setView((v) => ({ ...v, y: Number(e.target.value) }))}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {arNum(y)}هـ
                </option>
              ))}
            </select>
          </div>
          <div className="mb-1 grid grid-cols-7 text-center text-[10px] font-extrabold text-slate-500">
            {WEEKDAYS_SHORT.map((w) => (
              <div key={w} title={w}>
                {w.replace('الأ', 'أ').replace('الإ', 'ا').slice(0, 3)}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center">
            {cells.map((c, i) =>
              c === null ? (
                <div key={'x' + i} />
              ) : (
                <button
                  key={c.greg}
                  type="button"
                  onClick={() => {
                    onChange(c.greg);
                    setOpen(false);
                  }}
                  className={
                    'mx-auto flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-bold transition ' +
                    (value === c.greg
                      ? 'bg-emerald-700 text-white shadow'
                      : today === c.greg
                      ? 'border-2 border-emerald-600 text-emerald-800'
                      : 'text-slate-700 hover:bg-slate-100')
                  }
                >
                  {arNum(c.d)}
                </button>
              )
            )}
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
            <button
              type="button"
              className="text-xs font-extrabold text-emerald-700 hover:underline"
              onClick={() => {
                onChange(todayISO());
                setOpen(false);
              }}
            >
              اليوم
            </button>
            <span className="text-[10px] text-slate-400" dir="ltr">
              {value ? `الموافق ${value.split('-').reverse().join('/')}` : `${arNum(monthLen)} يوماً في هذا الشهر`}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
