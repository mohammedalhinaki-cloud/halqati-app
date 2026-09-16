'use client';
import { Fragment, useMemo, useState } from 'react';
import { buildPlan, weekKey, weekdayName, hijriInfo } from '../lib/plan';
import { amountLabel, arNum, arDec, rangeLabel, rangeFromSurahAyah, ayahRef, splitDose, toQ, QPP, AMOUNT_OPTS, SURAHS } from '../lib/quran';
import { LEVELS } from '../lib/store';

/** the student's chosen major-review dose (quarters); legacy fallback: نصف وجه */
const majorBaseQOf = (student) => (Number(student.majorBaseQ) > 0 ? Number(student.majorBaseQ) : 2);

const HIFZ_STYLE = {
  saved: { txt: '✓ حفظ', cls: 'bg-emerald-100 text-emerald-800 border-emerald-600' },
  missed: { txt: '✗ لم يحفظ', cls: 'bg-rose-100 text-rose-700 border-rose-500' },
  absent: { txt: 'غائب', cls: 'bg-stone-200 text-stone-600 border-stone-400' },
};
const REV_STYLE = {
  done: { txt: '✓ تمت', cls: 'bg-emerald-100 text-emerald-800 border-emerald-600' },
  missed: { txt: '✗ لم تتم', cls: 'bg-rose-100 text-rose-700 border-rose-500' },
  absent: { txt: 'غائب', cls: 'bg-stone-200 text-stone-600 border-stone-400' },
  none: { txt: 'لا يوجد', cls: 'bg-slate-200 text-slate-600 border-slate-400' },
};
const DAY_CELL = (r) =>
  r.status === 'saved' ? 'bg-emerald-50/70' : r.status === 'missed' ? 'bg-rose-50' : r.status === 'absent' ? 'bg-stone-100/60 text-stone-500' : '';

function Stat({ label, value, cls }) {
  return (
    <div className={'rounded-lg border px-3 py-2 text-center ' + cls}>
      <div className="text-xl font-extrabold leading-6">{value}</div>
      <div className="text-[11px] font-bold opacity-80">{label}</div>
    </div>
  );
}

/**
 * The day's content, always rendered from the verified ayah range
 * (row.gFrom..row.gTo) — never from a quarter-face number. The surah/ayah
 * bounds are printed exactly as they come from lib/quran-data.js.
 */
function RangeText({ span, preview, amount }) {
  if (!span || span.gFrom == null || span.gTo == null) return null;
  const L = rangeLabel(span.gFrom, span.gTo);
  return (
    <>
      <span className={preview ? 'italic text-slate-400' : 'font-bold text-slate-800'}>
        سورة {L.head} <span className="font-normal text-slate-500">{L.detail}</span>
        {amount > 0 && <span className="text-slate-400"> · {amountLabel(amount)}</span>}
      </span>
      {L.inRangeSurahEnds.map((e) => (
        <div key={'e' + e.surah} className="mt-0.5 inline-block rounded bg-emerald-50 px-1.5 text-[10px] font-bold text-emerald-700">
          ختام {e.name} — آخر آية ({arNum(e.ayah)})
        </div>
      ))}
      {L.inRangeSurahStarts.map((e) => (
        <div key={'s' + e.surah} className="mt-0.5 inline-block rounded bg-sky-50 px-1.5 text-[10px] font-bold text-sky-700">
          بداية {e.name} — الآية ١
        </div>
      ))}
      {L.lastAyahOfMushaf && <div className="mt-0.5 inline-block rounded bg-violet-50 px-1.5 text-[10px] font-bold text-violet-700">آخر آية في المصحف</div>}
    </>
  );
}

