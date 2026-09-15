'use client';
import { useState } from 'react';
import { SURAHS, AMOUNT_OPTS, AMOUNT_OPTS_OPTIONAL, arNum } from '../lib/quran';
import { LEVELS, newStudent } from '../lib/store';

const sel = (opts, value, set) => (
  <select className="field" value={value} onChange={(e) => set(e.target.value)}>
    {opts.map((o) => (
      <option key={o.v} value={o.v}>
        {o.label}
      </option>
    ))}
  </select>
);

function SurahSelect({ value, set }) {
  return (
    <select className="field" value={value} onChange={(e) => set(Number(e.target.value))}>
      {SURAHS.map((s) => (
        <option key={s.n} value={s.n}>
          {arNum(s.n)} – {s.name} (ص {arNum(s.page)})
        </option>
      ))}
    </select>
  );
}

export default function AddStudentForm({ onAdd }) {
  const [f, setF] = useState({
    name: '',
    phone: '',
    level: 'ibtida-i',
    halaqa: '',
    dailyHifz: 0.25,
    from: 1,
    to: 114,
    majorEnabled: false,
    majorFaces: 0.5,
  });
  const MAJOR_OPTS = [
    { v: 0.25, label: 'ربع وجه' },
    { v: 0.5, label: 'نصف وجه' },
    { v: 0.75, label: 'ثلاثة أرباع وجه' },
    { v: 1, label: 'وجه' },
    { v: 1.5, label: 'وجه ونصف' },
  ];
  const [err, setErr] = useState('');
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const setLevel = (lv) => setF((s) => ({ ...s, level: lv, dailyHifz: LEVELS[lv].faces }));

  const submit = (e) => {
    e.preventDefault();
    if (!f.name.trim()) return setErr('اسم الطالب مطلوب');
    if (!/^05\d{8}$/.test(f.phone.trim())) return setErr('رقم الجوال يبدأ بـ 05 ومكوّن من 10 أرقام');
    setErr('');
    onAdd(newStudent(f));
    setF((s) => ({ ...s, name: '', phone: '' }));
  };

  return (
    <section className="card p-4 no-print" aria-label="إضافة طالب">
      <h2 className="mb-3 text-base font-extrabold text-slate-900">إضافة طالب</h2>
      <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label>
          <span className="field-label">اسم الطالب *</span>
          <input className="field" value={f.name} onChange={(e) => set('name')(e.target.value)} placeholder="الاسم الكامل" />
        </label>
        <label>
          <span className="field-label">جوال ولي الأمر *</span>
          <input className="field" dir="ltr" value={f.phone} onChange={(e) => set('phone')(e.target.value)} placeholder="05xxxxxxxx" inputMode="numeric" />
        </label>
        <label>
          <span className="field-label">المستوى</span>
          <select className="field" value={f.level} onChange={(e) => setLevel(e.target.value)}>
            {Object.entries(LEVELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label} — {v.hint}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="field-label">اسم الحلقة</span>
          <input className="field" value={f.halaqa} onChange={(e) => set('halaqa')(e.target.value)} placeholder="حلقة الفرقان — الصباح" />
        </label>
        <label>
          <span className="field-label">ورد الحفظ اليومي</span>
          {sel(AMOUNT_OPTS, f.dailyHifz, set('dailyHifz'))}
        </label>
        <label>
          <span className="field-label">من سورة</span>
          <SurahSelect value={f.from} set={set('from')} />
        </label>
        <label>
          <span className="field-label">إلى سورة</span>
          <SurahSelect value={f.to} set={set('to')} />
        </label>
        <div className="sm:col-span-2 lg:col-span-4 grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3 sm:grid-cols-3">
          <div className="text-[13px] leading-6">
            <span className="field-label">المراجعة الصغرى</span>
            <p className="mt-1 rounded-md bg-emerald-50 px-2 py-1 text-[12px] font-bold text-emerald-800">
              ⟳ تلقائية — حفظ اليوم يصبح مراجعة صغرى غدًا، بلا إدخال منك
            </p>
          </div>
          <label className="flex cursor-pointer flex-col justify-end gap-1 text-[13px] font-bold text-slate-700">
            <span className="field-label">المراجعة الكبرى</span>
            <span className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-2 py-1.5">
              <input
                type="checkbox"
                className="h-4 w-4 accent-violet-700"
                checked={f.majorEnabled}
                onChange={(e) => setF((s) => ({ ...s, majorEnabled: e.target.checked }))}
              />
              تفعيل المراجعة الكبرى
            </span>
          </label>
          <label className={f.majorEnabled ? '' : 'pointer-events-none opacity-40'}>
            <span className="field-label">مقدار الكبرى يوميًا</span>
            {sel(MAJOR_OPTS, f.majorFaces, (v) => setF((s) => ({ ...s, majorFaces: Number(v) })))}
          </label>
        </div>
        <div className="sm:col-span-2 lg:col-span-4 flex items-center justify-between">
          <span className="text-xs text-rose-600 font-bold">{err}</span>
          <button type="submit" className="btn bg-emerald-700 text-white hover:bg-emerald-800">
            + إضافة الطالب
          </button>
        </div>
      </form>
    </section>
  );
}
