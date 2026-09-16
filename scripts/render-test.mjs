/* Render smoke test: exercises the real React components via react-dom/server
   with the seed demo data — catches crashes & verifies key UI pieces exist. */
import { renderToString } from 'react-dom/server';
import { createElement as h } from 'react';
import StudentPlan from '../components/StudentPlan.jsx';
import SettingsCard from '../components/SettingsCard.jsx';
import AddStudentForm from '../components/AddStudentForm.jsx';
import StudentTabs from '../components/StudentTabs.jsx';
import { seedState } from '../lib/store.js';

const db = seedState();
const s1 = db.students[0]; // has saved/missed/absent demo marks
let html = '';
try {
  html += renderToString(h(SettingsCard, { settings: db.settings, onChange: () => {} }));
  html += renderToString(h(AddStudentForm, { onAdd: () => {} }));
  html += renderToString(h(StudentTabs, { students: db.students, activeId: 's1', onPick: () => {}, onRemove: () => {} }));
  html += renderToString(h(StudentPlan, { student: s1, settings: db.settings, onStatus: () => {}, onClear: () => {} }));
  html += renderToString(h(StudentPlan, { student: db.students[1], settings: db.settings, onStatus: () => {}, onClear: () => {} })); // s2: major review enabled
} catch (e) {
  console.error('RENDER CRASH:', e);
  process.exit(1);
}

const need = [
  'أحمد بن محمد العتيبي', // tab + name
  'لم يحفظ', // status buttons
  'إجازة', // holiday band row
  'ينزاح لغد', // shift badge from missed day cascade (slides, never merges)
  'الفاتحة', // surah label
  'ثلاثة أرباع', // sughra chip (0.75? actually 0.25=ربع) -> check below instead
  'وجه ونصف', // cascaded amount (2 + 2 quarters => وجه? demo: 22nd amt=1.0 وجه ; 27th: 2+2=2 → وجه) — assert loosely below
  'نتيجة الفترة', // per-week result band
  'الأسبوع', // week header
  'نصف وجه', // base amount label
];
let fail = 0;
// react-dom/server inserts <!-- --> markers between text and expressions,
// so assertion strings are checked with those markers stripped out
const plain = html.replace(/<!-- -->/g, '');
for (const t of ["أحمد بن محمد العتيبي","لم يحفظ","إجازة","ينزاح لغد","الأحقاف","نتيجة الفترة","الأسبوع","نصف وجه","ربع وجه","غائب","لا يوجد","كبرى: نصف وجه يوميًا","مقدار الكبرى اليومي","ربيع الآخر","جمادى","(هجري)","١٤٤٨هـ"]) {
  const ok2 = plain.includes(t);
  if (!ok2) { fail++; console.error('MISSING in rendered HTML:', t); } else console.log('  ✓ render contains', JSON.stringify(t));
}
const rowCount = (html.match(/<tr/g) || []).length;
console.log(`  table rows (incl. bands/legend): ${rowCount}`);
if (rowCount < 30) { fail++; console.error('too few rows'); }
process.exit(fail ? 1 : 0);
