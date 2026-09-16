/*
 * Print the exact day-by-day plan the app will show — resolved from the
 * verified Quran data (lib/quran-data.js) through the real planner.
 *
 *   node scripts/print-plan.mjs --from 110 --to 114 --daily 0.25 --days 7
 *   node scripts/print-plan.mjs --all            # every generated row
 *
 * Every line is a complete, contiguous ayah range: no ayah is ever split and no
 * range may exceed its surah's ayah count. Handy to inspect the reported cases
 * (النصر ١–٢ ثم ٣ · الفلق تُختم عند ٥ · الناس بالترتيب) without the UI.
 */
import { buildPlan, weekdayName, hijriInfo } from '../lib/plan.js';
import { rangeLabel, arNum, arDec, QPP } from '../lib/quran.js';

const argv = process.argv.slice(2);
const arg = (name, def) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : def;
};
const flag = (name) => argv.includes('--' + name);

const from = Number(arg('from', 1));
const to = Number(arg('to', 114));
const daily = Number(arg('daily', 0.5));
const major = arg('major', null);
const start = arg('start', '2026-09-20');
const end = arg('end', '2026-12-31');
const holidays = arg('holidays', '');
const limit = flag('all') ? Infinity : Number(arg('rows', 15));

const student = {
  name: arg('name', 'طالب'),
  from,
  to,
  dailyHifz: daily,
  majorEnabled: major != null,
  majorBaseQ: major != null ? Math.round(Number(major) * QPP) : 0,
  statuses: {},
};
const settings = { startDate: start, endDate: end, holidays, ...(flag('holidays') ? {} : {}) };

let plan;
try {
  plan = buildPlan(student, settings);
} catch (e) {
  console.error('PLAN REFUSED (audit):', e.message);
  process.exit(1);
}

console.log(`\nالمدى: سورة ${plan.range.first.name} — الآية ${arNum(plan.range.first.ayah)} ← سورة ${plan.range.last.name} — الآية ${arNum(plan.range.last.ayah)}`);
console.log(`=${arDec(plan.range.faces)} وجهًا · ${arNum(plan.range.planDays)} يوم دراسة (${plan.descending ? 'تنازلي' : 'تصاعدي'})\n`);

let shown = 0;
for (const r of plan.rows) {
  if (r.type === 'holiday') {
    console.log(`${r.date}  ☾ إجازة — ${weekdayName(r.date)} ${hijriInfo(r.date).full}`);
    continue;
  }
  if (shown >= limit) break;
  const hj = hijriInfo(r.date);
  const span = r.gFrom == null ? '—' : `${rangeLabel(r.gFrom, r.gTo).head} | ${rangeLabel(r.gFrom, r.gTo).detail}`;
  const minor = r.minor && r.minor.gFrom != null ? `  [صغرى: ${rangeLabel(r.minor.gFrom, r.minor.gTo).head} ${rangeLabel(r.minor.gFrom, r.minor.gTo).detail}]` : '';
  const maj = r.major && r.major.gFrom != null ? `  [كبرى: ${rangeLabel(r.major.gFrom, r.major.gTo).head} ${rangeLabel(r.major.gFrom, r.major.gTo).detail}]` : r.major && r.major.status ? `  [كبرى: ${r.major.status}]` : '';
  console.log(`${r.date} ${weekdayName(r.date).padEnd(7)} ${hj.dm.padEnd(20)} حفظ: ${span}${r.amountQ ? ` (${arDec(r.amountQ / QPP)} وجه)` : ''}${minor}${maj}`);
  shown++;
}
console.log(`\nراجع المدقق: ${arNum(plan.audit.checked)} مدى · أخطاء: ${arNum(plan.audit.errors.length)}${plan.issues.length ? ' · ملاحظات: ' + plan.issues.join(' · ') : ''}\n`);
