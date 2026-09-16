/* Native "close & reopen" end-to-end test.
   Boots the REAL built app (out/, root base path) in jsdom exactly like the
   Android WebView does: window.Capacitor.isNativePlatform() === true and the
   CapacitorSQLite plugin is present — implemented on top of sql.js (the real
   SQLite engine, WASM) backed by a FILE, so closing the app genuinely means
   the only copy of the data is the SQLite file on disk.

   Scenario (the user's acceptance test):
     1) fresh install        -> seed demo data appears, first launch persists
     2) add a student        -> name/phone/level + major review enabled
     3) mark hifz «حفظ»      -> day 1
        mark major «تم»      -> day 1
        mark minor «تم»      -> day 2 (review of yesterday's save)
     4) CLOSE the app        -> WebView destroyed, only the .sqlite file remains
     5) REOPEN the app       -> student + all marks are back, from the DB
     6) REOPEN again         -> second launch is stable too
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';
import initSqlJs from 'sql.js';
import { dbToState } from '../lib/sqlite-backend.js';
import { openAdapter } from './sql-adapter-sqljs.mjs';

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'out');
const DB_FILE = path.join(ROOT, '.tmp-native-e2e.sqlite');

let fail = 0;
const ok = (what) => console.log('  ✓', what);
const bad = (what) => {
  fail = 1;
  console.error('  ✗', what);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* 1) root-based build must exist (the build:android script writes a marker) */
