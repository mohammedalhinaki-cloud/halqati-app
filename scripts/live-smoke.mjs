/* Boots the ACTUAL LIVE site on github.io in jsdom — same assertions as
   jsdom-smoke but pointed at production, to tell "deploy is broken" from
   "user's browser cache is stale". */
import { JSDOM, VirtualConsole } from 'jsdom';
import { ReadableStream } from 'node:stream/web';

const url = process.argv[2] || 'https://mohammedalhinaki-cloud.github.io/halqati-app/?live=' + Date.now();
const errs = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errs.push('jsdomError: ' + (e.message || e)));
vc.on('error', (...a) => errs.push('console.error: ' + a.map(String).join(' ')));

const dom = await JSDOM.fromURL(url, {
  resources: 'usable',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  virtualConsole: vc,
  beforeParse(window) {
    window.ReadableStream = window.ReadableStream || ReadableStream;
  },
});

await new Promise((r) => setTimeout(r, 8000));

const body = dom.window.document.body.innerHTML;
const booted = !!dom.window.__appBooted;
const realErrs = errs.filter((e) => !/could not parse css|not implemented/i.test(e));

console.log('URL:', url);
console.log('app booted:', booted);
console.log('settings card rendered:', body.includes('الإعدادات العامة'));
console.log('hijri month rendered:', /ربيع/.test(body));
console.log('student form rendered:', body.includes('إضافة طالب'));
if (realErrs.length) console.log('errors:', realErrs.slice(0, 6));
process.exit(!booted || realErrs.length ? 1 : 0);
