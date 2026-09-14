'use client';
import { useCallback, useEffect, useState } from 'react';
import SettingsCard from '../components/SettingsCard';
import AddStudentForm from '../components/AddStudentForm';
import StudentTabs from '../components/StudentTabs';
import StudentPlan from '../components/StudentPlan';
import { STORAGE_KEY, seedState } from '../lib/store';
import { META } from '../lib/quran';

export default function Home() {
  const [db, setDb] = useState(null);

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

  // PWA service worker (scope-relative -> works on Pages subpath and Netlify root)
  useEffect(() => {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
    const reg = () => navigator.serviceWorker.register('./sw.js').catch(() => {});
    if (document.readyState === 'complete') reg();
    else window.addEventListener('load', reg);
    return () => window.removeEventListener('load', reg);
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
    (sid, date, status) =>
      setDb((s) => ({
        ...s,
        students: s.students.map((st) => {
          if (st.id !== sid) return st;
          const statuses = { ...st.statuses };
          if (status) statuses[date] = status;
          else delete statuses[date];
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
            {active && <StudentPlan student={active} settings={db.settings} onStatus={(date, st) => setStatus(active.id, date, st)} onClear={clearStatuses} />}
          </>
        )}

        <footer className="pb-6 text-center text-[11px] leading-5 text-slate-400">
          كل شيء محفوظ محليًا في متصفحك (localStorage) — بدون خادم. حساب الأوجه مبني على ترقيم مصحف المدينة (Tanzil / Quran.com):
          من الأحقاف إلى الناس = ١٠٢٫٥ وجهًا (٥٠٢←٦٠٤).
        </footer>
      </div>
    </main>
  );
}