function MarkCell({ label, span, status, amount, style, preview, deferred, dueTxt, onPick, opts, badge, onEditAmount, anchor }) {
  const st = status ? style[status] : null;
  return (
    <td className={'align-top border-r border-slate-100 ' + (status === 'missed' || status === 'absent' || status === 'none' ? 'bg-rose-50/60' : status === 'done' || status === 'saved' ? 'bg-emerald-50/50' : '')}>
      <div className="mb-0.5 flex items-center justify-between text-[10px] font-extrabold tracking-wide text-slate-400">
        <span>{label}</span>
        {onEditAmount && anchor && (
          <button type="button" onClick={onEditAmount} className="rounded px-1 text-base leading-3 text-slate-500 hover:bg-slate-200" aria-label="تعديل مقدار الخلية">
            ⋮
          </button>
        )}
      </div>
      <div className="text-[12px] leading-5">
        {span && span.gFrom != null ? (
          <RangeText span={span} preview={preview} amount={amount} />
        ) : st ? (
          <span className="font-bold text-rose-600">— {deferred}</span>
        ) : (
          <span className="text-slate-300">{dueTxt}</span>
        )}
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-1">
        {st && <span className={'rounded border px-1.5 py-0.5 text-[10px] font-extrabold ' + st.cls}>{st.txt}</span>}
        {preview && !st && <span className="rounded bg-slate-100 px-1.5 text-[10px] font-bold text-slate-500">معاينة مجدولة</span>}
        {badge}
      </div>
      {onPick && (
        <div className="mt-1 flex flex-wrap gap-1 no-print">
          {opts.map(([v, txt, on]) => (
            <button
              key={v}
              onClick={() => onPick(v)}
              className={'rounded border px-1.5 py-0.5 text-[10px] font-bold ' + (status === v ? `${on} border-transparent text-white shadow` : 'border-slate-300 bg-white text-slate-500 hover:bg-slate-100')}
            >
              {txt}
            </button>
          ))}
        </div>
      )}
    </td>
  );
}

function DayRow({ row, student, onStatus, onEditAmount, hifzLimit }) {
  const hj = hijriInfo(row.date);
  const pick = (stream, v) => {
    const cur = stream === 'hifz' ? row.status : row[stream] && row[stream].status;
    onStatus(row.date, stream, cur === v ? null : v);
  };
  const editAmount = (stream) => onEditAmount && onEditAmount(row, stream);
  const H = [
    ['saved', 'حفظ', 'bg-emerald-600'],
    ['missed', 'لم يحفظ', 'bg-rose-600'],
    ['absent', 'غائب', 'bg-stone-500'],
  ];
  const R = [
    ['done', 'تم', 'bg-emerald-600'],
    ['missed', 'لم تتم', 'bg-rose-600'],
    ['absent', 'غائب', 'bg-stone-500'],
  ];
  // الكبرى only: «لا يوجد» behaves exactly like «غائب/لم تتم» — the day is
  // marked, its slot is burned, and the ride slides one day (never merged).
  const RM = [...R, ['none', 'لا يوجد', 'bg-slate-500']];
  const dir = row.direction === 'desc' ? -1 : 1;
  return (
    <tr className={DAY_CELL(row)}>
      <td className="font-bold whitespace-nowrap">{weekdayName(row.date)}</td>
      <td className="whitespace-nowrap">
        <div className="text-[13px] font-extrabold text-slate-800">{hj.dm}</div>
        <div className="text-[10px] text-slate-400">{hj.y}</div>
        {row.beyondPlan && <div className="text-[10px] font-bold text-rose-600">يوم إضافي بعد الخطة</div>}
        {row.shiftedBy > 0 && <div className="mt-0.5 rounded bg-amber-100 px-1 text-[9px] font-bold text-amber-800">متأخرة {arNum(row.shiftedBy)} يوم</div>}
      </td>
      <MarkCell
        label="حفظ جديد"
        span={{ gFrom: row.gFrom, gTo: row.gTo }}
        status={row.status}
        amount={row.amountQ}
        style={HIFZ_STYLE}
        deferred="انزاح لليوم التالي بالكامل"
        dueTxt={row.empty ? 'اكتمل المدى — لا جديد' : '—'}
        onPick={(v) => pick('hifz', v)}
        opts={H}
        onEditAmount={() => editAmount('hifz')}
        anchor={row.gFrom != null ? { startG: row.gFrom, limitG: hifzLimit, dir } : null}
        badge={row.rolledToNext > 0 ? <span className="rounded bg-rose-100 px-1.5 text-[10px] font-bold text-rose-700">↩ {amountLabel(row.rolledToNext)} ينزاح لغد — بدون دمج</span> : null}
      />
      <MarkCell
        label="مراجعة صغرى (من حفظ الأمس)"
        span={row.minor ? { gFrom: row.minor.gFrom, gTo: row.minor.gTo } : null}
        status={row.minor && row.minor.status}
        amount={row.minor && row.minor.plannedQ}
        style={REV_STYLE}
        deferred="انزاحت للصباح القادم"
        dueTxt="لا شيء مستحق"
        onPick={(v) => pick('minor', v)}
        opts={R}
        onEditAmount={() => editAmount('minor')}
        anchor={row.minor && row.minor.gFrom != null ? { startG: row.minor.gFrom, limitG: row.minor.limitG != null ? row.minor.limitG : row.minor.gTo, dir } : null}
        badge={
          row.minor && row.minor.plannedQ > 0 && !row.minor.status ? (
            <span className="rounded bg-sky-100 px-1.5 text-[10px] font-bold text-sky-700">
              من حفظ الأمس — تحتاج تعليم «تم»{row.minor.pendingDays > 1 ? ` · متأخرة ${arNum(row.minor.pendingDays)} يوم` : ''}
            </span>
          ) : row.minor && row.minor.pendingDays > 1 && row.minor.status !== 'done' ? (
            <span className="rounded bg-amber-100 px-1.5 text-[10px] font-bold text-amber-800">متأخرة {arNum(row.minor.pendingDays)} يوم</span>
          ) : null
        }
      />
      {student.majorEnabled ? (
        <MarkCell
          label="مراجعة كبرى"
          span={row.major ? { gFrom: row.major.gFrom, gTo: row.major.gTo } : null}
          status={row.major && row.major.status}
          amount={row.major && row.major.plannedQ}
          preview={row.major && row.major.preview}
          style={REV_STYLE}
          deferred="انزاحت لغد — الحفظ لم يتأثر"
          dueTxt="—"
          onPick={(v) => pick('major', v)}
          opts={RM}
          onEditAmount={() => editAmount('major')}
          anchor={row.major && row.major.gFrom != null ? { startG: row.major.gFrom, limitG: 1, dir: -1 } : null}
          badge={row.major && row.major.cycle > 1 ? <span className="rounded bg-violet-100 px-1.5 text-[10px] font-bold text-violet-800">الدورة {arNum(row.major.cycle)}</span> : null}
        />
      ) : null}
    </tr>
  );
}

