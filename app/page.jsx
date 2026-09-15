'use client';
import { useCallback, useEffect, useState } from 'react';
import SettingsCard from '../components/SettingsCard';
import AddStudentForm from '../components/AddStudentForm';
import StudentTabs from '../components/StudentTabs';
import StudentPlan from '../components/StudentPlan';
import { STORAGE_KEY, seedState } from '../lib/store';
import { META, SURAHS } from '../lib/quran';
import { arDec, arNum } from '../lib/quran';
import { formatHijri, todayISO } from '../lib/hijri.js';

const FULL_QURAN_FACES = (SURAHS[SURAHS.length - 1].endQ - SURAHS[0].startQ) / META.quartersPerPage;

export default function Home() {
  const [db, setDb] = useState(null);
  const [todayH, setTodayH] = useState('—');

  useEffect(() => {
    let loaded = null;
    try {
      loaded = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    } catch {}
    setDb(loaded && loaded.settings && Array.isArray(loaded.students) ? loaded : seedState());
    if (typeof window !== 'undefined') window.__appBooted = true; // cancel the 3s fallback banner
  }, []);

  // extra failsafe: if state is somehow still unset after 3s, boot with seed anyway
  useEffect(() => {
    const t = setTimeout(() => {
      setDb((s) => {
        if (!s) {
          try {
            const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
            return raw && raw.settings ? raw : seedState();
          } catch {
            return seedState();
          }
        }
        return s;
      });
      if (typeof window !== 'undefined') window.__appBooted = true;
    }, 3000);
    return () => clearTimeout(t);
  }, []);


  useEffect(() => {
    if (!db) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    } catch {}
  }, [db]);

  // today's Hijri date chip (client-only to avoid build-time hydration mismatch)
  useEffect(() => {
    if (typeof window !== 'undefined') setTodayH(formatHijri(todayISO()));
  }, []);

  // No service worker by design: the deployed sw.js self-destructs (purges
  // caches + unregisters). Here we only sweep away any worker a previous
  // build may have left behind — then the page is plain HTTP-cached, which
  // is correct for content-hashed static exports and cannot go stale.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.getRegistrations().then((rs) => {
      rs.forEach((r) => r.unregister());
    }).catch(() => {});
    if (window.caches && caches.keys) {
      caches.keys().then((ks) => ks.forEach((k) => caches.delete(k))).catch(() => {});
    }
  }, []);

  const setSettings = useCallback((patch) => setDb((s) => ({ ...s, settings: { ...s.settings, ...patch } })), []);
  const addStudent = useCallback((st) => setDb((s) => ({ ...s, students: [...s.students, st], activeId: st.id })), []);
  const removeStudent = useCallback(
    (id) =>
      setDb((s) => {
        const students = s.students.filter((x) => x.id !== id);
        const activeId = s.activeId === id ? students[0]?.id || null : s.activeId;
        return { ...s, students, activeId };
      }),
    []
  );
  const setStatus = useCallback(
    (sid, date, stream, status) =>
      setDb((s) => ({
        ...s,
        students: s.students.map((st) => {
          if (st.id !== sid) return st;
          const statuses = { ...st.statuses };
          let cur = statuses[date];
          if (typeof cur === 'string') cur = { hifz: cur }; // migrate legacy shape on write
          cur = { ...(cur || {}) };
          if (status) cur[stream] = status;
          else delete cur[stream];
          if (Object.keys(cur).length === 0) delete statuses[date];
          else statuses[date] = cur;
          return { ...st, statuses };
        }),
      })),
    []
  );
  const clearStatuses = useCallback(
    (sid) => setDb((s) => ({ ...s, students: s.students.map((st) => (st.id === sid ? { ...st, statuses: {} } : st)) })),
    []
  );

  if (!db) return <div className="p-10 text-center text-slate-400">جارٍ التحميل…</div>;
  const active = db.students.find((x) => x.id === db.activeId) || db.students[0] || null;

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-6xl space-y-4 px-3 py-5 sm:px-6">
        {/* official-looking header band */}
        <header className="card overflow-hidden">
          <div className="grid grid-cols-1 items-center gap-2 bg-slate-800 px-4 py-3 text-white sm:grid-cols-3">
            <div className="text-[11px] leading-5 opacity-90">
              المملكة العربية السعودية
              <br />
              وزارة الموارد البشرية والتنمية الاجتماعية
              <br />
              الجمعية الخيرية لتحفيظ القرآن الكريم — إدارة الشؤون التعليمية
            </div>
            <h1 className="text-center text-xl font-extrabold leading-7 sm:text-2xl">
              بطاقة متابعة الحفظ والمراجعة
              <span className="block text-[13px] font-bold opacity-80">استمارة إلكترونية · الفصل الدراسي الأول ١٤٤٨هـ</span>
              <span className="block text-[11px] font-normal opacity-70">نسخة الموقع <b>{process.env.NEXT_PUBLIC_BUILD}</b> · اليوم: {todayH}</span>
            </h1>
            <div className="text-[11px] leading-5 opacity-90 sm:text-left" dir="ltr">
              Madinah mushaf pagination
              <br />
              {META.pages} pages · {META.totalQuarters} quarter-faces · data: Tanzil/Quran.com (QCF4)
            </div>
          </div>
        </header>

        <SettingsCard settings={db.settings} onChange={setSettings} />
        <AddStudentForm onAdd={addStudent} />

        {db.students.length === 0 ? (
          <div className="card border-dashed p-10 text-center text-slate-400">لا يوجد طلاب بعد — أضف طالبًا من النموذج أعلاه</div>
        ) : (
          <>
            <StudentTabs students={db.students} activeId={active?.id} onPick={(id) => setDb((s) => ({ ...s, activeId: id }))} onRemove={removeStudent} />
            {active && <StudentPlan student={active} settings={db.settings} onStatus={(date, stream, st) => setStatus(active.id, date, stream, st)} onClear={clearStatuses} />}
          </>
        )}

        <footer className="pb-6 text-center text-[11px] leading-5 text-slate-400">
          كل شيء محفوظ محليًا في متصفحك (localStorage) — بدون خادم. حساب الأوجه مبني على ترقيم مصحف المدينة (Tanzil / Quran.com):
          القرآن كاملاً (الفاتحة ← الناس) = <b className="text-slate-500">{arDec(FULL_QURAN_FACES)} وجهًا</b> (من صفحة {arNum(SURAHS[0].page)} إلى صفحة {arNum(META.pages)}).
          المدى لكل طالب قابل للتعديل عند الإضافة — والافتراض حفظ المصحف كاملاً.
        </footer>
      </div>
    </main>
  );
}
