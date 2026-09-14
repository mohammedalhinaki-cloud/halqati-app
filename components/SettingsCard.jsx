'use client';
import { workingDayCount, hijriInfo, weekdayName } from '../lib/plan';
import { arNum } from '../lib/quran';

export default function SettingsCard({ settings, onChange }) {
  const days = workingDayCount(settings);
  const hol = settings.holidays.split(/[,،\s]+/).filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s));
  const holidayCount = hol.length;
  return (
    <section className="card p-4" aria-label="الإعدادات العامة">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-extrabold text-slate-900">الإعدادات العامة <span className="text-xs font-normal text-slate-500">(قابلة للتعديل في أي وقت — والخطة تُحدَّث فورًا)</span></h2>
        <span className="rounded-full bg-slate-800 px-3 py-0.5 text-xs font-bold text-white">أيام العمل: الأحد – الأربعاء</span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label>
          <span className="field-label">تاريخ بداية الخطة</span>
          <input type="date" className="field" value={settings.startDate} onChange={(e) => onChange({ startDate: e.target.value })} />
        </label>
        <label>
          <span className="field-label">تاريخ نهاية الخطة</span>
          <input type="date" className="field" value={settings.endDate} onChange={(e) => onChange({ endDate: e.target.value })} />
        </label>
        <label>
          <span className="field-label">الإجازات / العطلات (YYYY-MM-DD مفصولة بفاصلة)</span>
          <input
            type="text"
            dir="ltr"
            className="field font-mono"
            placeholder="2026-09-23, 2026-10-05"
            value={settings.holidays}
            onChange={(e) => onChange({ holidays: e.target.value })}
          />
        </label>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        المقابل الهجري: البداية <b className="font-extrabold text-slate-800">{hijriInfo(settings.startDate).full}</b> · النهاية{' '}
        <b className="font-extrabold text-slate-800">{hijriInfo(settings.endDate).full}</b> — عدد أيام الدراسة:{' '}
        <b className="text-slate-800">{arNum(days)}</b> يومًا.
      </p>
      {holidayCount > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {hol.map((h) => (
            <span key={h} className="rounded-full bg-slate-800 px-2.5 py-0.5 text-[11px] font-bold text-white">
              ☾ {weekdayName(h)} · {hijriInfo(h).dm} {hijriInfo(h).y}
            </span>
          ))}
          <span className="text-[11px] text-slate-400 self-center">— تُعرض في الجدول كشريط «إجازة» وتُتخطى تلقائيًا</span>
        </div>
      )}
    </section>
  );
}
