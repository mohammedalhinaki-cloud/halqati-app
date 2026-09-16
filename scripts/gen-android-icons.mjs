/* Regenerate the Android launcher icons from public/icons/icon-512.png.
   Run: node scripts/gen-android-icons.mjs
   Sizes follow the Capacitor 8 Android template:
     ic_launcher(_round).png : 48 / 72 / 96 / 144 / 192  (mdpi..xxxhdpi)
     ic_launcher_foreground  : 108 / 162 / 216 / 324 / 432 (adaptive, 66% safe zone)
 */
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const sharp = require('sharp');

const ROOT = new URL('..', import.meta.url).pathname;
const SRC = path.join(ROOT, 'public/icons/icon-512.png');
const RES = path.join(ROOT, 'android/app/src/main/res');

const launcherSizes = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192,
};
const foregroundSizes = {
  'mipmap-mdpi': 108,
  'mipmap-hdpi': 162,
  'mipmap-xhdpi': 216,
  'mipmap-xxhdpi': 324,
  'mipmap-xxxhdpi': 432,
};

const jobs = [];
for (const [dir, size] of Object.entries(launcherSizes)) {
  for (const name of ['ic_launcher.png', 'ic_launcher_round.png']) {
    jobs.push([
      sharp(SRC).resize(size, size, { fit: 'cover' }).png(),
      path.join(RES, dir, name),
    ]);
  }
}
// adaptive foreground: icon shrunk to the 66% safe zone, centered on a transparent canvas
for (const [dir, size] of Object.entries(foregroundSizes)) {
  const icon = Math.round(size * 0.66);
  const pad = size - icon;
  const top = Math.floor(pad / 2);
  const left = Math.floor(pad / 2);
  jobs.push([
    sharp(SRC)
      .resize(icon, icon, { fit: 'cover' })
      .extend({
        top,
        bottom: pad - top,
        left,
        right: pad - left,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png(),
    path.join(RES, dir, 'ic_launcher_foreground.png'),
  ]);
}

/* Splash screens: solid brand background (#065F46) with the icon centered,
   one file per orientation/density, matching the template's splash.png sizes. */
const splashSizes = {
  'drawable-port-mdpi': [320, 480],
  'drawable-port-hdpi': [480, 800],
  'drawable-port-xhdpi': [720, 1280],
  'drawable-port-xxhdpi': [960, 1600],
  'drawable-port-xxxhdpi': [1280, 1920],
  'drawable-land-mdpi': [480, 320],
  'drawable-land-hdpi': [800, 480],
  'drawable-land-xhdpi': [1280, 720],
  'drawable-land-xxhdpi': [1600, 960],
  'drawable-land-xxxhdpi': [1920, 1280],
  'drawable': [480, 320],
};
const splashJobs = [];
for (const [dir, [w, h]] of Object.entries(splashSizes)) {
  splashJobs.push({ dir, w, h, iconSize: Math.round(Math.min(w, h) * 0.38) });
}
const iconBufs = {};
for (const size of [...new Set(splashJobs.map((j) => j.iconSize))]) {
  iconBufs[size] = await sharp(SRC).resize(size, size, { fit: 'cover' }).png().toBuffer();
}
for (const { w, h, iconSize, dir } of splashJobs) {
  const left = Math.floor((w - iconSize) / 2);
  const top = Math.floor((h - iconSize) / 2);
  await sharp({ create: { width: w, height: h, channels: 3, background: '#065F46' } })
    .composite([{ input: iconBufs[iconSize], left, top }])
    .png()
    .toFile(path.join(RES, dir, 'splash.png'));
}

for (const [img, dest] of jobs) {
  await img.toFile(dest);
  console.log('wrote', path.relative(ROOT, dest));
}
console.log('android icons generated ✓');
