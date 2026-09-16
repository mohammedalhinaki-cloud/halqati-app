/* Persistence facade — the only module app/page.jsx talks to.

   Platform strategy:
     • Native (Capacitor Android app): real on-device SQLite file via
       @capacitor-community/sqlite. Data lives in the app's private storage
       and survives close/reopen/restart forever. 100% offline.
     • Web (browser / GitHub Pages): the original localStorage behavior,
       unchanged, so the site and the existing test suite keep working.

   saveState() chains writes so two saves can never interleave
   (each save is a full transactional rewrite of the state).
 */

import { seedState, STORAGE_KEY, LEVELS } from './store.js';
import { initTables, stateToDb, dbToState } from './sqlite-backend.js';
import { openNativeDb, nativeAdapter, DB_NAME } from './native-sqlite.js';

export { STORAGE_KEY };
export { DB_NAME as SQLITE_DB_NAME };
export { seedState, LEVELS };

export function isNativeApp() {
  try {
    return typeof window !== 'undefined' && window.Capacitor && window.Capacitor.isNativePlatform() === true;
  } catch {
    return false;
  }
}

/** localStorage migration: legacy level values -> current 8-level names */
const migrateLevel = (lv) => {
  if (lv === 'ابتدائي' || lv === 'ibtida-i') return 'الأول';
  if (lv === 'mutawassit') return 'متوسط';
  if (lv === 'thanawi') return 'ثانوي';
  return lv;
};
export const migrateDb = (db) =>
  db && Array.isArray(db.students)
    ? { ...db, students: db.students.map((s) => ({ ...s, level: migrateLevel(s.level) })) }
    : db;

const looksValid = (s) => s && s.settings && Array.isArray(s.students);

/** Load the app state. Resolves to a valid state object, never null. */
export async function loadState() {
  if (isNativeApp()) {
    try {
      await openNativeDb();
      await initTables(nativeAdapter);
      const loaded = await dbToState(nativeAdapter);
      if (looksValid(loaded)) return loaded;
      // first launch (or corrupted/empty db): seed the demo data and persist
      // it so the database becomes the single source of truth immediately.
      const seeded = seedState();
      await stateToDb(nativeAdapter, seeded);
      return seeded;
    } catch (e) {
      // SQLite unavailable/corrupt: keep the app usable with the seed.
      if (typeof console !== 'undefined') console.warn('[persist] SQLite load failed, using seed:', e);
      return seedState();
    }
  }
  let loaded = null;
  try {
    loaded = migrateDb(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'));
  } catch {}
  return looksValid(loaded) ? loaded : seedState();
}

let saveChain = Promise.resolve();

/** Persist the whole app state (idempotent, chained, never throws). */
export function saveState(db) {
  const task = async () => {
    if (isNativeApp()) {
      await openNativeDb();
      await stateToDb(nativeAdapter, db);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    }
  };
  const p = saveChain.then(task, task);
  // keep the chain alive even when a save fails (logged, then recoverable)
  saveChain = p.then(
    () => {},
    (e) => {
      if (typeof console !== 'undefined') console.warn('[persist] save failed:', e);
    }
  );
  return p;
}
