'use client';
import { useState } from 'react';
import { workingDayCount } from '../lib/plan';
import { hijriInfo, weekdayName } from '../lib/hijri.js';
import { arNum } from '../lib/quran';
import HijriDatePicker from './HijriDatePicker.jsx';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const parseList = (str) =>
  String(str || '')
    .split(/[,،\s]+/)
    .filter((s) => ISO.test(s));

/** expand [a..b] to every Sun..Wed inside (Thu-Sat carry no plan work anyway) */
function workingDaysBetween(a, b) {
  const lo = a <= b ? a : b;
  const hi = a <= b ? b : a;
  const out = [];
  const d = new Date(+lo.slice(0, 4), +lo.slice(5, 7) - 1, +lo.slice(8, 10));
  const end = new Date(+hi.slice(0, 4), +hi.slice(5, 7) - 1, +hi.slice(8, 10));
  let guard = 0;
  while (d <= end && guard++ < 370) {
    if (d.getDay() >= 0 && d.getDay() <= 3) {
      out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    }
    d.setDate(d.getDate() + 1);
  }
  return out;
}

export default function SettingsCard({ settings, onChange }) {
  const days = workingDayCount(settings);
  const [mode, setMode] = useState('single'); // 'single' | 'range'
  const [holPick, setHolPick] = useState('');
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  const holidays = parseList(settings.holidays).sort();

  const setHolidays = (list) => onChange({ holidays: Array.from(new Set(list)).sort().join(', ') });
  const addHoliday = () => {
    if (!holPick || holidays.includes(holPick)) return;
    setHolidays([...holidays, holPick]);
    setHolPick('');
  };
  const addRange = () => {
    if (!rangeFrom || !rangeTo) return;
    const expanded = workingDaysBetween(rangeFrom, rangeTo);
    if (!expanded.length) return;
    setHolidays([...holidays, ...expanded]);
    setRangeFrom('');
    setRangeTo('');
  };
  const removeHoliday = (d) => setHolidays(holidays.filter((x) => x !== d));

  return (
    <section className="card p-4" aria-label="الإعدادات العامة">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-extrabold text-slate-900">
          الإعدادات العامة <span className="text-xs font-normal text-slate-500">(قابلة للتعديل في أي وقت — والخطة تُحدَّث فورًا)</span>
        </h2>
        <span className="rounded-full bg-slate-800 px-3 py-0.5 text-xs font-bold text-white">أيام العمل: الأحد – الأربعاء</span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <HijriDatePicker label="تاريخ بداية الخطة (هجري)" value={settings.startDate} onChange={(v) => onChange({ startDate: v })} />
        <HijriDatePicker label="تاريخ نهاية الخطة (هجري)" value={settings.endDate} onChange={(v) => onChange({ endDate: v })} />
        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="field-label mb-0">إضافة إجازة (يُتخطى تلقائيًا)</span>
            <div className="inline-flex overflow-hidden rounded-lg border border-slate-300 text-[11px] font-bold no-print">
              <button
                type="button"
                onClick={() => setMode('single')}
                className={'px-2 py-0.5 ' + (mode === 'single' ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 hover:bg-slate-100')}
              >
                يوم مفرد
              </button>
              <button
                type="button"
                onClick={() => setMode('range')}
                className={'px-2 py-0.5 ' + (mode === 'range' ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 hover:bg-slate-100')}
              >
                فترة كاملة
              </button>
            </div>
          </div>
          {mode === 'single' ? (
            <div className="flex gap-2">
              <div className="flex-1">
                <HijriDatePicker value={holPick} onChange={setHolPick} />
              </div>
              <button
                type="button"
                onClick={addHoliday}
                disabled={!holPick || holidays.includes(holPick)}
                className="btn h-[38px] self-end bg-slate-800 text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40 no-print"
              >
                ＋ إجازة
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <HijriDatePicker label="من يوم" value={rangeFrom} onChange={setRangeFrom} />
                </div>
                <span className="mt-4 text-slate-400">←</span>
                <div className="flex-1">
                  <HijriDatePicker label="إلى يوم" value={rangeTo} onChange={setRangeTo} />
                </div>
              </div>
              <button
                type="button"
                onClick={addRange}
                disabled={!rangeFrom || !rangeTo}
                className="btn bg-slate-800 text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40 no-print"
              >
                ＋ إضافة الفترة كلها
              </button>
              <p className="text-[10px] leading-4 text-slate-400">
                تضاف أيام العمل (الأحد–الأربعاء) الواقعة داخل الفترة فقط؛ خميس/جمعة/سبت لا تُخزَّن لأنها بلا حفظ أصلًا.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
        {holidays.length === 0 ? (
          <span className="text-slate-400">لا توجد إجازات محددة — أضف يومًا أو فترة من المنتقي أعلاه إن وجدت.</span>
        ) : (
          <>
            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-extrabold text-slate-600">
              {holidays.length > 1 ? `من ${hijriInfo(holidays[0]).dm} إلى ${hijriInfo(holidays[holidays.length - 1]).dm} — ${arNum(holidays.length)} يوم` : 'يوم واحد'}
            </span>
            {holidays.map((h) => (
              <span key={h} className="inline-flex items-center gap-1 rounded-full bg-slate-800 py-0.5 pe-1 ps-2.5 text-[11px] font-bold text-white">
                ☾ {weekdayName(h)} · {hijriInfo(h).dm}
                <button type="button" onClick={() => removeHoliday(h)} className="rounded-full px-1.5 text-slate-300 hover:bg-rose-600 hover:text-white no-print" title="حذف">
                  ✕
                </button>
              </span>
            ))}
          </>
        )}
        <span className="ms-1 text-slate-500">
          أيام الدراسة: <b className="text-slate-800">{arNum(days)}</b>
        </span>
      </div>
    </section>
  );
}
