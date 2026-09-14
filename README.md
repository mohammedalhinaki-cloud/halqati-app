# بطاقة متابعة الحفظ والمراجعة — Quran Halaqa Tracker

A simple, fast, single-page tracker for Quran memorization halaqas — modeled on the official
Tahfiz-association follow-up cards (بطاقة متابعة الحفظ والمراجعة). RTL Arabic, Tailwind, no backend:
everything persists in the browser via `localStorage`.

Next.js 14 (App Router) → **static export**, one-click deployable on Netlify.

## Features

- **General settings (editable anytime):** start date, end date, holidays
  (`YYYY-MM-DD`, comma-separated). Working days are fixed **Sunday–Wednesday**;
  holidays are skipped automatically and shown as a dark «إجازة» band like the paper card.
- **Unlimited students** per halaqa, with: name, guardian phone, level
  (ابتدائي / متوسط / ثانوي), halaqa name, daily **hifz** amount
  (¼ / ½ / ¾ / 1 / 1½ face), *sughra* & *kubra* daily review, and a from/to surah
  range (defaults: **Al-Ahqaf → An-Nas**).
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

## Deploy to Netlify

`netlify.toml` is included (build `npm run build`, publish `out`):

1. Push this repo to GitHub.
2. Netlify → *Add new site → Import an existing project* → pick the repo.
3. Nothing else to configure — the site is fully static.

Drag-and-drop `./out` on Netlify also works.

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

All data lives in `localStorage` under the key `halaqa-tracker-v1` — nothing leaves the browser.
Seed demo data (2 students from Al-Ahqaf, including a missed day that visibly cascades) is
loaded on first visit.

## Layout

```
app/                 layout + page (client app shell)
components/          SettingsCard, AddStudentForm, StudentTabs, StudentPlan
lib/                 quran.js (mushaf math + Arabic labels), plan.js (calendar + rollover),
                     store.js (seed/constants), quran-data.js (generated)
scripts/             gen-quran.mjs (data pipeline), render-test.mjs, test-plan.mjs
data/                raw source JSONs for regeneration
```

MIT license.
