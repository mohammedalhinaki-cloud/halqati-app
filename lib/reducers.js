/* Pure state reducers — the single place where the app's data model mutates.
   app/page.jsx wires these into React state; tests drive them directly so the
   persistence layer is tested against the REAL mutation logic. */

export const setSettings = (db, patch) => ({ ...db, settings: { ...db.settings, ...patch } });

export const setActive = (db, id) => ({ ...db, activeId: id });

export const addStudent = (db, st) => ({ ...db, students: [...db.students, st], activeId: st.id });

export const removeStudent = (db, id) => {
  const students = db.students.filter((x) => x.id !== id);
  const activeId = db.activeId === id ? students[0]?.id || null : db.activeId;
  return { ...db, students, activeId };
};

export const editStudent = (db, id, patch) => ({
  ...db,
  students: db.students.map((x) => (x.id === id ? { ...x, ...patch } : x)),
});

/** mark/unmark one stream ('hifz' | 'minor' | 'major') for one day.
    status=null clears the stream; empty day entries are dropped. */
export const setStatus = (db, sid, date, stream, status) => ({
  ...db,
  students: db.students.map((st) => {
    if (st.id !== sid) return st;
    const statuses = { ...st.statuses };
    let cur = statuses[date];
    if (typeof cur === 'string') cur = { hifz: cur }; // migrate legacy shape on write
    cur = { ...(cur || {}) };
    if (status) cur[stream] = status;
    else delete cur[stream];
    if (Object.keys(cur).length === 0) delete statuses[date];
    else statuses[date] = cur;
    return { ...st, statuses };
  }),
});

export const clearStatuses = (db, sid) => ({
  ...db,
  students: db.students.map((st) => (st.id === sid ? { ...st, statuses: {}, overrides: {} } : st)),
});

/** pin a manual amount ({s1,a1,s2,a2} — سورة/آية البداية والنهاية) for one
    day/stream; later generated days (marks + manual edits after that date) are
    invalidated and regenerated from the pin's exact last ayah. */
export const setAmountOverride = (db, sid, date, stream, span) => ({
  ...db,
  students: db.students.map((st) => {
    if (st.id !== sid) return st;
    const overrides = { ...(st.overrides || {}) };
    const statuses = { ...(st.statuses || {}) };
    overrides[date] = { ...(overrides[date] || {}), [stream]: span };
    Object.keys(statuses).forEach((d) => {
      if (d > date) delete statuses[d];
    });
    Object.keys(overrides).forEach((d) => {
      if (d > date) delete overrides[d];
    });
    return { ...st, statuses, overrides };
  }),
});
