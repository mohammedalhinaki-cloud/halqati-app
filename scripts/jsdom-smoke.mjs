/* Boots the exported build in a DOM (jsdom) served exactly like GitHub Pages
   (site files under /halqati-app/) and asserts the app starts without a
   client-side exception — i.e. reproduces/guards "Application error:
   a client-side exception has occurred". */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

const MIME = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
};

const srv = http.createServer((req, res) => {
  let u = decodeURIComponent(req.url.split('?')[0]);
  if (u.startsWith('/halqati-app')) u = u.slice('/halqati-app'.length) || '/';
  if (u.endsWith('/')) u += 'index.html';
  const f = path.join('out', u);
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

await new Promise((r) => srv.listen(0, r));
const port = srv.address().port;

const errs = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errs.push('jsdomError: ' + (e.message || e)));
vc.on('error', (...a) => errs.push('console.error: ' + a.map(String).join(' ')));

const { ReadableStream } = await import('node:stream/web');
const dom = await JSDOM.fromURL(`http://localhost:${port}/halqati-app/`, {
  resources: 'usable',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  virtualConsole: vc,
  beforeParse(window) {
    // jsdom lacks some globals real browsers (and our Pages users) have
    window.ReadableStream = window.ReadableStream || ReadableStream;
  },
});

await new Promise((r) => setTimeout(r, 6000));

const body = dom.window.document.body.innerHTML;
const booted = !!dom.window.__appBooted;
const realErrs = errs.filter((e) => !/could not parse css|not implemented/i.test(e));

console.log('app booted (window.__appBooted):', booted);
console.log('settings card rendered:', body.includes('الإعدادات العامة'));
console.log('hijri month rendered:', /ربيع/.test(body));
console.log('reload-guard snippet present:', body.includes('halqati-reload-at') || dom.window.document.querySelector('head')?.innerHTML.includes('halqati-reload-at'));
if (realErrs.length) console.log('errors:', realErrs.slice(0, 6));

let fail = 0;
if (!booted) (console.log('FAIL: app did not boot'), (fail = 1));
if (realErrs.length) (console.log('FAIL: client-side errors'), (fail = 1));
console.log(fail ? 'SMOKE FAIL' : 'SMOKE PASS ✓');
srv.close();
process.exit(fail);
