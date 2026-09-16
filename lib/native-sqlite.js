/* Native (Android) SQLite adapter — thin wrapper over the
   @capacitor-community/sqlite bridge plugin.

   The plugin instance is read from window.Capacitor.Plugins at call time:
   inside the Capacitor WebView the Android bridge registers it under the
   name 'CapacitorSQLite'. In a plain browser the plugin is absent and the
   persist layer never takes this path (it falls back to localStorage).
 */

export const DB_NAME = 'halqati-tracker.sqlite';

function plugin() {
  const P = typeof window !== 'undefined' && window.Capacitor && window.Capacitor.Plugins
    ? window.Capacitor.Plugins.CapacitorSQLite
    : null;
  if (!P) throw new Error('CapacitorSQLite plugin is not available on this platform');
  return P;
}

let opened = false;

/** Canonical v8 bridge sequence: create the connection, then open the file.
    Safe to re-run (createConnection is idempotent, open re-opens if needed). */
export async function openNativeDb() {
  if (opened) return;
  const P = plugin();
  await P.createConnection({ database: DB_NAME });
  await P.open({ database: DB_NAME });
  opened = true;
}

export const nativeAdapter = {
  async run(statement, values) {
    await plugin().run({
      database: DB_NAME,
      statement,
      values: values && values.length ? values : undefined,
      // statements are grouped by our own explicit BEGIN/COMMIT
      transaction: false,
    });
  },
  async query(statement, values) {
    const r = await plugin().query({
      database: DB_NAME,
      statement,
      values: values && values.length ? values : undefined,
    });
    return Array.isArray(r && r.values) ? r.values : [];
  },
  async begin() {
    await plugin().beginTransaction({ database: DB_NAME, transaction: false });
  },
  async commit() {
    await plugin().commitTransaction({ database: DB_NAME, transaction: false });
  },
  async rollback() {
    await plugin().rollbackTransaction({ database: DB_NAME, transaction: false });
  },
  async close() {
    try {
      await plugin().close({ database: DB_NAME });
    } catch {}
    opened = false;
  },
};
