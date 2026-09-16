'use client';
import { useCallback, useEffect, useState } from 'react';
import SettingsCard from '../components/SettingsCard';
import AddStudentForm from '../components/AddStudentForm';
import StudentTabs from '../components/StudentTabs';
import StudentPlan from '../components/StudentPlan';
import { STORAGE_KEY, seedState } from '../lib/store';

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
  const editStudent = useCallback(
    (id, patch) => setDb((s) => ({ ...s, students: s.students.map((x) => (x.id === id ? { ...x, ...patch } : x)) })),
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
    (sid) => setDb((s) => ({ ...s, students: s.students.map((st) => (st.id === sid ? { ...st, statuses: {}, overrides: {} } : st)) })),
    []
  );
  const setAmountOverride = useCallback(
    (sid, date, stream, span) => setDb((s) => ({
      ...s,
      students: s.students.map((st) => {
        if (st.id !== sid) return st;
        const overrides = { ...(st.overrides || {}) };
        const statuses = { ...(st.statuses || {}) };
        overrides[date] = { ...(overrides[date] || {}), [stream]: span };
        // Editing a day invalidates every later generated day. Clear marks and
        // manual edits after it; the planner then regenerates them from the
        // original dailyHifz setting.
        Object.keys(statuses).forEach((d) => { if (d > date) delete statuses[d]; });
        Object.keys(overrides).forEach((d) => { if (d > date) delete overrides[d]; });
        return { ...st, statuses, overrides };
      }),
    })),
    []
  );

  if (!db) return <div className="p-10 text-center text-slate-400">جارٍ التحميل…</div>;
  const active = db.students.find((x) => x.id === db.activeId) || db.students[0] || null;

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-6xl space-y-4 px-3 py-5 sm:px-6">
        {/* official-looking header band */}
        <header className="card overflow-hidden">
          <div className="grid grid-cols-1 items-center gap-2 bg-slate-800 px-4 py-3 text-white sm:grid-cols-2">
            <div className="text-[11px] leading-5 opacity-90">
              المملكة العربية السعودية
              <br />
              وزارة الموارد البشرية والتنمية الاجتماعية
              <br />
              الجمعية الخيرية لتحفيظ القرآن الكريم — إدارة الشؤون التعليمية
            </div>
            <h1 className="text-center text-xl font-extrabold leading-7 sm:text-2xl">
              بطاقة متابعة الحفظ والمراجعة
            </h1>
          </div>
        </header>

        <SettingsCard settings={db.settings} onChange={setSettings} />
        <AddStudentForm onAdd={addStudent} />

        {db.students.length === 0 ? (
          <div className="card border-dashed p-10 text-center text-slate-400">لا يوجد طلاب بعد — أضف طالبًا من النموذج أعلاه</div>
        ) : (
          <>
            <StudentTabs students={db.students} activeId={active?.id} onPick={(id) => setDb((s) => ({ ...s, activeId: id }))} onRemove={removeStudent} />
            {active && <StudentPlan student={active} settings={db.settings} onStatus={(date, stream, st) => setStatus(active.id, date, stream, st)} onAmountOverride={(date, stream, span) => setAmountOverride(active.id, date, stream, span)} onClear={clearStatuses} />}
          </>
        )}

      </div>
    </main>
  );
}