export default function StudentPlan({ student, settings, onStatus, onClear, onEdit, onAmountOverride }) {
  /** buildPlan audits every range before returning; a failed audit is shown, never hidden */
  const { plan, buildError } = useMemo(() => {
    try {
      return { plan: buildPlan(student, settings), buildError: null };
    } catch (e) {
      return { plan: null, buildError: e };
    }
  }, [student, settings]);

  const [edit, setEdit] = useState(null);
  const [amountEdit, setAmountEdit] = useState(null);
  const [custom, setCustom] = useState({ surah: '114', from: '1', toSurah: '114', to: '6' });
  const [customErr, setCustomErr] = useState('');

  const weeks = useMemo(() => {
    if (!plan) return [];
    const m = [];
    for (const r of plan.rows) {
      const k = weekKey(r.date);
      const last = m[m.length - 1];
      if (last && last.key === k) last.rows.push(r);
      else m.push({ key: k, rows: [r] });
    }
    return m;
  }, [plan]);

  if (!plan) {
    return (
      <section className="card border-2 border-rose-300 p-4" aria-label={`خطة ${student.name}`}>
        <h3 className="text-lg font-extrabold text-rose-800">تعذّر عرض الجدول — لم تُجتَز مراجعة بيانات الآيات</h3>
        <p className="mt-2 text-sm text-rose-700">{buildError && buildError.message}</p>
        <p className="mt-2 text-xs text-slate-500">
          لم يُعرض جدول غير موثوق. راجع <code dir="ltr">data/sources/</code> ونفّذ <code dir="ltr">npm run gen</code> للتأكد من سلامة بيانات القرآن.
        </p>
      </section>
    );
  }

  const { rows, stats, totalQ, savedQ, range } = plan;
  const pct = totalQ > 0 ? Math.min(100, Math.round((savedQ / totalQ) * 100)) : 0;
  const level = LEVELS[student.level] || { label: student.level };
  const cols = student.majorEnabled ? 5 : 4;
  const dirChip = plan.descending
    ? { txt: 'اتجاه الحفظ: تنازلي ↓', cls: 'bg-amber-50 text-amber-800 border border-amber-200' }
    : { txt: 'اتجاه الحفظ: تصاعدي ↑', cls: 'bg-emerald-50 text-emerald-800 border border-emerald-200' };

  /* limits used when the teacher pins a manual amount: whole ayahs only */
  const hifzLimit = plan.dir > 0 ? plan.hiG : plan.loG;

  /** open the amount dialog anchored on a cell's own content */
  const openAmount = (row, stream) => {
    const cell = stream === 'hifz' ? { gFrom: row.gFrom, gTo: row.gTo } : row[stream] || {};
    if (cell.gFrom == null) return; // nothing to anchor on: nothing to pin
    setCustomErr('');
    setAmountEdit({ row, stream, startG: cell.gFrom, limitG: stream === 'major' ? 1 : stream === 'minor' ? (row.minor.limitG ?? cell.gTo) : hifzLimit, dir: stream === 'major' ? -1 : row.direction === 'desc' ? -1 : 1 });
  };

  /** pin a dose for this cell — the range is computed from the verified data */
  const pinDose = (faces) => {
    const { row, stream, startG, limitG, dir } = amountEdit;
    const to = splitDose(startG, limitG, toQ(faces), dir);
    if (to == null) return;
    const a = ayahRef(startG);
    const b = ayahRef(to);
    onAmountOverride(row.date, stream, { s1: a.surah, a1: a.ayah, s2: b.surah, a2: b.ayah });
    setAmountEdit(null);
  };

  /** custom «من آية إلى آية» — validated against the real ayah counts (never clamped) */
  const pinCustom = () => {
    try {
      rangeFromSurahAyah(custom.surah, custom.from, custom.toSurah, custom.to);
      onAmountOverride(amountEdit.row.date, amountEdit.stream, {
        s1: Number(custom.surah),
        a1: Number(custom.from),
        s2: Number(custom.toSurah),
        a2: Number(custom.to),
      });
      setAmountEdit(null);
    } catch (e) {
      setCustomErr(e.message);
    }
  };

  return (
    <section className="card p-4" aria-label={`خطة ${student.name}`}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2 border-b-2 border-slate-200 pb-3">
        <div>
          <h3 className="text-lg font-extrabold text-slate-900">{student.name}</h3>
          <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] font-bold">
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{level.label}</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{student.halaqa}</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600" dir="ltr">☎ {student.phone}</span>
            <span className={'rounded-full px-2 py-0.5 ' + dirChip.cls}>{dirChip.txt}</span>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">
              تدقيق آلي: {arNum(plan.audit.checked)} مدى آيات متحقَّق منه قبل العرض
            </span>
            <span className="rounded-full bg-sky-50 px-2 py-0.5 text-sky-700">صغرى: من طابور حفظ الأمس فقط — أول يوم فارغ</span>
            {student.majorEnabled ? (
              <span className="rounded-full bg-violet-50 px-2 py-0.5 text-violet-700">
                كبرى: {amountLabel(majorBaseQOf(student))} يوميًا — من الناس ← الفاتحة
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
            المدى: <b className="text-slate-800">{range.first.name} — الآية {arNum(range.first.ayah)}</b> ←{' '}
            <b className="text-slate-800">{range.last.name} — الآية {arNum(range.last.ayah)}</b> ={' '}
            <b className="text-slate-800">{arDec(range.faces)}</b> وجهًا · <b className="text-slate-800">{arNum(range.planDays)}</b> يوم دراسة
          </div>
          <button onClick={() => window.print()} className="btn mt-1 border border-slate-300 bg-white text-slate-600 hover:bg-slate-100 no-print">
            🖨 طباعة البطاقة
          </button>
        </div>
      </div>

      {plan.issues.length > 0 && (
        <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
          ملاحظات على البيانات المدخلة: {plan.issues.join(' · ')}
        </div>
      )}

      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Stat label="أيام حُفظت" value={arNum(stats.saved)} cls="border-emerald-200 bg-emerald-50 text-emerald-800" />
        <Stat label="لم يحفظ" value={arNum(stats.missed)} cls="border-rose-200 bg-rose-50 text-rose-700" />
        <Stat label="غياب" value={arNum(stats.absent)} cls="border-stone-300 bg-stone-50 text-stone-600" />
        <Stat label="أيام مجدولة متبقية" value={arNum(stats.pending)} cls="border-sky-200 bg-sky-50 text-sky-800" />
        <Stat label="المحفوظ" value={`${arDec(savedQ / QPP)} / ${arDec(totalQ / QPP)}`} cls="border-slate-300 bg-slate-50 text-slate-700" />
      </div>
      {(stats.minorDone > 0 || stats.minorMissed > 0) && (
        <div className="mb-2 flex flex-wrap gap-2 text-[11px] font-bold text-sky-700">
          <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5">صغرى — تمت: {arNum(stats.minorDone)} · لم تتم: {arNum(stats.minorMissed)}</span>
        </div>
      )}
      {student.majorEnabled && (
        <div className="mb-3 flex flex-wrap gap-2 text-[11px] font-bold text-violet-700">
          <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5">
            كبرى — تمت: {arNum(stats.major.saved)} · لم تتم: {arNum(stats.major.missed)} · غياب: {arNum(stats.major.absent)} · لا يوجد: {arNum(stats.major.none)} · روجع {arDec(stats.major.savedQ / QPP)} وجهًا
          </span>
        </div>
      )}
      <div className="mb-3 h-3 overflow-hidden rounded-full bg-slate-200" title={`${pct}%`}>
        <div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${pct}%` }} />
      </div>

      {plan.shiftedBy > 0 && (
        <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
          بسبب {arNum(plan.shiftedBy)} يوم تأجيل، انزاحت الخطة {arNum(plan.shiftedBy)} يومًا للأمام — لم يُدمج أي مقدار في يوم واحد، ولم تُقفز أي آية: كل يوم يعيد نفس نطاق الآيات غير المحفوظة.
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border-2 border-slate-700">
        <table className="paper-table w-full min-w-[860px] border-collapse bg-white text-sm">
          <thead>
            <tr>
              <th>اليوم</th>
              <th>التاريخ <span className="text-[10px] font-bold text-slate-500">(هجري)</span></th>
              <th>الحفظ <span className="text-[9px] font-bold text-slate-500">(تسجيل مستقل)</span></th>
              <th className="!bg-sky-50">الصغرى <span className="text-[9px] font-bold text-sky-600">(تلقائية من الأمس)</span></th>
              {student.majorEnabled ? <th className="!bg-violet-50">الكبرى <span className="text-[9px] font-bold text-violet-600">(اختيارية)</span></th> : null}
            </tr>
          </thead>
          <tbody>
            {weeks.length === 0 && (
              <tr>
                <td colSpan={cols} className="py-6 text-slate-400">لا توجد أيام في هذه الفترة — عدّل تواريخ البداية/النهاية.</td>
              </tr>
            )}
            {weeks.map((w, wi) => {
              const dayRows = w.rows.filter((r) => r.type === 'day');
              const s = { saved: 0, missed: 0, absent: 0 };
              dayRows.forEach((r) => r.status && s[r.status]++);
              return <FragmentWeek key={w.key} n={wi + 1} w={w} s={s} dayRows={dayRows} onStatus={onStatus} onEditAmount={openAmount} student={student} cols={cols} hifzLimit={hifzLimit} />;
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
        <span>
          كل نطاق في الجدول مجموعة آيات كاملة مرتَّبة: لا يُقسم آية ولا يُكرَّر نطاق ولا يُتجاوز عدد آيات السورة. المصدر: بيانات QCF4 (مصحف المدينة ١٤٤١هـ) + بيانات تنزيل، مُدقَّقة آليًا. «لم يحفظ/غائب/لم تتم/لا يوجد» يبقي يومه معلَّمًا ويؤجّله يومًا كاملًا — الخطة تنزاح ولا تُدمج.
        </span>
        <button onClick={() => confirm('مسح كل حالات الأيام لهذا الطالب؟') && onClear(student.id)} className="btn border border-slate-300 bg-white text-slate-500 hover:bg-slate-100 no-print">
          إعادة تعيين الحالات
        </button>
      </div>

      {amountEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-xl bg-white p-4 shadow-2xl" dir="rtl">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="font-extrabold">تعديل مقدار {amountEdit.stream === 'hifz' ? 'الحفظ' : amountEdit.stream === 'minor' ? 'المراجعة الصغرى' : 'المراجعة الكبرى'}</h4>
              <button onClick={() => setAmountEdit(null)} className="text-xl text-slate-400">×</button>
            </div>
            <p className="mb-2 text-xs text-slate-500">
              يبدأ المقدار من نطاق الخلية الحالي (<b className="text-slate-700">{rangeLabel(amountEdit.startG, amountEdit.startG).head} — الآية {arNum(ayahRef(amountEdit.startG).ayah)}</b>)، ويُبنى على <b>آيات كاملة</b> فقط من نفس المصدر الموثّق؛ والأيام التالية تُعاد جدولتها من نهاية المقدار المثبَّت.
            </p>
            <div className="grid grid-cols-3 gap-2">
              {AMOUNT_OPTS.map((o) => (
                <button key={o.v} onClick={() => pinDose(o.v)} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold hover:bg-emerald-50">
                  {o.label}
                </button>
              ))}
            </div>
            <div className="mt-4 border-t pt-3">
              <div className="mb-2 text-xs font-bold text-slate-500">مخصص من آية إلى آية (يُتحقق من عدد آيات السورة)</div>
              <div className="grid grid-cols-4 gap-2">
                <input value={custom.surah} onChange={(e) => setCustom({ ...custom, surah: e.target.value })} placeholder="سورة (١–١١٤)" className="rounded border p-2 text-sm" inputMode="numeric" />
                <input value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} placeholder="من آية" className="rounded border p-2 text-sm" inputMode="numeric" />
                <input value={custom.toSurah} onChange={(e) => setCustom({ ...custom, toSurah: e.target.value })} placeholder="إلى سورة" className="rounded border p-2 text-sm" inputMode="numeric" />
                <input value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} placeholder="إلى آية" className="rounded border p-2 text-sm" inputMode="numeric" />
              </div>
              <div className="mt-1 text-[11px] text-slate-400">
                أمثلة: الفلق عدد آياتها {arNum(SURAHS[112].count)} · الناس {arNum(SURAHS[113].count)} · النصر {arNum(SURAHS[109].count)} — تُرفض أي آية أكبر من ذلك.
              </div>
              {customErr && <div className="mt-2 rounded border border-rose-300 bg-rose-50 px-2 py-1 text-[12px] font-bold text-rose-700">{customErr}</div>}
              <button onClick={pinCustom} className="mt-2 w-full rounded-lg bg-emerald-600 px-3 py-2 font-bold text-white">تثبيت المقدار المخصص</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function FragmentWeek({ n, w, s, dayRows, student, cols, onStatus, onEditAmount, hifzLimit }) {
  const fr = w.rows[0],
    lr = w.rows[w.rows.length - 1];
  const range = !fr ? '' : fr.date === lr.date ? hijriInfo(fr.date).dm : `${hijriInfo(fr.date).dm} ← ${hijriInfo(lr.date).dm}`;
  return (
    <Fragment>
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
          <DayRow key={r.date} row={r} student={student} onStatus={onStatus} onEditAmount={onEditAmount} hifzLimit={hifzLimit} />
        )
      )}
      <tr className="bg-slate-100 text-[12px] font-extrabold">
        <td colSpan={cols} className="text-right">
          نتيجة الفترة: حفظ <span className="text-emerald-700">{arNum(s.saved)}</span> · لم يحفظ <span className="text-rose-600">{arNum(s.missed)}</span> · غياب <span className="text-stone-600">{arNum(s.absent)}</span> · الأيام: <span className="text-slate-700">{arNum(dayRows.length)}</span>
        </td>
      </tr>
    </Fragment>
  );
}
