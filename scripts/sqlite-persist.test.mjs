/* Persistence layer tests — run the app's REAL reducers + REAL SQL against
   a file-backed SQLite database (sql.js = SQLite engine compiled to WASM,
   same SQL dialect the Android plugin executes).

   Simulates the exact lifecycle the user cares about:
     add student -> mark hifz/review -> SAVE -> CLOSE app -> REOPEN -> data intact
 */
import fs from 'node:fs';
import assert from 'node:assert';
import { initTables, stateToDb, dbToState } from '../lib/sqlite-backend.js';
import { seedState, newStudent } from '../lib/store.js';
import * as R from '../lib/reducers.js';
import { openAdapter } from './sql-adapter-sqljs.mjs';

const DB_FILE = '.tmp-sqlite-test.sqlite';
fs.rmSync(DB_FILE, { force: true });

let fail = 0;
const ok = (what) => console.log('  ✓', what);
const bad = (what) => {
  fail = 1;
  console.error('  ✗', what);
};

/* deep equality with app semantics: empty {statuses,overrides} maps === absent */
function norm(v) {
  if (Array.isArray(v)) return v.map(norm);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v).sort()) {
      const val = v[k];
      if (val === undefined) continue;
      if ((k === 'statuses' || k === 'overrides') && typeof val === 'object' && !Array.isArray(val) && Object.keys(val).length === 0) continue;
      o[k] = norm(val);
    }
    return o;
  }
  return v;
}
const same = (a, b) => JSON.stringify(norm(a)) === JSON.stringify(norm(b));
const show = (s) => JSON.stringify(s).slice(0, 400);

console.log('— 1) fresh database reads as "uninitialized" —');
{
  const a = openAdapter(DB_FILE);
  await initTables(a);
  const st = await dbToState(a);
  st === null ? ok('new db -> null (first launch will seed)') : bad('new db should be null');
  await a.close();
}

console.log('— 2) seed state survives close + reopen —');
{
  const seed = seedState();
  const a = openAdapter(DB_FILE);
  await initTables(a);
  await stateToDb(a, seed);
  await a.close(); // «close the app»

  const b = openAdapter(DB_FILE); // «reopen the app»
  const st = await dbToState(b);
  same(st, seed) ? ok('seed round-trips identically (2 students, marks, settings)') : bad(`round-trip mismatch:\n  in : ${show(seed)}\n  out: ${show(st)}`);
  await b.close();
}

console.log('— 3) real user flow: add student + hifz/minor/major marks + manual amount —');
{
  const a = openAdapter(DB_FILE);
  let st = await dbToState(a);

  // add a student (exactly what AddStudentForm -> onAdd does)
  const form = {
    name: 'معاذ بن جبل التميمي',
    phone: '0555000111',
    level: 'متوسط',
    halaqa: 'حلقة الفجر — الصباح',
    dailyHifz: 0.5,
    from: 1,
    to: 114,
    majorEnabled: true,
    majorFaces: 0.5,
  };
  const st0 = R.addStudent(st, newStudent(form));
  const sid = st0.students[st0.students.length - 1].id;

  // mark: hifz saved, minor review done, major review done on day 1;
  //       hifz missed on day 2 (cascade trigger); major absent day 3
  let s1 = R.setStatus(st0, sid, '2026-09-20', 'hifz', 'saved');
  s1 = R.setStatus(s1, sid, '2026-09-20', 'minor', 'done');
  s1 = R.setStatus(s1, sid, '2026-09-20', 'major', 'done');
  s1 = R.setStatus(s1, sid, '2026-09-21', 'hifz', 'missed');
  s1 = R.setStatus(s1, sid, '2026-09-22', 'major', 'absent');
  // manual amount pin (exact ayah range: الفلق ١ → الناس ٣)
  s1 = R.setAmountOverride(s1, sid, '2026-09-24', 'hifz', { s1: 113, a1: 1, s2: 114, a2: 3 });
  // change a global setting too
  s1 = R.setSettings(s1, { endDate: '2026-12-16' });
  // switch active student
  s1 = R.setActive(s1, sid);

  await stateToDb(a, s1);
  await a.close(); // «close the app»

  const b = openAdapter(DB_FILE); // «reopen the app»
  const st2 = await dbToState(b);
  same(st2, s1) ? ok('all marks/overrides/settings survive close+reopen') : bad(`mismatch:\n  in : ${show(s1)}\n  out: ${show(st2)}`);

  const me = st2.students.find((x) => x.id === sid);
  me && me.statuses['2026-09-20']?.hifz === 'saved' && me.statuses['2026-09-20']?.minor === 'done' && me.statuses['2026-09-20']?.major === 'done'
    ? ok('day-1 triple mark intact (hifz+minor+major)')
    : bad(`day-1 marks wrong: ${JSON.stringify(me && me.statuses['2026-09-20'])}`);
  me && me.statuses['2026-09-21']?.hifz === 'missed' ? ok('day-2 «لم يحفظ» intact') : bad('day-2 hifz mark lost');
  me && me.overrides?.['2026-09-24']?.hifz?.s1 === 113 && me.overrides['2026-09-24'].hifz.a1 === 1 && me.overrides['2026-09-24'].hifz.s2 === 114 && me.overrides['2026-09-24'].hifz.a2 === 3
    ? ok('manual amount pin intact {s1:113,a1:1,s2:114,a2:3}')
    : bad(`override wrong: ${JSON.stringify(me && me.overrides)}`);
  st2.settings.endDate === '2026-12-16' ? ok('settings change intact') : bad('settings lost');
  st2.activeId === sid ? ok('active student intact') : bad('activeId lost');
  st2.students.length === 3 ? ok('student count = 3 (2 seed + 1 new)') : bad(`student count ${st2.students.length}`);
  await b.close();
}

