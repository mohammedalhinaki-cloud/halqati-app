'use client';
import { useMemo, useState } from 'react';
import { buildPlan, weekKey, weekdayName, hijriInfo } from '../lib/plan';
import { amountLabel, arNum, arDec, spanLabel, AMOUNT_OPTS, AMOUNT_OPTS_OPTIONAL, toQ, SURAHS, surahByNumber } from '../lib/quran';
import { LEVELS } from '../lib/store';

const STATUS_STYLE = {
  saved: { txt: '✓ حفظ', cls: 'bg-emerald-100 text-emerald-800 border-emerald-600' },
  missed: { txt: '✗ لم يحفظ', cls: 'bg-rose-100 text-rose-700 border-rose-500' },
  absent: { txt: 'غائب', cls: 'bg-stone-200 text-stone-600 border-stone-400' },
};
const DAY_CELL = (r) =>
  r.status === 'saved' ? 'bg-emerald-50' : r.status === 'missed' ? 'bg-rose-50' : r.status === 'absent' ? 'bg-stone-100/60 text-stone-500' : '';

function AmountName(v) {
  const o = [...AMOUNT_OPTS, ...AMOUNT_OPTS_OPTIONAL].find((x) => x.v === Number(v));
  return o ? o.label : '—';
}

function Stat({ label, value, cls }) {
  return (
    <div className={'rounded-lg border px-3 py-2 text-center ' + cls}>
      <div className="text-xl font-extrabold leading-6">{value}</div>
      <div className="text-[11px] font-bold opacity-80">{label}</div>
    </div>
  );
}

