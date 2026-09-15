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
    sughra: 0.25,
    kubra: 0.5,
  });
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
        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className="field-label">مراجعة صغرى يوميًا</span>
            {sel(AMOUNT_OPTS_OPTIONAL, f.sughra, set('sughra'))}
          </label>
          <label>
            <span className="field-label">مراجعة كبرى يوميًا</span>
            {sel(AMOUNT_OPTS_OPTIONAL, f.kubra, set('kubra'))}
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
