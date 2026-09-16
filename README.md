# بطاقة متابعة الحفظ والمراجعة — Quran Halaqa Tracker

A simple, fast, single-page tracker for Quran memorization halaqas — modeled on the official
Tahfiz-association follow-up cards (بطاقة متابعة الحفظ والمراجعة). RTL Arabic, Tailwind, no backend:
evethrsists in the browser via `localStorage`.

Next.js 14 (Ajs Router) → **static export**, deployed **only** via GitHub Pages ( Pageel(see bel Features

- **Dates shown in Hijri (Umm al-Qura, Saudi official calendar)** everywhere — plan table, weablbands and holiday rows display e.g. "٩ ربيع الآخر ١٤٤٨هـ"; the settings date inputs are nativeareGregorian controls with the Hijri equivalent previewed live right under them.
  (`YYYY-MM-DD`, comma-separated). Working days are fixed **Sunday–Wednesday**;
  holidays are skipped automatically and shown as a dark «إجازة» band like the paper card.
- **Unlimited students** per halaqa, with: name, guardian phone, level
  (ابتدائي / متوسط / ثانوي), halaqa name, daily **hifz** amount
  (¼ / ½ / ¾ / 1 / 1½ face), *sughra* & *kubra* daily review, and a from/to surah
  range (defaults: **Al-Fatiha → An-Nas**, i.e. the full 604-face mushaf).
- **Accurate Madinah-mushaf math:** every amount maps to exact quarter-faces
  (¼ وجه ≈ 4 lines of 15 per page). Surah/ ayah spans per day are computed from real
  Tanzil/Quran.com pagination data (see *Data* below).
- **Smart rollover:** each day has 3 buttons — حفظ | لم يحفظ | غائب. Marking
  *لم يحفظ* or *غائب* moves that day's full amount (including any inherited carry) to the next
  working day, cascading as needed — even beyond the plan end (auto-extended days are flagged).
- **Stats:** saved / not-saved / absent / remaining days counts, faces saved vs. total, progress bar,
  per-week «نتيجة الفترة» summary rows.
- One-click **print** → the table prints clean, like the official card.

## Quick start

```bash
npm install
npm run dev     # http://localhost:3000
npm run build   # static export in ./out
npm test          # plan-logic checks (10)
npm run test:ui   # render smoke test (real React components)
npm run test:all  # both
```

## Deploy to GitHub Pages (official & only deploy target)

`.github/workflows/deploy.yml` builds the static export and publishes `out/` on every push to
`main`. Two one-time settings on the repo:

1. **Settings → Pages → Source: GitHub Actions**
2. Pages needs a **public repo** (or GitHub Pro). Then the site is at
   `https://<owner>.github.io/halqati-app/` (matches the committed `basePath: '/halqati-app'`).

## Data & accuracy notes

- Verse→page/line layout: **QCF4 database** (King Fahd Complex, Madinah Mushaf 1441H),
  verified at build time against **Quran.com API** pagination for anchors like
  2:1 (p2), 46:1 (p502), 67:1 (p562), 78:1 (p582), 112:1 (p604). Both follow the same
  604-page Madinah numbering.
- Regenerate data after cloning: `npm run gen` (sources kept under `data/`, output
  committed at `lib/quran-data.js`).
- ⚠️ The spec figure "Al-Ahqaf → An-Nas = 88 faces" traces to counting from page 517;
  Al-Ahqaf actually begins on **page 502**. The app therefore computes the truthful
  **102.5 faces** (410 quarter-faces) from real data. Change `from: 46` on a student if
  you want a different range.
- On the official card the daily minima are ٧ أسطر (ibtida'i) / ١١ سطر (mutawassit) /
  وجه كامل (thanawi) — consistent with **1 وجه = 1 full page (15 lines)**, which is the
  unit used here.

## Persistence & privacy

Nothing ever leaves the device — no backend, no Supabase, no cloud:

- **Android app (Capacitor):** every change is written to a real **on-device SQLite
  database** (`halqati-tracker.sqlite` in the app's private storage). Students, hifz /
  minor / major review marks, manual amount pins, settings and the active tab all survive
  app close / reopen / restart, fully offline. The `INTERNET` permission is not even
  granted — the app *cannot* touch the network.
- **Web (GitHub Pages):** the original `localStorage` behavior under the key
  `halaqa-tracker-v2`, unchanged.

One persistence facade (`lib/persist.js`) picks the backend at runtime
(`window.Capacitor.isNativePlatform()`); the SQL schema and state↔rows mapping
(`lib/sqlite-backend.js`) is the exact code the test suite runs against sql.js
(SQLite compiled to WASM). Seed demo data (2 students from Al-Ahqaf, including a missed
day that visibly cascades) is loaded on first launch in both backends.

## Layout

```
app/                 layout + page (client app shell)
components/          SettingsCard, AddStudentForm, StudentTabs, StudentPlan
lib/                 quran.js (mushaf math + Arabic labels), plan.js (calendar + rollover),
                     store.js (seed/constants), quran-data.js (generated),
                     reducers.js (pure state mutations), persist.js (storage facade:
                     SQLite on Android / localStorage on web), sqlite-backend.js (schema
                     + state↔rows), native-sqlite.js (Capacitor bridge adapter)
scripts/             gen-quran.mjs (data pipeline), render-test.mjs, test-plan.mjs,
                     sqlite-persist.test.mjs, native-e2e.test.mjs, gen-android-icons.mjs
data/                raw source JSONs for regeneration
capacitor.config.json  Capacitor config (app id com.halqati.app, webDir out/)
android/             native Android project (Capacitor + SQLite plugin, branded icons)
```

## PWA (installable)

`manifest.webmanifest` + service worker + icons (192/512/maskable/180) ship in `public/` —
Add-to-home-screen works on Android/Chrome and iOS/Safari (share → Add to Home Screen).
All manifest/link URLs are relative, so one build serves correctly under the Pages subpath.
Regenerate icons: `python3 scripts/gen-icons.py`.

## Android App (native APK, 100% offline)

The same app is packaged as a **real Android app** with [Capacitor](https://capacitorjs.com)
(`android/` project in this repo) — it opens as a native app (not a browser tab), has its
own icon/splash, and stores everything in an **on-device SQLite database**
(`@capacitor-community/sqlite`). No INTERNET permission, no cloud, works with airplane
mode on.

### Get the APK without any local setup (recommended)

Push to `main` (or run the workflow manually) — the **`Android APK (debug)`** workflow
builds `app-debug.apk` and uploads it as an artifact:

1. Open the repo → **Actions** → pick a run of *Android APK (debug)*
2. Download the **halqati-android-apk** artifact → unzip → copy `app-debug.apk` to your phone
3. Install it (allow "install unknown apps" for your file manager) and open **حلقتي**

Your data then lives in the app's private storage on the phone — copying the APK to
another phone does NOT copy the data (per-device, by design).

### Build the APK on your PC

Prereqs: [JDK 17](https://adoptium.net) + Android SDK (easiest: install Android Studio
once — it provisions the SDK; or install the command-line tools via `sdkmanager`). Then:

```bash
npm install
npm run android:apk      # = NEXT_BASE='' next build + cap sync android + gradlew assembleDebug
# → android/app/build/outputs/apk/debug/app-debug.apk
```

- `build:android` builds the web bundle at the **root** base path, because the Capacitor
  WebView serves the app from `https://localhost/`; the GitHub Pages build keeps the
  `/halqati-app` sub-path. If you switch between builds, re-run `npm run cap:sync` (or the
  full `android:apk`) so `android/app/src/main/assets/public` matches the right base path.
- Launcher icons + splash are generated from `public/icons/icon-512.png`:
  `npm run icons:android`.
- App id: `com.halqati.app` (change in `capacitor.config.json`, then `npx cap sync android`).
- A **release** APK (Play Store / clean side-load) is the usual Capacitor flow: create a
  keystore, add `signingConfigs` in `android/app/build.gradle`, then
  `./gradlew assembleRelease`. The debug APK above installs fine on any phone with
  "install unknown apps" enabled.

### Persistence tests

```bash
npm run test:sqlite   # real SQLite (WASM): schema + save / close / reopen round-trips
npm run test:native   # boots the REAL built app in jsdom with the Capacitor bridge
                      # simulated: add student → mark hifz/reviews → close → reopen
npm run test:all      # everything (web + native)
```

MIT license.
