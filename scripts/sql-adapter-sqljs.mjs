/* sql.js adapter — runs the EXACT same statements as the native Android
   adapter, on SQLite compiled to WASM (same engine, same SQL dialect).
   File-backed, so "close + reopen" genuinely simulates app restart. */
import fs from 'node:fs';
import initSqlJs from 'sql.js';

const SQL = await initSqlJs();

export function openAdapter(file) {
  let db;
  if (file && fs.existsSync(file) && fs.statSync(file).size > 0) {
    db = new SQL.Database(fs.readFileSync(file));
  } else {
    db = new SQL.Database();
  }
  let closed = false;
  const adapter = {
    file,
    async run(statement, values) {
      if (closed) throw new Error('db closed');
      db.run(statement, values && values.length ? values : undefined);
    },
    async query(statement, values) {
      if (closed) throw new Error('db closed');
      const stmt = db.prepare(statement);
      try {
        if (values && values.length) stmt.bind(values);
        const rows = [];
        while (stmt.step()) rows.push(stmt.getAsObject());
        return rows;
      } finally {
        stmt.free();
      }
    },
    async begin() {
      db.run('BEGIN');
    },
    async commit() {
      db.run('COMMIT');
    },
    async rollback() {
      db.run('ROLLBACK');
    },
    /** flush to disk (native SQLite does this implicitly) */
    persist() {
      fs.writeFileSync(file, Buffer.from(db.export()));
    },
    async close() {
      if (closed) return;
      this.persist();
      db.close();
      closed = true;
    },
  };
  return adapter;
}
