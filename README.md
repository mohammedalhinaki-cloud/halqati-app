# بطاقة متابعة الحفظ والمراجعة — Quran Halaqa Tracker

A simple, fast, single-page tracker for Quran memorization halaqas — modeled on the official
Tahfiz-association follow-up cards (بطاقة متابعة الحفظ والمراجعة). RTL Arabic, Tailwind, no backend:
persists in the browser via `localStorage`.

Next.js 14 (App Router) → **static export**, deployed **only** via GitHub Pages (see below).

## Features

- **Dates shown in Hijri (Umm al-Qura, Saudi official calendar)** everywhere — the plan table,
  week bands and holiday rows display e.g. "٩ ربيع الآخر ١٤٤٨هـ"; the settings date inputs stay
  native Gregorian controls with the Hijri equivalent previewed live right under them.
  Working days are fixed **Sunday–Wednesday**;
  holidays are skipped automatically and shown as a dark «إجازة» band like the paper card.
- **Unlimited students** per halaqa, with: name, guardian phone, level
  (ابتدائي / متوسط / ثانوي), halaqa name, daily **hifz** amount
  (¼ / ½ / ¾ / 1 / 1½ face), *sughra* & *kubra* daily review, and a from/to surah
  range (defaults: **Al-Fatiha → An-Nas**, i.e. the full 604-face mushaf).
- **Accurate Madinah-mushaf math:** every amount maps to exact quarter-faces
  (¼ وجه ≈ 4 lines of 15 per page), and every day's span is resolved to **complete ayahs**
  (سورة/آية) from the pinned QCF4 + Tanzil data (see *Data & accuracy notes* below) —
  the day is labelled with the exact ayahs it covers, e.g. «سورة الفلق — الآيات ١ – ٥» or
  «الفلق ← الناس — من الفلق آية ٥ إلى الناس آية ٣».
- **Smart rollover (shift, never merge):** each day has 3 buttons — حفظ | لم يحفظ | غائب.
  Marking *لم يحفظ* or *غائب* keeps that day's own range visible and re-runs the exact same
  ayah range on the next working day; the whole plan slides (even beyond the plan end —
  auto-extended days are flagged). No two ranges are ever merged into one day, and no ayah is
  ever skipped. Minor review slides the same way on *لم تتم / غائب*, and major review on
  *لم تتم / غائب / لا يوجد*.
- **Stats:** saved / not-saved / absent / remaining days counts, faces saved vs. total, progress bar,
  per-week «نتيجة الفترة» summary rows.
- One-click **print** → the table prints clean, like the official card.

## Quick start

```bash
npm install
npm run dev         # http://localhost:3000
npm run build       # static export in ./out
npm run gen         # rebuild the Quran dataset from data/sources/ and run the 19 checks
npm test            # Quran-data checks + planner checks (exact day-by-day ranges)
npm run test:ui     # render smoke test (real React components, exact ranges asserted)
npm run test:all    # everything incl. build, DOM, SQLite and native smoke tests
npm run plan -- --from 110 --to 114 --daily 0.25   # print the exact day-by-day table
```

## Deploy to GitHub Pages (official & only deploy target)

`.github/workflows/deploy.yml` builds the static export and publishes `out/` on every push to
`main`. Two one-time settings on the repo:

1. **Settings → Pages → Source: GitHub Actions**
2. Pages needs a **public repo** (or GitHub Pro). Then the site is at
   `https://<owner>.github.io/halqati-app/` (matches the committed `basePath: '/halqati-app'`).

## Data & accuracy notes (every range is verified before it is shown)

The app never guesses a verse number and never derives one from a language model. All Quran
data is generated from pinned, checksummed sources and cross-checked by automated tests:

