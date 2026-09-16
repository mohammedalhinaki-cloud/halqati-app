/* SQLite persistence backend — pure SQL + state<->rows mapping, written once
   and driven by a tiny adapter interface:

     adapter.run(statement, values?)      single write statement
     adapter.query(statement, values?)    -> rows[] (objects keyed by column)
     adapter.begin() / adapter.commit() / adapter.rollback()

   On Android the adapter is the @capacitor-community/sqlite native bridge
   (real on-device SQLite file). Tests run the exact same statements against
   sql.js (SQLite compiled to WASM) to verify schema + round-trips.

   Data model (app state = { settings, activeId, students[] }):
     meta      key/value — settings JSON, active_id, app_state marker
     students  one row per student (array order kept in sort_order)
     marks     one row per (student, day, stream) — stream: hifz|minor|major
     overrides one row per (student, day, stream) — span stored as JSON {qLo,qHi}
 */

export const SCHEMA_STATEMENTS = [
  'CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
  `CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY,
    sort_order INTEGER NOT NULL,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    level TEXT NOT NULL,
    halaqa TEXT NOT NULL,
    daily_hifz REAL NOT NULL,
    from_surah INTEGER NOT NULL,
    to_surah INTEGER NOT NULL,
    major_enabled INTEGER NOT NULL,
    major_base_q INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS marks (
    student_id TEXT NOT NULL,
    date TEXT NOT NULL,
    stream TEXT NOT NULL,
    value TEXT NOT NULL,
    PRIMARY KEY (student_id, date, stream)
  )`,
  `CREATE TABLE IF NOT EXISTS overrides (
    student_id TEXT NOT NULL,
    date TEXT NOT NULL,
    stream TEXT NOT NULL,
    span TEXT NOT NULL,
    PRIMARY KEY (student_id, date, stream)
  )`,
];

export async function initTables(adapter) {
  for (const s of SCHEMA_STATEMENTS) await adapter.run(s);
}

/** Read the whole app state back out of the DB.
    Returns null for a brand-new, never-initialized database (caller seeds). */
export async function dbToState(adapter) {
  const metaRows = await adapter.query('SELECT key, value FROM meta');
  const meta = {};
  for (const r of metaRows) meta[r.key] = r.value;

  const studentRows = await adapter.query('SELECT * FROM students ORDER BY sort_order ASC, id ASC');
  // Brand-new database (never initialized) -> null; an initialized db with all
  // students deleted is a legitimate state and must NOT be re-seeded.
  if (!('app_state' in meta) && studentRows.length === 0) return null;

  const markRows = await adapter.query('SELECT student_id, date, stream, value FROM marks');
  const markRowsByStudent = {};
  for (const r of markRows) {
    const byDate = (markRowsByStudent[r.student_id] ||= {});
    const day = (byDate[r.date] ||= {});
    day[r.stream] = r.value;
  }

  const overrideRows = await adapter.query('SELECT student_id, date, stream, span FROM overrides');
  const overridesByStudent = {};
  for (const r of overrideRows) {
    const byDate = (overridesByStudent[r.student_id] ||= {});
    const day = (byDate[r.date] ||= {});
    let span = {};
    try {
      span = JSON.parse(r.span);
    } catch {}
    day[r.stream] = span;
  }

  let settings = {};
  try {
    settings = JSON.parse(meta.settings || '{}');
  } catch {}

  return {
    settings,
    activeId: meta.active_id || studentRows[0]?.id || null,
    students: studentRows.map((s) => {
      const out = {
        id: s.id,
        name: s.name,
        phone: s.phone,
        level: s.level,
        halaqa: s.halaqa,
        dailyHifz: s.daily_hifz,
        from: s.from_surah,
        to: s.to_surah,
        majorEnabled: !!s.major_enabled,
        majorBaseQ: s.major_base_q,
        statuses: markRowsByStudent[s.id] || {},
      };
      const ov = overridesByStudent[s.id];
      if (ov && Object.keys(ov).length) out.overrides = ov; // absent == empty for the planner
      return out;
    }),
  };
}

/** Full-state write inside one transaction: wipe + re-insert.
    The app state is tiny (hundreds of rows at most) so a rewrite is both
    simplest and atomic — a crash can never leave a half-written state. */
export async function stateToDb(adapter, state) {
  const students = Array.isArray(state.students) ? state.students : [];
  await adapter.begin();
  try {
    await adapter.run('DELETE FROM students');
    await adapter.run('DELETE FROM marks');
    await adapter.run('DELETE FROM overrides');
    await adapter.run('DELETE FROM meta');

    const insStudent =
      'INSERT INTO students (id, sort_order, name, phone, level, halaqa, daily_hifz, from_surah, to_surah, major_enabled, major_base_q) VALUES (?,?,?,?,?,?,?,?,?,?,?)';
    const insMark = 'INSERT OR REPLACE INTO marks (student_id, date, stream, value) VALUES (?,?,?,?)';
    const insOverride = 'INSERT OR REPLACE INTO overrides (student_id, date, stream, span) VALUES (?,?,?,?)';
    const insMeta = 'INSERT OR REPLACE INTO meta (key, value) VALUES (?,?)';

    for (let i = 0; i < students.length; i++) {
      const s = students[i];
      const sid = String(s.id);
      const marksStmts = [];
      const ovrStmts = [];

      const statuses = s.statuses || {};
      for (const [date, v] of Object.entries(statuses)) {
        if (typeof v === 'string') {
          // legacy flat shape (whole entry = hifz status)
          marksStmts.push([sid, date, 'hifz', v]);
        } else if (v && typeof v === 'object') {
          for (const [stream, val] of Object.entries(v)) {
            if (val != null && val !== '') marksStmts.push([sid, date, stream, String(val)]);
          }
        }
      }

      const overrides = s.overrides || {};
      for (const [date, streams] of Object.entries(overrides)) {
        if (!streams || typeof streams !== 'object') continue;
        for (const [stream, span] of Object.entries(streams)) {
          ovrStmts.push([sid, date, stream, JSON.stringify(span == null ? {} : span)]);
        }
      }

      await adapter.run(insStudent, [
        sid,
        i,
        String(s.name ?? ''),
        String(s.phone ?? ''),
        String(s.level ?? ''),
        String(s.halaqa ?? ''),
        Number(s.dailyHifz) || 0,
        Number.isFinite(Number(s.from)) ? Math.trunc(Number(s.from)) : 1,
        Number.isFinite(Number(s.to)) ? Math.trunc(Number(s.to)) : 114,
        s.majorEnabled ? 1 : 0,
        Number.isFinite(Number(s.majorBaseQ)) ? Math.trunc(Number(s.majorBaseQ)) : 0,
      ]);
      for (const m of marksStmts) await adapter.run(insMark, m);
      for (const o of ovrStmts) await adapter.run(insOverride, o);
    }

    await adapter.run(insMeta, ['settings', JSON.stringify(state.settings || {})]);
    if (state.activeId != null) await adapter.run(insMeta, ['active_id', String(state.activeId)]);
    await adapter.run(insMeta, ['app_state', '1']);

    await adapter.commit();
  } catch (e) {
    try {
      await adapter.rollback();
    } catch {}
    throw e;
  }
}
