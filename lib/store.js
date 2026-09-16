import { toQ } from './quran';

export const STORAGE_KEY = 'halaqa-tracker-v2'; // v2: demo range now full Quran (الفاتحة←الناس)

export const LEVELS = {
  'الأول': { label: 'الأول', hint: 'الحد الأدنى: ¼ وجه', faces: 0.25 },
  'الثاني': { label: 'الثاني', hint: 'الحد الأدنى: ¼ وجه', faces: 0.25 },
  'الثالث': { label: 'الثالث', hint: 'الحد الأدنى: ¼ وجه', faces: 0.25 },
  'الرابع': { label: 'الرابع', hint: 'الحد الأدنى: ¼ وجه', faces: 0.25 },
  'الخامس': { label: 'الخامس', hint: 'الحد الأدنى: ¼ وجه', faces: 0.25 },
  'السادس': { label: 'السادس', hint: 'الحد الأدنى: ¼ وجه', faces: 0.25 },
  'متوسط': { label: 'متوسط', hint: 'الحد الأدنى: ½ وجه', faces: 0.5 },
  'ثانوي': { label: 'ثانوي', hint: 'الحد الأدنى: وجه كامل', faces: 1 },
};

/** demo: two students starting from Al-Ahqaf, first week already marked
 *  (including a missed day that must cascade into the next working day) */
export function seedState() {
  const mk = (id, name, phone, level, halaqa, dailyHifz, statuses, major) => ({
    id,
    name,
    phone,
    level,
    halaqa,
    dailyHifz,
    from: 1, // الفاتحة
    to: 114, // الناس
    majorEnabled: !!major,
    majorBaseQ: major ? 2 : 0,
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
      mk('s1', 'أحمد بن محمد العتيبي', '0555123456', 'متوسط', 'حلقة الفرقان — الصباح', 0.5, {
        '2026-09-20': { hifz: 'saved' },
        '2026-09-21': { hifz: 'missed' }, // slides everything one day — no merge
        '2026-09-22': { hifz: 'saved' },
        '2026-09-24': { hifz: 'absent' },
        '2026-09-27': { hifz: 'saved' },
        '2026-09-28': { hifz: 'saved' },
        '2026-10-04': { hifz: 'missed' },
      }),
      mk(
        's2',
        'خالد بن سعد القحطاني',
        '0544987654',
        'الأول',
        'حلقة المصحف — المساء',
        0.25,
        {
          '2026-09-20': { hifz: 'saved' },
          '2026-09-21': { hifz: 'saved', major: 'done' },
        },
        true
      ),
    ],
  };
}

export function newStudent(form) {
  return {
    id: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: form.name.trim(),
    phone: form.phone.trim() || '—',
    level: form.level,
    halaqa: form.halaqa.trim() || '—',
    dailyHifz: Number(form.dailyHifz),
    from: Number(form.from),
    to: Number(form.to),
    // minor review = automatic (yesterday's saved hifz) — no config needed
    majorEnabled: !!form.majorEnabled,
    majorBaseQ: form.majorEnabled ? Math.max(1, Math.round(Number(form.majorFaces || 0.5) * 4)) : 0,
    statuses: {},
  };
}