- **Sources** (`data/sources/`, each pinned by sha256 in `sources.lock.json`; the build aborts
  on any mismatch):
  - **QCF4 / QPC Hafs** glyph database — King Fahd Complex, Madinah Mushaf 1441H
    (`qcf4-verses.json`, `qcf4-index.json`): page + line of every one of the 6236 ayahs.
  - **Tanzil** metadata, CC-BY (`tanzil-quran-data.xml`): 114 surah names, ayah counts,
    juz/hizb/rub' / page boundaries.
  - **Quran.com API** page anchors (`quran-com-api-anchors.json`): verbatim verse lists for
    pages 1, 2, 49, 50, 502, 582, 604 (page 604 = الإخلاص ١–٤ + الفلق ١–٥ + الناس ١–٦).
  - **Glyph page samples** (`qcf4-pages-sample/`) for 6 pages: per-word verse keys + line
    numbers, used to verify the per-ayah page/line model.
  - `page-model-notes.json` documents (and pins) the only known deviations: 6 stale
    last-page fields in the QCF4 index and 56 ±1-page entries in Tanzil's older print.
- **Build & verification:** `npm run gen` re-reads the sources and runs **19 cross-source
  checks** — Tanzil ⇄ QCF4 both report 114 surahs / 6236 ayahs with identical names, the
  604 pages tile the mushaf, quarter positions are monotonic (0 → 2416 = 604 faces), every
  surah starts on the page the sources agree on, the 7 Quran.com page anchors match, and the
  glyph sample pages agree with the per-ayah table. The report is written to
  `data/quran-verification.json`; outputs are `lib/quran-data.js` + `data/quran.json`
  (single generated source of truth for the whole app).
- **Planning in whole-ayah space:** `lib/quran.js` addresses ayahs exactly
  (`globalAyah(surah, ayah)` throws on `الفلق ٦` / `النصر ٤` / anything out of the mushaf —
  nothing is clamped). A day's range is a run of complete, contiguous ayahs; an ayah is never
  split, a range never exceeds its surah's ayah count, and surah transitions know both the
  last ayah of the surah being left and the first ayah of the one being entered (the label
  says «الفلق ← الناس — من الفلق آية ٥ إلى الناس آية ٣»).
- **The table is audited before display:** `buildPlan` re-checks every range, the slice
  chain (strict order, no gap, no repetition), saved-progress continuity and the review
  streams; if the audit fails it **throws** and the UI shows «تعذّر عرض الجدول» instead of a
  wrong table.
- **Tests:** `npm test` runs `test-quran-data.mjs` (sources → dataset, 114 surahs and their
  real ayah counts, addressing, quarter accounting, day-splitting, labels, legacy-pin
  migration, page anchors, regressions) followed by `test-plan.mjs` (exact day-by-day
  tables, missed/absent slide, minor/major review, manual pins, extension days, the full
  1→114 and 114→1 mushaf coverage, auditor self-tests). `npm run test:all` adds the UI,
  click, SQLite, static-build and native smoke tests.
- **Legacy manual pins** saved by the old quarter-face model are migrated only when the old
  span lines up exactly with one ayah's first/last quarter; ambiguous pins are dropped with a
  visible note asking the teacher to re-pin (never rounded, never guessed).

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
(SQLite compiled to WASM). Seed demo data (2 students memorising the full mushaf
الفاتحة ← الناس, including a missed day that visibly slides) is loaded on first launch in
both backends.

## Layout

```
app/                 layout + page (client app shell)
components/          SettingsCard, AddStudentForm, StudentTabs, StudentPlan
lib/                 quran.js (mushaf math + Arabic labels), plan.js (calendar + rollover),
                     store.js (seed/constants), quran-data.js (generated),
                     reducers.js (pure state mutations), persist.js (storage facade:
                     SQLite on Android / localStorage on web), sqlite-backend.js (schema
                     + state↔rows), native-sqlite.js (Capacitor bridge adapter)
scripts/             build-quran-data.mjs (data pipeline), quran-checks.mjs (the 19
                     checks), test-quran-data.mjs, test-plan.mjs, render-test.mjs,
                     click-none-test.mjs, sqlite-persist.test.mjs, native-e2e.test.mjs
data/                quran.json + quran-verification.json (generated)
data/sources/        pinned Quran sources + sources.lock.json (sha256 of each)
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

Prereqs: [JDK 21](https://adoptium.net) (Capacitor 8 compiles with Java 21) + Android SDK
(easiest: install Android Studio once — it provisions the SDK; or install the
command-line tools via `sdkmanager`). Then:

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
