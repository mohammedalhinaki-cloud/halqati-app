'use client';
import { LEVELS } from '../lib/store';

export default function StudentTabs({ students, activeId, onPick, onRemove }) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="الطلاب">
      {students.map((s) => (
        <div key={s.id} className="flex items-stretch">
          <button
            role="tab"
            aria-selected={s.id === activeId}
            onClick={() => onPick(s.id)}
            className={
              'rounded-r-lg border-2 border-l-0 px-4 py-2 text-sm font-extrabold transition ' +
              (s.id === activeId
                ? 'border-slate-700 bg-slate-800 text-white'
                : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-200')
            }
          >
            {s.name}
            <span className={'ms-2 rounded-full px-2 py-0.5 text-[11px] font-bold ' + (s.id === activeId ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500')}>
              {LEVELS[s.level]?.label || s.level}
            </span>
          </button>
          <button
            onClick={() => {
              if (confirm(`حذف الطالب «${s.name}» وكل بياناته؟`)) onRemove(s.id);
            }}
            title="حذف الطالب"
            className={
              'rounded-l-lg border-2 border-r-0 px-2 text-sm font-bold no-print ' +
              (s.id === activeId ? 'border-slate-700 bg-slate-800 text-rose-200 hover:bg-rose-900' : 'border-slate-300 bg-white text-slate-400 hover:text-rose-600')
            }
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
