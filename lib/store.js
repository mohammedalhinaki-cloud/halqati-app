import { toQ } from './quran';

export const STORAGE_KEY = 'halaqa-tracker-v2'; // v2: demo range now full Quran (الفاتحة←الناس)

export const LEVELS = {
  'ibtida-i': { label: 'ابتدائي', hint: 'الحد الأدنى: ٧ أسطر ≈ ¾ وجه', faces: 0.25 },
  'mutawassit': { label: 'متوسط', hint: 'الحد الأدنى: ١١ سطر ≈ وجه', faces: 0.5 },
  'thanawi': { label: 'ثانوي', hint: 'الحد الأدنى: وجه كامل', faces: 1 },
};

/** demo: two students starting from Al-Ahqaf, first week already marked
 *  (including a missed day that must cascade into the next working day) */
export function seedState() {
  const mk = (id, name, phone, level, halaqa, dailyHifz, statuses) => ({
    id,
    name,
    phone,
    level,
    halaqa,
    dailyHifz,
    from: 1, // الفاتحة
    to: 114, // الناس
    sughra: 0.25,
    kubra: 0.5,
    statuses,
  });
  return {
    settings: {
      startDate: '2026-09-20', // Sunday
      endDate: '2026-11-19', // Thursday
      holidays: '2026-09-23', // يوم الوطني (demo)
    },
    activeId: 's1',
    students: [
      mk('s1', 'أحمد بن محمد العتيبي', '0555123456', 'mutawassit', 'حلقة الفرقان — الصباح', 0.5, {
        '2026-09-20': 'saved',
        '2026-09-21': 'missed', // cascades to 22nd
        '2026-09-22': 'saved',
        '2026-09-24': 'absent', // cascades to 27th
        '2026-09-27': 'saved',
        '2026-09-28': 'saved',
        '2026-10-04': 'missed',
      }),
      mk('s2', 'خالد بن سعد القحطاني', '0544987654', 'ibtida-i', 'حلقة المصحف — المساء', 0.25, {
        '2026-09-20': 'saved',
        '2026-09-21': 'saved',
      }),
    ],
  };
}

export function newStudent(form) {
  return {
    id: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: form.name.trim(),
    phone: form.phone.trim(),
    level: form.level,
    halaqa: form.halaqa.trim() || '—',
    dailyHifz: Number(form.dailyHifz),
    from: Number(form.from),
    to: Number(form.to),
    sughra: Number(form.sughra),
    kubra: Number(form.kubra),
    statuses: {},
  };
}