function DayRow({ row, onStatus }) {
  const hj = hijriInfo(row.date);
  const lbl = spanLabel(row.qLo ?? Math.min(row.fromQ, row.toQ), row.qHi ?? Math.max(row.fromQ, row.toQ));
  const st = row.status ? STATUS_STYLE[row.status] : null;
  const pick = (v) => onStatus(row.date, row.status === v ? null : v);
  return (
    <tr className={DAY_CELL(row)}>
      <td className="font-bold whitespace-nowrap">{weekdayName(row.date)}</td>
      <td className="whitespace-nowrap">
        <div className="text-[13px] font-extrabold text-slate-800">{hj.dm}</div>
        <div className="text-[10px] text-slate-400">{hj.y}</div>
        {row.beyondPlan && <div className="text-[10px] font-bold text-rose-600">بعد نهاية الخطة</div>}
      </td>
      <td>
        {row.empty && !row.status ? (
          <span className="text-slate-400">اكتمل المطلوب — لا شيء</span>
        ) : (
          <>
            <div className="font-bold text-slate-800">
              {row.status === 'missed' || row.status === 'absent' ? (lbl.surah !== '—' ? 'سورة ' + lbl.surah : '— (المطلوب اكتمل)') : 'سورة ' + lbl.surah}
              {row.status === 'missed' && row.deferredQ > 0 && (
                <span className="mr-1 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-extrabold text-rose-700">
                  {row.deferredQ > row.baseQ ? `يُؤجَّل للغد ${amountLabel(row.deferredQ)} (مع المؤجَّل)` : 'يُؤجَّل للغد — بلا دمج'}
                </span>
              )}
              {row.status === 'absent' && row.deferredQ > 0 && (
                <span className="mr-1 rounded bg-stone-200 px-1.5 py-0.5 text-[10px] font-extrabold text-stone-600">
                  {row.deferredQ > row.baseQ ? `يُنقل للغد ${amountLabel(row.deferredQ)}` : 'يُنقل للغد — بلا دمج'}
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-500">{lbl.range}</div>
          </>
        )}
      </td>
      <td>
        <div className="font-extrabold">{amountLabel(row.amountQ)}</div>
        {row.carryIn > 0 && (
          <div className="mt-0.5 inline-block rounded bg-amber-100 px-1.5 text-[10px] font-bold text-amber-800">
            + {amountLabel(row.carryIn)} مؤجَّل من سابق
          </div>
        )}
        {row.revS + row.revK > 0 && (
          <div className="mt-0.5 inline-block rounded bg-sky-100 px-1.5 text-[10px] font-bold text-sky-800">
            مراجعة مؤجَّلة: {[row.revS && `${amountLabel(row.revS)} صغرى`, row.revK && `${amountLabel(row.revK)} كبرى`].filter(Boolean).join(' + ')}
          </div>
        )}
        {(row.revDeferredS > 0 || row.revDeferredK > 0) && (
          <div className="mt-0.5 inline-block rounded bg-stone-100 px-1.5 text-[10px] font-bold text-stone-500">
            {amountLabel(row.revDeferredS + row.revDeferredK)} من المراجعة أُجِّلت للغد
          </div>
        )}
      </td>
      <td>{st ? <span className={'inline-block rounded border px-2 py-0.5 text-xs font-extrabold ' + st.cls}>{st.txt}</span> : <span className="text-slate-300">—</span>}</td>
      <td>
        <div className="flex justify-center gap-1 no-print">
          {[
            ['saved', 'حفظ', 'bg-emerald-600 text-white'],
            ['missed', 'لم يحفظ', 'bg-rose-600 text-white'],
            ['absent', 'غائب', 'bg-stone-500 text-white'],
          ].map(([v, label, on]) => (
            <button
              key={v}
              onClick={() => pick(v)}
              className={
                'rounded-md border px-2 py-1 text-[11px] font-bold transition ' +
                (row.status === v ? `${on} border-transparent shadow` : 'border-slate-300 bg-white text-slate-500 hover:bg-slate-100')
              }
            >
              {label}
            </button>
          ))}
        </div>
      </td>
    </tr>
  );
}

export default function StudentPlan({ student, settings, onStatus, onClear, onEdit }) {
  const plan = useMemo(() => buildPlan(student, settings), [student, settings]);
  const { rows, stats, totalQ, savedQ, range } = plan;
  const [edit, setEdit] = useState(null);

  const weeks = useMemo(() => {
    const m = [];
    for (const r of rows) {
      const k = weekKey(r.date);
      const last = m[m.length - 1];
      if (last && last.key === k) last.rows.push(r);
      else m.push({ key: k, rows: [r] });
    }
    return m;
  }, [rows]);

  const pct = totalQ > 0 ? Math.min(100, Math.round((savedQ / totalQ) * 100)) : 0;
  const saved = plan.rows.filter((r) => r.type === 'day');
  const level = LEVELS[student.level] || { label: student.level };

  return (
    <section className="card p-4" aria-label={`خطة ${student.name}`}>
      {/* header: like the official card header */}
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2 border-b-2 border-slate-200 pb-3">
        <div>
          <h3 className="text-lg font-extrabold text-slate-900">{student.name}</h3>
          <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] font-bold">
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{level.label}</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{student.halaqa}</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600" dir="ltr">
              ☎ {student.phone}
            </span>
            <span className="rounded-full bg-sky-50 px-2 py-0.5 text-sky-700">صغرى يوميًا: {AmountName(student.sughra)}</span>
            <span className="rounded-full bg-violet-50 px-2 py-0.5 text-violet-700">كبرى يوميًا: {AmountName(student.kubra)}</span>
            <span className={'rounded-full px-2 py-0.5 ' + (plan.forward ? 'bg-emerald-50 text-emerald-700' : 'bg-indigo-50 text-indigo-700')}>
              {plan.forward ? '⬆ تصاعدي (بدون عكس)' : '⬇ تنازلي (من آخر المدى إلى أوله)'}
            </span>
          </div>
        </div>
        <div className="text-left">
          {onEdit && (
            <button
              onClick={() => setEdit(edit ? null : { name: student.name, phone: student.phone, from: String(plan.fromN), to: String(plan.toN), dailyHifz: String(student.dailyHifz), sughra: String(student.sughra ?? 0), kubra: String(student.kubra ?? 0) })}
              className={'btn mb-1 me-1 border text-xs font-bold no-print ' + (edit ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-100')}
            >
              ✎ تعديل الطالب
            </button>
          )}
          <div className="text-xs text-slate-500">
            المدى: <b className="text-slate-800">{range.fromSurah} ← {range.toSurah}</b> = <b className="text-slate-800">{arDec(range.faces)}</b> وجهًا · <b className="text-slate-800">{arNum(range.planDays)}</b> يوم دراسة
          </div>
          <button onClick={() => window.print()} className="btn mt-1 border border-slate-300 bg-white text-slate-600 hover:bg-slate-100 no-print">
            🖨 طباعة البطاقة
          </button>
        </div>
      </div>

      {edit && (
        <div className="mb-3 rounded-lg border-2 border-slate-300 bg-slate-50 p-3 no-print" dir="rtl">
          <div className="mb-2 text-xs font-extrabold text-slate-600">تعديل بيانات الطالب — كل الحقول اختيارية، اتركها كما هي لحفظ التغييرات</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <label className="text-[11px] font-bold text-slate-600">الاسم
              <input className="field mt-1" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            </label>
            <label className="text-[11px] font-bold text-slate-600">الجوال
              <input className="field mt-1" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} />
            </label>
            <label className="text-[11px] font-bold text-slate-600">حفظ يومي
              <select className="field mt-1" value={edit.dailyHifz} onChange={(e) => setEdit({ ...edit, dailyHifz: e.target.value })}>
                {AMOUNT_OPTS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
              </select>
            </label>
            <label className="text-[11px] font-bold text-slate-600">من سورة
              <select className="field mt-1" value={edit.from} onChange={(e) => setEdit({ ...edit, from: e.target.value })}>
                {SURAHS.map((su) => <option key={su.n} value={su.n}>{arNum(su.n)} – {su.name}</option>)}
              </select>
            </label>
            <label className="text-[11px] font-bold text-slate-600">إلى سورة
              <select className="field mt-1" value={edit.to} onChange={(e) => setEdit({ ...edit, to: e.target.value })}>
                {SURAHS.map((su) => <option key={su.n} value={su.n}>{arNum(su.n)} – {su.name}</option>)}
              </select>
            </label>
            <div className="flex flex-col justify-end gap-1">
              <label className="text-[11px] font-bold text-slate-600">مراجعة صغرى
                <select className="field mt-1" value={edit.sughra} onChange={(e) => setEdit({ ...edit, sughra: e.target.value })}>
                  {AMOUNT_OPTS_OPTIONAL.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
                </select>
              </label>
              <label className="text-[11px] font-bold text-slate-600">مراجعة كبرى
                <select className="field mt-1" value={edit.kubra} onChange={(e) => setEdit({ ...edit, kubra: e.target.value })}>
                  {AMOUNT_OPTS_OPTIONAL.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
                </select>
              </label>
            </div>
          </div>
          <div className="mt-2 flex gap-2">
            <button
              className="btn rounded-lg bg-slate-800 px-4 py-1.5 text-xs font-extrabold text-white"
              onClick={() => {
                onEdit({
                  name: edit.name.trim() || student.name,
                  phone: edit.phone.trim() || student.phone,
                  dailyHifz: Number(edit.dailyHifz),
                  from: Number(edit.from),
                  to: Number(edit.to),
                  sughra: Number(edit.sughra),
                  kubra: Number(edit.kubra),
                });
                setEdit(null);
              }}
            >
              💾 حفظ التعديل
            </button>
            <button className="btn rounded-lg border border-slate-300 bg-white px-4 py-1.5 text-xs font-bold text-slate-600" onClick={() => setEdit(null)}>
              إلغاء
            </button>
            {(Number(edit.from) > Number(edit.to)) && (
              <span className="self-center text-[11px] font-bold text-indigo-600"> المدى تنازلي: ستبدأ الخطة من {surahByNumber(Number(edit.to)).name} وتصعد إلى {surahByNumber(Number(edit.from)).name}</span>
            )}
            {(Number(edit.from) < Number(edit.to)) && (
              <span className="self-center text-[11px] font-bold text-emerald-700">⬆ تصاعدي: ستبدأ الخطة من {surahByNumber(Number(edit.from)).name} وتنهي في {surahByNumber(Number(edit.to)).name}</span>
            )}
          </div>
        </div>
      )}

      {/* stats */}
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Stat label="أيام حُفظت" value={arNum(stats.saved)} cls="border-emerald-200 bg-emerald-50 text-emerald-800" />
        <Stat label="لم يحفظ" value={arNum(stats.missed)} cls="border-rose-200 bg-rose-50 text-rose-700" />
        <Stat label="غياب" value={arNum(stats.absent)} cls="border-stone-300 bg-stone-50 text-stone-600" />
        <Stat label="أيام متبقية" value={arNum(stats.pending)} cls="border-sky-200 bg-sky-50 text-sky-800" />
        <Stat label="المحفوظ" value={`${arDec(savedQ / 4)} / ${arDec(totalQ / 4)}`} cls="border-slate-300 bg-slate-50 text-slate-700" />
      </div>
      <div className="mb-3 h-3 overflow-hidden rounded-full bg-slate-200" title={`${pct}%`}>
        <div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${pct}%` }} />
      </div>

      {plan.carryLeft > 0 && (
        <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
          تنبيه: تأجيلات آخر الخطة تُكمل في أيام إضافية بعد نهايتها تلقائيًا.
        </div>
      )}

      {/* the paper-form table */}
      <div className="overflow-x-auto rounded-lg border-2 border-slate-700">
        <table className="paper-table w-full min-w-[820px] border-collapse bg-white text-sm">
          <thead>
            <tr>
              <th>اليوم</th>
              <th>التاريخ <span className="text-[10px] font-bold text-slate-500">(هجري)</span></th>
              <th>السورة</th>
              <th>المقدار</th>
              <th>الحالة</th>
              <th>تحكم</th>
            </tr>
          </thead>
          <tbody>
            {weeks.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-slate-400">
                  لا توجد أيام في هذه الفترة — عدّل تواريخ البداية/النهاية.
                </td>
              </tr>
            )}
            {weeks.map((w, wi) => {
              const dayRows = w.rows.filter((r) => r.type === 'day');
              const s = { saved: 0, missed: 0, absent: 0 };
              dayRows.forEach((r) => r.status && s[r.status]++);
              return (
                <FragmentWeek key={w.key} n={wi + 1} w={w} s={s} dayRows={dayRows} onStatus={onStatus} />
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 text-[11px] text-slate-500">
              <td colSpan={6}>
                التقدير للوجه الواحد: (٠) ثلاثة أخطاء لم يراجع / (١) خطآن جيد / (٢) خطأ واحد جيد جدًا / (٣) بدون أخطاء ممتاز — {level.hint}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
        <span>«لم يحفظ/غائب»: اليوم يبقى مُعلَّمًا ويُؤجَّل مقدارُه (وحصتا المراجعة صغرى/كبرى) إلى اليوم التالي كاملاً — بلا دمج مضاعف، والخطة كلها تنزاح يومًا.</span>
        <button
          onClick={() => confirm('مسح كل حالات الأيام لهذا الطالب؟') && onClear(student.id)}
          className="btn border border-slate-300 bg-white text-slate-500 hover:bg-slate-100 no-print"
        >
          إعادة تعيين الحالات
        </button>
      </div>
    </section>
  );
}

function FragmentWeek({ n, w, s, dayRows, onStatus }) {
  const fr = w.rows[0], lr = w.rows[w.rows.length - 1];
  const range = !fr ? '' : fr.date === lr.date ? hijriInfo(fr.date).dm : `${hijriInfo(fr.date).dm} ← ${hijriInfo(lr.date).dm}`;
  return (
    <>
      <tr className="bg-slate-200/70 text-[12px] font-extrabold text-slate-700">
        <td colSpan={6} className="text-right">
          الأسبوع {arNum(n)} <span className="font-normal text-slate-500">· {range}</span>
        </td>
      </tr>
      {w.rows.map((r) =>
        r.type === 'holiday' ? (
          <tr key={r.date} className="bg-slate-800 text-white">
            <td colSpan={6} className="py-1 text-[13px] font-bold tracking-wide">
              ☾ إجازة — يوم {weekdayName(r.date)} {hijriInfo(r.date).full} — لا يوجد حفظ أو مراجعة
            </td>
          </tr>
        ) : (
          <DayRow key={r.date} row={r} onStatus={onStatus} />
        )
      )}
      <tr className="bg-slate-100 text-[12px] font-extrabold">
        <td colSpan={6} className="text-right">
          نتيجة الفترة: حفظ <span className="text-emerald-700">{arNum(s.saved)}</span> · لم يحفظ{' '}
          <span className="text-rose-600">{arNum(s.missed)}</span> · غياب <span className="text-stone-600">{arNum(s.absent)}</span> ·
          الأيام: <span className="text-slate-700">{arNum(dayRows.length)}</span>
          <label className="float-left font-normal text-slate-500">
            ☐ تم &nbsp; ☐ لم يتم
          </label>
        </td>
      </tr>
    </>
  );
}
