/* End-to-end click test (jsdom): mounts the REAL app, clicks the new «لا يوجد»
   button in the major-review column, and verifies the stored mark + the
   re-planned UI (slide + stats chip) — no production build needed. */
import { JSDOM, VirtualConsole } from 'jsdom';

const errs = [];
const vc = new VirtualConsole();
vc.on('error', (...a) => errs.push(a.map(String).join(' ')));
vc.on('jsdomError', (e) => errs.push(String(e.message || e)));

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
  virtualConsole: vc,
});
const w = dom.window;
for (const k of ['window', 'document', 'navigator', 'localStorage', 'sessionStorage', 'HTMLElement', 'Element', 'Node', 'CustomEvent', 'MouseEvent', 'getComputedStyle']) {
  try { globalThis[k] = w[k]; } catch {}
}
globalThis.requestAnimationFrame = w.requestAnimationFrame || ((cb) => setTimeout(cb, 0));
globalThis.cancelAnimationFrame = w.cancelAnimationFrame || clearTimeout;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { default: Home } = await import('../.tmp-click-entry.mjs');
const { createElement: h } = await import('react');
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');

const root = createRoot(w.document.getElementById('root'));
await act(async () => { root.render(h(Home)); });

const $ = (sel) => w.document.querySelector(sel);
const $$ = (sel) => [...w.document.querySelectorAll(sel)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let fail = 0;
const ok = (what) => console.log('  ✓', what);
const bad = (what) => { fail = 1; console.error('  ✗', what); };

if (!w.document.body.textContent.includes('الإعدادات العامة')) bad('app did not render settings');
else ok('app booted in jsdom');

/* switch to the student with major review enabled (خالد) */
const tab = $$('button').find((b) => b.textContent.includes('خالد بن سعد القحطاني'));
if (!tab) bad('tab for خالد not found');
else {
  await act(async () => { tab.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); });
  await sleep(30);
  ok('switched to خالد (major review enabled)');
}

const bodyTxt = () => w.document.body.textContent;
if (!bodyTxt().includes('مراجعة كبرى')) bad('major-review column missing');
else ok('major-review column rendered');

/* the new fourth button must exist only in the major column */
const noneBtns = $$('button').filter((b) => b.textContent.trim() === 'لا يوجد');
if (!noneBtns.length) bad('no «لا يوجد» button rendered');
else ok(`«لا يوجد» buttons rendered (${noneBtns.length} day rows)`);

/* click «لا يوجد» on the FIRST plan day (2026-09-20, major unmarked in seed) */
const before = JSON.parse(w.localStorage.getItem('halaqa-tracker-v2'));
const s2 = before.students.find((s) => s.name.includes('خالد'));
if (s2.statuses['2026-09-20']?.major) bad('precondition: 2026-09-20 major should be unmarked');
await act(async () => { noneBtns[0].dispatchEvent(new w.MouseEvent('click', { bubbles: true })); });
await sleep(30);

const after = JSON.parse(w.localStorage.getItem('halaqa-tracker-v2'));
const s2a = after.students.find((s) => s.name.includes('خالد'));
if (s2a.statuses['2026-09-20']?.major === 'none') ok('click stored major:"none" for 2026-09-20');
else bad('status not stored: ' + JSON.stringify(s2a.statuses['2026-09-20']));

/* UI feedback: badge on the marked day + stats chip counts it */
if (bodyTxt().includes('انزاحت لغد')) ok('burned day shows the deferred (slide) badge');
else bad('deferred badge missing after marking «لا يوجد»');
if (/لا يوجد:\s*١/.test(bodyTxt())) ok('stats chip counts «لا يوجد: ١»');
else bad('stats chip does not count the new mark');

/* the slot burned on day 1 must re-run on day 2 (slide, never merge):
   day 2 (2026-09-21) must now point at the الناس span again — its «تم» mark
   from the seed now applies to slot 0 (qHi at the mushaf end). */
const p = await import('../lib/plan.js');
const plan = p.buildPlan(s2a, after.settings);
const d2 = plan.rows.filter((r) => r.type === 'day')[1];
if (d2.major.qHi === 2416) ok('day 2 re-runs slot 0 (الناس) — ride slid one day, nothing merged');
else bad(`day 2 major span wrong: [${d2.major.qLo},${d2.major.qHi}]`);

/* toggling the SAME button again clears the mark */
const noneBtns2 = $$('button').filter((b) => b.textContent.trim() === 'لا يوجد');
await act(async () => { noneBtns2[0].dispatchEvent(new w.MouseEvent('click', { bubbles: true })); });
await sleep(30);
const cleared = JSON.parse(w.localStorage.getItem('halaqa-tracker-v2'));
const s2c = cleared.students.find((s) => s.name.includes('خالد'));
if (!s2c.statuses['2026-09-20']?.major) ok('second click clears the mark (toggle)');
else bad('toggle-off failed: ' + JSON.stringify(s2c.statuses['2026-09-20']));

const realErrs = errs.filter((e) => !/not implemented/i.test(e));
if (realErrs.length) { bad('client-side errors: ' + realErrs.slice(0, 3).join(' | ')); }
console.log(fail ? 'CLICK E2E FAIL' : 'CLICK E2E PASS ✓');
process.exit(fail);
