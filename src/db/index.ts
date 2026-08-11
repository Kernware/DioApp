import * as SQLite from 'expo-sqlite';

const DATABASE_NAME = 'dio-field.db';

const MIGRATIONS = [
  `
  CREATE TABLE houses (
    id TEXT PRIMARY KEY NOT NULL,
    group_id INTEGER NOT NULL,
    shift_id INTEGER NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    street TEXT NOT NULL,
    house_number TEXT,
    postal_code TEXT,
    city TEXT,
    contact_name TEXT,
    note TEXT,
    latitude REAL,
    longitude REAL,
    status TEXT NOT NULL DEFAULT 'open',
    status_dirty INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX ix_houses_tour ON houses (group_id, shift_id, sort_order);

  CREATE TABLE visits (
    uuid TEXT PRIMARY KEY NOT NULL,
    house_id TEXT NOT NULL,
    group_id INTEGER NOT NULL,
    shift_id INTEGER NOT NULL,
    result TEXT NOT NULL,
    note TEXT,
    created_at TEXT NOT NULL,
    sync_state TEXT NOT NULL DEFAULT 'pending'
  );

  CREATE INDEX ix_visits_tour ON visits (group_id, shift_id);

  CREATE TABLE donations (
    uuid TEXT PRIMARY KEY NOT NULL,
    visit_uuid TEXT NOT NULL,
    house_id TEXT NOT NULL,
    group_id INTEGER NOT NULL,
    shift_id INTEGER NOT NULL,
    amount_cents INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'EUR',
    payment_type TEXT NOT NULL,
    receipt_number TEXT,
    receipt_uri TEXT,
    donor_json TEXT,
    created_at TEXT NOT NULL,
    sync_state TEXT NOT NULL DEFAULT 'pending'
  );

  CREATE INDEX ix_donations_tour ON donations (group_id, shift_id);

  CREATE TABLE tours (
    group_id INTEGER NOT NULL,
    shift_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'not_started',
    started_at TEXT,
    finished_at TEXT,
    summary_note TEXT,
    sync_state TEXT NOT NULL DEFAULT 'pending',
    PRIMARY KEY (group_id, shift_id)
  );

  CREATE TABLE outbox (
    client_uuid TEXT PRIMARY KEY NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    method TEXT NOT NULL,
    payload TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TEXT NOT NULL,
    synced_at TEXT
  );

  CREATE INDEX ix_outbox_pending ON outbox (synced_at, created_at);

  CREATE TABLE receipt_counters (
    scope TEXT PRIMARY KEY NOT NULL,
    next_seq INTEGER NOT NULL
  );

  CREATE TABLE settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
  `
];

let connection: Promise<SQLite.SQLiteDatabase> | null = null;

async function migrate(db: SQLite.SQLiteDatabase) {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;

  for (let version = current; version < MIGRATIONS.length; version += 1) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATIONS[version]);
    });
    await db.execAsync(`PRAGMA user_version = ${version + 1}`);
  }
}

export function getDatabase() {
  if (!connection) {
    connection = SQLite.openDatabaseAsync(DATABASE_NAME)
      .then(async (db) => {
        await db.execAsync('PRAGMA journal_mode = WAL');
        await migrate(db);
        return db;
      })
      .catch((error) => {
        connection = null;
        throw error;
      });
  }

  return connection;
}

/** Only used when signing out, so one volunteer's tour data never leaks to the next. */
export async function resetDatabase() {
  const db = await getDatabase();

  await db.withTransactionAsync(async () => {
    await db.execAsync(`
      DELETE FROM houses;
      DELETE FROM visits;
      DELETE FROM donations;
      DELETE FROM tours;
      DELETE FROM outbox;
      DELETE FROM receipt_counters;
      DELETE FROM settings;
    `);
  });
}
