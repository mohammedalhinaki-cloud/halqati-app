'use client';
import { useMemo, useState } from 'react';
import { buildPlan, weekKey, weekdayName, hijriInfo } from '../lib/plan';
import { amountLabel, arNum, arDec, spanLabel, QPP } from '../lib/quran';
import { LEVELS } from '../lib/store';

const HIFZ_STYLE = {
  saved: { txt: '✓ حفظ', cls: 'bg-emerald-100 text-emerald-800 border-emerald-600' },
  missed: { txt: '✗ لم يحفظ', cls: 'bg-rose-100 text-rose-700 border-rose-500' },
  absent: { txt: 'غائب', cls: 'bg-stone-200 text-stone-600 border-stone-400' },
};
const REV_STYLE = {
  done: { txt: '✓ تمت', cls: 'bg-emerald-100 text-emerald-800 border-emerald-600' },
  missed: { txt: '✗ لم تتم', cls: 'bg-rose-100 text-rose-700 border-rose-500' },
  absent: { txt: 'غائب', cls: 'bg-stone-200 text-stone-600 border-stone-400' },
};
const DAY_CELL = (r) =>
  r.status === 'saved'
    ? 'bg-emerald-50/70'
    : r.status === 'missed'
      ? 'bg-rose-50'
      : r.status === 'absent'
        ? 'bg-stone-100/60 text-stone-500'
        : '';

function Stat({ label, value, cls }) {
  return (
    <div className={'rounded-lg border px-3 py-2 text-center ' + cls}>
      <div className="text-xl font-extrabold leading-6">{value}</div>
      <div className="text-[11px] font-bold opacity-80">{label}</div>
    </div>
  );
}

function ReviewCell({ cell, style, deferred, dueTxt }) {
  const lbl = cell && cell.qLo != null && cell.qHi > cell.qLo ? spanLabel(cell.qLo, cell.qHi) : null;
  const st = cell && cell.status ? style[cell.status] : null;
  return (
    <td className={'align-top text-[12px] leading-5 ' + (cell && (cell.status === 'missed' || cell.status === 'absent') ? 'bg-rose-50/60' : '')}>
      {lbl ? (
        <span className={cell.preview ? 'text-slate-400 italic' : 'font-bold text-slate-800'}>
          سورة {lbl.surah} <span className="font-normal text-slate-500">{lbl.range}</span>
          {cell.plannedQ > 0 && <span className="text-slate-400"> · {amountLabel(cell.plannedQ)}</span>}
        </span>
      ) : st ? (
        <span className="font-bold text-rose-600">— {deferred}</span>
      ) : (
        <span className="text-slate-300">{dueTxt}</span>
      )}
      {st && <div className="mt-0.5"><span className={'inline-block rounded border px-1.5 py-0.5 text-[10px] font-extrabold ' + st.cls}>{st.txt}</span></div>}
      {cell && cell.backlog > 0 && (
        <div className="mt-0.5 inline-block rounded bg-violet-100 px-1.5 text-[10px] font-bold text-violet-800">
          {amountLabel(cell.backlog)} كبرى مؤجَّلة — تنزاح، لا تُدمج
        </div>
      )}
    </td>
  );
}