console.log('— 4) deleting every student stays empty (no re-seed on next launch) —');
{
  const a = openAdapter(DB_FILE);
  let st = await dbToState(a);
  for (const s of [...st.students]) st = R.removeStudent(st, s.id);
  await stateToDb(a, st);
  await a.close();

  const b = openAdapter(DB_FILE);
  const st2 = await dbToState(b);
  st2 && st2.students.length === 0 ? ok('empty student list survives (no demo data resurrection)') : bad(`expected 0 students, got ${st2 && st2.students.length}`);
  await b.close();
}

console.log('— 5) legacy flat status string migrates to {hifz} —');
{
  const a = openAdapter(DB_FILE);
  const st = { settings: { startDate: '2026-09-20', endDate: '2026-11-19', holidays: '' }, activeId: 'x1', students: [
    { id: 'x1', name: 'legacy', phone: '—', level: 'الأول', halaqa: '—', dailyHifz: 0.25, from: 1, to: 114, majorEnabled: false, majorBaseQ: 0, statuses: { '2026-09-20': 'saved' } },
  ] };
  await stateToDb(a, st);
  await a.close();
  const b = openAdapter(DB_FILE);
  const st2 = await dbToState(b);
  st2.students[0].statuses['2026-09-20']?.hifz === 'saved' ? ok('legacy "saved" -> {hifz:"saved"}') : bad(`legacy wrong: ${JSON.stringify(st2.students[0].statuses)}`);
  await b.close();
}

console.log('— 6) rapid successive saves never interleave (chained writes) —');
{
  const a = openAdapter(DB_FILE);
  let st = await dbToState(a);
  for (const s of [...st.students]) st = R.removeStudent(st, s.id); // clean slate (test 5 residue)
  st = R.addStudent(st, newStudent({ name: 'سريع 1', phone: '0555111222', level: 'ثانوي', halaqa: '', dailyHifz: 1, from: 1, to: 114, majorEnabled: false, majorFaces: 0.5 }));
  st = R.addStudent(st, newStudent({ name: 'سريع 2', phone: '0555333444', level: 'الأول', halaqa: '', dailyHifz: 0.25, from: 1, to: 114, majorEnabled: false, majorFaces: 0.5 }));
  // two overlapping full rewrites (as the chained saveState would serialize them)
  await stateToDb(a, st);
  await stateToDb(a, st);
  await a.close();
  const b = openAdapter(DB_FILE);
  const st2 = await dbToState(b);
  st2.students.length === 2 && st2.students[1].name === 'سريع 2' ? ok('back-to-back writes land in order') : bad(`order lost: ${JSON.stringify(st2.students.map((s) => s.name))}`);
  await b.close();
}

fs.rmSync(DB_FILE, { force: true });
console.log(fail ? '\nPERSISTENCE TEST FAIL' : '\nPERSISTENCE TESTS PASS ✓');
process.exit(fail);
