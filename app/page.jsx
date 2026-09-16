'use client';
import { useCallback, useEffect, useState } from 'react';
import SettingsCard from '../components/SettingsCard';
import AddStudentForm from '../components/AddStudentForm';
import StudentTabs from '../components/StudentTabs';
import StudentPlan from '../components/StudentPlan';
import { seedState, loadState, saveState } from '../lib/persist';
import * as R from '../lib/reducers';

export default function Home() {
  const [db, setDb] = useState(null);

  useEffect(() => {
    let cancelled = false;
    loadState().then(
      (st) => {
        if (cancelled) return;
        setDb(st);
        if (typeof window !== 'undefined') window.__appBooted = true; // cancel the 3s fallback banner
      },
      () => {
        if (cancelled) return;
        setDb(seedState());
        if (typeof window !== 'undefined') window.__appBooted = true;
      }
    );
    return () => {
      cancelled = true;
    };
  }, []);

  // extra failsafe: if state is somehow still unset after 3s, boot with seed anyway
  useEffect(() => {
    const t = setTimeout(() => {
      setDb((s) => s || seedState());
      if (typeof window !== 'undefined') window.__appBooted = true;
    }, 3000);
    return () => clearTimeout(t);
  }, []);

  // persist every change — SQLite file on Android, localStorage on the web
  useEffect(() => {
    if (!db) return;
    saveState(db);
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

  const setSettings = useCallback((patch) => setDb((s) => R.setSettings(s, patch)), []);
  const addStudent = useCallback((st) => setDb((s) => R.addStudent(s, st)), []);
  const removeStudent = useCallback((id) => setDb((s) => R.removeStudent(s, id)), []);
  const editStudent = useCallback((id, patch) => setDb((s) => R.editStudent(s, id, patch)), []);
  const setStatus = useCallback((sid, date, stream, status) => setDb((s) => R.setStatus(s, sid, date, stream, status)), []);
  const clearStatuses = useCallback((sid) => setDb((s) => R.clearStatuses(s, sid)), []);
  const setAmountOverride = useCallback((sid, date, stream, span) => setDb((s) => R.setAmountOverride(s, sid, date, stream, span)), []);

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
            <StudentTabs students={db.students} activeId={active?.id} onPick={(id) => setDb((s) => R.setActive(s, id))} onRemove={removeStudent} />
            {active && <StudentPlan student={active} settings={db.settings} onStatus={(date, stream, st) => setStatus(active.id, date, stream, st)} onAmountOverride={(date, stream, span) => setAmountOverride(active.id, date, stream, span)} onClear={clearStatuses} />}
          </>
        )}

      </div>
    </main>
  );
}