if (!fs.existsSync(path.join(OUT, 'index.html')) || !fs.existsSync(path.join(OUT, '.native-build'))) {
  console.log('building web assets with root base path (NEXT_BASE=)...');
  const r = spawnSync('npm', ['run', 'build:android'], { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error('build failed');
    process.exit(1);
  }
}

/* static server, same as the Pages deploy: serves out/ at the root */
const MIME = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
};
const srv = http.createServer((req, res) => {
  let u = decodeURIComponent(req.url.split('?')[0]);
  if (u.endsWith('/')) u += 'index.html';
  const f = path.join(OUT, u);
  fs.readFile(f, (e, d) => {
    if (e) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    res.end(d);
  });
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const port = srv.address().port;

/* Capacitor SQLite plugin shim — same bridge surface the Android plugin
   exposes (createConnection/open/close/run/query/transactions), backed by
   sql.js on a real file. */
const SQL = await initSqlJs();
function makeShim(file) {
  let db = null;
  const ensure = () => {
    if (db) return db;
    db = fs.existsSync(file) && fs.statSync(file).size > 0 ? new SQL.Database(fs.readFileSync(file)) : new SQL.Database();
    return db;
  };
  const flush = () => {
    if (db) fs.writeFileSync(file, Buffer.from(db.export()));
  };
  return {
    _flush: flush,
    createConnection: async () => {},
    open: async () => ensure(),
    close: async () => {
      flush();
      if (db) db.close();
      db = null;
    },
    isDBOpen: async () => ({ value: !!db }),
    beginTransaction: async () => ensure().run('BEGIN'),
    commitTransaction: async () => ensure().run('COMMIT'),
    rollbackTransaction: async () => ensure().run('ROLLBACK'),
    run: async ({ statement, values }) => {
      ensure().run(statement, values && values.length ? values : []);
      return { changes: { changes: 1 } };
    },
    query: async ({ statement, values }) => {
      const st = ensure().prepare(statement);
      try {
        if (values && values.length) st.bind(values);
        const rows = [];
        while (st.step()) rows.push(st.getAsObject());
        return { values: rows };
      } finally {
        st.free();
      }
    },
  };
}

async function bootApp(shim) {
  const errs = [];
  const vc = new VirtualConsole();
  vc.on('error', (...a) => errs.push(a.map(String).join(' ')));
  vc.on('jsdomError', (e) => errs.push(String(e.message || e)));
  const { ReadableStream } = await import('node:stream/web');
  const dom = await JSDOM.fromURL(`http://127.0.0.1:${port}/`, {
    resources: 'usable',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) {
      window.ReadableStream = window.ReadableStream || ReadableStream;
      // what the Capacitor Android WebView injects:
      window.Capacitor = {
        isNativePlatform: () => true,
        getPlatform: () => 'android',
        isPluginAvailable: (n) => n === 'CapacitorSQLite',
      };
      window.Capacitor.Plugins = { CapacitorSQLite: shim };
    },
  });
  const t0 = Date.now();
  while (!dom.window.__appBooted && Date.now() - t0 < 25000) await sleep(200);
  await sleep(500); // let the plan render settle
  return { dom, errs };
}

fs.rmSync(DB_FILE, { force: true });

/* ================= session 1: fresh install + user actions ================= */
console.log('— session 1: fresh install —');
const shim1 = makeShim(DB_FILE);
const { dom: d1, errs: e1 } = await bootApp(shim1);
const w = d1.window;
const doc = w.document;
const $all = (sel) => [...doc.querySelectorAll(sel)];
const body = () => doc.body.textContent;
const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const setInput = (el, value) => {
  const proto = el.tagName === 'SELECT' ? w.HTMLSelectElement.prototype : w.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  el.dispatchEvent(new w.Event('input', { bubbles: true }));
  el.dispatchEvent(new w.Event('change', { bubbles: true }));
};

if (body().includes('أحمد بن محمد العتيبي')) ok('seed demo students rendered on first launch');
else bad('seed students missing on first launch');

/* first launch must have persisted the seed into SQLite (the file on disk) */
shim1._flush();
{
  const a = openAdapter(DB_FILE);
  const st = await dbToState(a);
  a.close();
  st && st.students.length === 2 ? ok('first launch persisted seed into the SQLite file (2 students)') : bad('seed not persisted to file');
}

console.log('— adding a student (form) —');
const inputs = $all('input');
const nameInput = inputs.find((i) => i.placeholder === 'الاسم الكامل');
const phoneInput = inputs.find((i) => i.placeholder && i.placeholder.includes('05'));
const majorCheckbox = inputs.find((i) => i.type === 'checkbox');
if (!nameInput || !phoneInput || !majorCheckbox) bad('form fields not found');
else {
  setInput(nameInput, 'معاذ بن جبل التميمي');
  setInput(phoneInput, '0555000111');
  click(majorCheckbox); // enable major review
  await sleep(50);
  const submit = $all('button').find((b) => b.textContent.includes('إضافة الطالب'));
  click(submit);
  await sleep(400);
  body().includes('معاذ بن جبل التميمي') ? ok('student added and its tab is active') : bad('student not added');
}

console.log('— marking: hifz day1, major day1, minor day2 —');
{
  const hifzCell = $all('td').find((td) => td.textContent.includes('حفظ جديد'));
  const hifzBtn = hifzCell && [...hifzCell.querySelectorAll('button')].find((b) => b.textContent.trim() === 'حفظ');
  hifzBtn ? (click(hifzBtn), await sleep(300), ok('«حفظ» marked on day 1')) : bad('hifz button not found');

  const majorCell = $all('td').find((td) => td.textContent.includes('مراجعة كبرى'));
  const majorBtn = majorCell && [...majorCell.querySelectorAll('button')].find((b) => b.textContent.trim() === 'تم');
  majorBtn ? (click(majorBtn), await sleep(300), ok('«تم» marked on day 1 (major review)')) : bad('major «تم» button not found');

  const minorCells = $all('td').filter((td) => td.textContent.includes('مراجعة صغرى'));
  const minorBtn = minorCells[1] && [...minorCells[1].querySelectorAll('button')].find((b) => b.textContent.trim() === 'تم');
  minorBtn ? (click(minorBtn), await sleep(300), ok('«تم» marked on day 2 (minor review)')) : bad('minor «تم» button not found');
}

/* the UI should already reflect the marks */
body().includes('كبرى — تمت: ١') ? ok('stats chip counts the major review') : bad('major stats chip missing');

/* flush: everything the app saved is now in the file — the ONLY copy */
shim1._flush();
{
  const a = openAdapter(DB_FILE);
  const st = await dbToState(a);
  a.close();
  const me = st && st.students.find((s) => s.name === 'معاذ بن جبل التميمي');
  if (!me) bad('new student not found in the on-disk database');
  else {
    const d1m = me.statuses['2026-09-20'];
    d1m && d1m.hifz === 'saved' && d1m.major === 'done' ? ok('on disk: day1 hifz=saved + major=done') : bad(`on-disk day1 wrong: ${JSON.stringify(d1m)}`);
    me.statuses['2026-09-21']?.minor === 'done' ? ok('on disk: day2 minor=done') : bad(`on-disk day2 wrong: ${JSON.stringify(me.statuses['2026-09-21'])}`);
    me.majorEnabled === true ? ok('on disk: major review enabled flag intact') : bad('majorEnabled lost');
  }
}

/* ================= session 2: CLOSE the app, then REOPEN ================= */
console.log('— closing the app (WebView destroyed) —');
await shim1.close();
d1.window.close();
await sleep(100);

console.log('— session 2: reopen from the SQLite file —');
const shim2 = makeShim(DB_FILE); // fresh process, same file
const { dom: d2, errs: e2 } = await bootApp(shim2);
const body2 = d2.window.document.body.textContent;
const tabs2 = [...d2.window.document.querySelectorAll('button')].map((b) => b.textContent);

tabs2.some((t) => t.includes('معاذ بن جبل التميمي')) ? ok('student tab survived close+reopen') : bad('student tab missing after reopen');
body2.includes('كبرى — تمت: ١') ? ok('major-review mark survived close+reopen (stats)') : bad('major mark lost after reopen');
/صغرى — تمت: ١/.test(body2) ? ok('minor-review mark survived close+reopen (stats)') : bad('minor mark lost after reopen');
body2.includes('أحمد بن محمد العتيبي') ? ok('seed student still present') : bad('seed student lost');
shim2._flush();
await shim2.close();
d2.window.close();

/* ================= session 3: reopen a second time (stability) ================= */
console.log('— session 3: reopen again —');
const shim3 = makeShim(DB_FILE);
const { dom: d3, errs: e3 } = await bootApp(shim3);
const body3 = d3.window.document.body.textContent;
body3.includes('معاذ بن جبل التميمي') && body3.includes('كبرى — تمت: ١')
  ? ok('second reopen: data still intact')
  : bad('data lost on second reopen');
await shim3.close();
d3.window.close();

/* client-side errors? */
const realErrs = [...e1, ...e2, ...e3].filter((e) => !/not implemented|could not parse css/i.test(e));
if (realErrs.length) bad('client-side errors: ' + realErrs.slice(0, 3).join(' | '));
else ok('no client-side errors across 3 launches');

fs.rmSync(DB_FILE, { force: true });
srv.close();
console.log(fail ? '\nNATIVE E2E FAIL' : '\nNATIVE E2E PASS ✓ — data survives close & reopen');
process.exit(fail);
