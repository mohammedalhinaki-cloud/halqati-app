'use client';
import { useState } from 'react';
import { workingDayCount } from '../lib/plan';
import { hijriInfo, weekdayName } from '../lib/hijri.js';
import { arNum } from '../lib/quran';
import HijriDatePicker from './HijriDatePicker.jsx';

export default function SettingsCard({ settings, onChange }) {
  const days = workingDayCount(settings);
  const [holPick, setHolPick] = useState('');
  const holidays = settings.holidays
    .split(/[,،\s]+/)
    .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s))
    .sort();

  const addHoliday = () => {
    if (!holPick || holidays.includes(holPick)) return;
    onChange({ holidays: [...holidays, holPick].sort().join(', ') });
    setHolPick('');
  };
  const removeHoliday = (d) => onChange({ holidays: holidays.filter((x) => x !== d).join(', ') });

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
          <span className="field-label">إضافة يوم إجازة (يُتخطى تلقائيًا)</span>
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
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
        {holidays.length === 0 ? (
          <span className="text-slate-400">لا توجد إجازات محددة — أضفها من المنتقي أعلاه إن وجدت.</span>
        ) : (
          holidays.map((h) => (
            <span key={h} className="inline-flex items-center gap-1 rounded-full bg-slate-800 py-0.5 pe-1 ps-2.5 text-[11px] font-bold text-white">
              ☾ {weekdayName(h)} · {hijriInfo(h).dm}
              <button type="button" onClick={() => removeHoliday(h)} className="rounded-full px-1.5 text-slate-300 hover:bg-rose-600 hover:text-white no-print" title="حذف">
                ✕
              </button>
            </span>
          ))
        )}
        <span className="ms-1 text-slate-500">
          أيام الدراسة: <b className="text-slate-800">{arNum(days)}</b> — التخزين خلفيًا ميلادي (YYYY-MM-DD) والعرض هجري أم القرى دائمًا.
        </span>
      </div>
    </section>
  );
}