function CtlBtns({ value, onPick, opts }) {
  return (
    <div className="flex flex-wrap justify-center gap-1 no-print">
      {opts.map(([v, label, on]) => (
        <button
          key={v}
          onClick={() => onPick(v)}
          className={
            'rounded-md border px-2 py-0.5 text-[10px] font-bold transition ' +
            (value === v ? `${on} border-transparent text-white shadow` : 'border-slate-300 bg-white text-slate-500 hover:bg-slate-100')
          }
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function DayRow({ row, student, onStatus }) {
  const hj = hijriInfo(row.date);
  const lbl = row.qLo != null && row.qHi > row.qLo ? spanLabel(row.qLo, row.qHi) : null;
  const st = row.status ? HIFZ_STYLE[row.status] : null;
  const hifzPick = (v) => onStatus(row.date, 'hifz', row.status === v ? null : v);
  const majorPick = (v) => onStatus(row.date, 'major', (row.major && row.major.status) === v ? null : v);
  return (
    <tr className={DAY_CELL(row)}>
      <td className="font-bold whitespace-nowrap">{weekdayName(row.date)}</td>
      <td className="whitespace-nowrap">
        <div className="text-[13px] font-extrabold text-slate-800">{hj.dm}</div>
        <div className="text-[10px] text-slate-400">{hj.y}</div>
        {row.beyondPlan && <div className="text-[10px] font-bold text-rose-600">يوم إضافي بعد الخطة</div>}
      </td>
      <td>
        {row.empty ? (
          <span className="text-slate-400">اكتمل المطلوب — لا جديد</span>
        ) : row.status === 'missed' || row.status === 'absent' ? (
          <span className="font-bold text-rose-600">— {row.status === 'missed' ? 'لم يحفظ' : 'غائب'}: اليوم أُجِّل بالكامل</span>
        ) : (
          <>
            <div className="font-bold text-slate-800">سورة {lbl ? lbl.surah : '—'}</div>
            <div className="text-[11px] text-slate-500">{lbl ? lbl.range : ''}</div>
          </>
        )}
        <div className="mt-0.5 flex flex-wrap items-center gap-1">
          <span className="text-[12px] font-extrabold">{amountLabel(row.amountQ)}</span>
          {!row.status && !row.empty && <span className="rounded bg-slate-100 px-1.5 text-[10px] font-bold text-slate-500">مجدول</span>}
          {row.shiftedBy > 0 && (
            <span className="rounded bg-amber-100 px-1.5 text-[10px] font-bold text-amber-800">الخطة متأخرة {arNum(row.shiftedBy)} يومًا — انزياح، لا دمج</span>
          )}
        </div>
      </td>
      <td>{st ? <span className={'inline-block rounded border px-2 py-0.5 text-xs font-extrabold ' + st.cls}>{st.txt}</span> : <span className="text-slate-300">—</span>}</td>
      <td>
        <CtlBtns
          value={row.status}
          onPick={hifzPick}
          opts={[
            ['saved', 'حفظ', 'bg-emerald-600'],
            ['missed', 'لم يحفظ', 'bg-rose-600'],
            ['absent', 'غائب', 'bg-stone-500'],
          ]}
        />
      </td>
      <ReviewCell
        cell={row.minor}
        style={REV_STYLE}
        deferred="—"
        dueTxt="لا شيء مستحق"
      />
      {student.majorEnabled ? (
        <>
          <ReviewCell
            cell={row.major}
            style={REV_STYLE}
            deferred="أُجِّلت لليوم التالي"
            dueTxt="بانتظار حفظ جديد"
          />
          <td className="align-top">
            <CtlBtns
              value={(row.major && row.major.status) || null}
              onPick={majorPick}
              opts={[
                ['done', 'تمت', 'bg-violet-600'],
                ['missed', 'لم تتم', 'bg-rose-600'],
                ['absent', 'غائب', 'bg-stone-500'],
              ]}
            />
          </td>
        </>
      ) : (
        <td colSpan={2} className="text-center align-middle text-[11px] text-slate-400">
          غير مفعّلة
        </td>
      )}
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
  const level = LEVELS[student.level] || { label: student.level };
  const cols = student.majorEnabled ? 8 : 6;
  const dirChip = plan.descending
    ? { txt: 'اتجاه الحفظ: تنازلي ↓ (المِرآة فعّالة)', cls: 'bg-amber-50 text-amber-800 border border-amber-200' }
    : { txt: 'اتجاه الحفظ: تصاعدي ↑ (عادي، بدون مرآة)', cls: 'bg-emerald-50 text-emerald-800 border border-emerald-200' };

  return (
    <section className="card p-4" aria-label={`خطة ${student.name}`}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2 border-b-2 border-slate-200 pb-3">
        <div>
          <h3 className="text-lg font-extrabold text-slate-900">{student.name}</h3>
          <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] font-bold">
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{level.label}</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{student.halaqa}</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600" dir="ltr">
              ☎ {student.phone}
            </span>
            <span className={'rounded-full px-2 py-0.5 ' + dirChip.cls}>{dirChip.txt}</span>
            <span className="rounded-full bg-sky-50 px-2 py-0.5 text-sky-700">صغرى: تلقائية = حفظ الأمس</span>
            {student.majorEnabled ? (
              <span className="rounded-full bg-violet-50 px-2 py-0.5 text-violet-700">
                كبرى: {amountLabel(student.majorBaseQ)} يوميًا{plan.majorPendingQ > 0 ? ` · في الطابور ${amountLabel(plan.majorPendingQ)}` : ''}
              </span>
            ) : (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-400">كبرى: غير مفعّلة</span>
            )}
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

      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Stat label="أيام حُفظت" value={arNum(stats.saved)} cls="border-emerald-200 bg-emerald-50 text-emerald-800" />
        <Stat label="لم يحفظ" value={arNum(stats.missed)} cls="border-rose-200 bg-rose-50 text-rose-700" />
        <Stat label="غياب" value={arNum(stats.absent)} cls="border-stone-300 bg-stone-50 text-stone-600" />
        <Stat label="أيام مجدولة متبقية" value={arNum(stats.pending)} cls="border-sky-200 bg-sky-50 text-sky-800" />
        <Stat label="المحفوظ" value={`${arDec(savedQ / QPP)} / ${arDec(totalQ / QPP)}`} cls="border-slate-300 bg-slate-50 text-slate-700" />
      </div>
      {student.majorEnabled && (
        <div className="mb-3 flex flex-wrap gap-2 text-[11px] font-bold text-violet-700">
          <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5">
            كبرى — تمت: {arNum(stats.major.saved)} · لم تتم: {arNum(stats.major.missed)} · غياب: {arNum(stats.major.absent)} · روجع {arDec(stats.major.savedQ / QPP)} وجهًا
          </span>
        </div>
      )}
      <div className="mb-3 h-3 overflow-hidden rounded-full bg-slate-200" title={`${pct}%`}>
        <div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${pct}%` }} />
      </div>

      {plan.shiftedBy > 0 && (
        <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
          بسبب {arNum(plan.shiftedBy)} يوم تأجيل، انزاحت الخطة {arNum(plan.shiftedBy)} يومًا للأمام — لم يُدمج أي مقدار في يوم واحد، وسيُستكمل المتبقي بعد نهاية الخطة تلقائيًا.
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border-2 border-slate-700">
        <table className="paper-table w-full min-w-[860px] border-collapse bg-white text-sm">
          <thead>
            <tr>
              <th>اليوم</th>
              <th>التاريخ <span className="text-[10px] font-bold text-slate-500">(هجري)</span></th>
              <th>الحفظ الجديد</th>
              <th>حالة الحفظ</th>
              <th>تحكم الحفظ</th>
              <th className="!bg-sky-50">مراجعة صغرى <span className="text-[9px] font-bold text-sky-600">(تلقائية)</span></th>
              {student.majorEnabled ? (
                <>
                  <th className="!bg-violet-50">مراجعة كبرى</th>
                  <th className="!bg-violet-50">تحكم الكبرى</th>
                </>
              ) : (
                <th colSpan={2}>المراجعة الكبرى — معطّلة لهذا الطالب</th>
              )}
            </tr>
          </thead>
          <tbody>
            {weeks.length === 0 && (
              <tr>
                <td colSpan={cols} className="py-6 text-slate-400">
                  لا توجد أيام في هذه الفترة — عدّل تواريخ البداية/النهاية.
                </td>
              </tr>
            )}
            {weeks.map((w, wi) => {
              const dayRows = w.rows.filter((r) => r.type === 'day');
              const s = { saved: 0, missed: 0, absent: 0 };
              dayRows.forEach((r) => r.status && s[r.status]++);
              return <FragmentWeek key={w.key} n={wi + 1} w={w} s={s} dayRows={dayRows} onStatus={onStatus} student={student} cols={cols} />;
            })}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 text-[11px] text-slate-500">
              <td colSpan={cols}>
                التقدير للوجه الواحد: (٠) ثلاثة أخطاء لم يراجع / (١) خطآن جيد / (٢) خطأ واحد جيد جدًا / (٣) بدون أخطاء ممتاز — {level.hint}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
        <span>كل سجل مستقل: «لم يحفظ/لم تتم/غائب» يبقي يومه أحمر ويؤجّله يومًا كاملًا — الخطة تنزاح ولا تُدمج. الصغرى تُحسب تلقائيًا من حفظ الأمس.</span>
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

function FragmentWeek({ n, w, s, dayRows, student, cols, onStatus }) {
  const fr = w.rows[0],
    lr = w.rows[w.rows.length - 1];
  const range = !fr ? '' : fr.date === lr.date ? hijriInfo(fr.date).dm : `${hijriInfo(fr.date).dm} ← ${hijriInfo(lr.date).dm}`;
  return (
    <>
      <tr className="bg-slate-200/70 text-[12px] font-extrabold text-slate-700">
        <td colSpan={cols} className="text-right">
          الأسبوع {arNum(n)} <span className="font-normal text-slate-500">· {range}</span>
        </td>
      </tr>
      {w.rows.map((r) =>
        r.type === 'holiday' ? (
          <tr key={r.date} className="bg-slate-800 text-white">
            <td colSpan={cols} className="py-1 text-[13px] font-bold tracking-wide">
              ☾ إجازة — يوم {weekdayName(r.date)} {hijriInfo(r.date).full} — لا يوجد حفظ أو مراجعة
            </td>
          </tr>
        ) : (
          <DayRow key={r.date} row={r} student={student} onStatus={onStatus} />
        )
      )}
      <tr className="bg-slate-100 text-[12px] font-extrabold">
        <td colSpan={cols} className="text-right">
          نتيجة الفترة: حفظ <span className="text-emerald-700">{arNum(s.saved)}</span> · لم يحفظ{' '}
          <span className="text-rose-600">{arNum(s.missed)}</span> · غياب <span className="text-stone-600">{arNum(s.absent)}</span> · الأيام:{' '}
          <span className="text-slate-700">{arNum(dayRows.length)}</span>
        </td>
      </tr>
    </>
  );
}
