import { getDatabase } from './index';
import type { OutboxOperation } from '../api/field';

export type OutboxEntityType = 'house_status' | 'visit' | 'donation' | 'tour';

export type OutboxEntry = OutboxOperation & {
  entityType: OutboxEntityType;
  entityId: string;
  attempts: number;
};

type OutboxRow = {
  client_uuid: string;
  entity_type: OutboxEntityType;
  entity_id: string;
  endpoint: string;
  method: 'POST' | 'PUT';
  payload: string;
  attempts: number;
};

export async function enqueue(entry: {
  clientUuid: string;
  entityType: OutboxEntityType;
  entityId: string;
  endpoint: string;
  method: 'POST' | 'PUT';
  payload: unknown;
}) {
  const db = await getDatabase();

  await db.runAsync(
    `INSERT INTO outbox (client_uuid, entity_type, entity_id, endpoint, method, payload, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(client_uuid) DO UPDATE SET
       payload = excluded.payload,
       synced_at = NULL,
       last_error = NULL`,
    [
      entry.clientUuid,
      entry.entityType,
      entry.entityId,
      entry.endpoint,
      entry.method,
      JSON.stringify(entry.payload),
      new Date().toISOString()
    ]
  );
}

/**
 * An operation the server keeps rejecting must stop being retried, otherwise it
 * blocks the queue behind it and drains the battery for nothing.
 */
const MAX_ATTEMPTS = 8;

export async function pendingEntries(limit = 50): Promise<OutboxEntry[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<OutboxRow>(
    `SELECT * FROM outbox
     WHERE synced_at IS NULL AND attempts < ?
     ORDER BY created_at
     LIMIT ?`,
    [MAX_ATTEMPTS, limit]
  );

  return rows.map((row) => ({
    clientUuid: row.client_uuid,
    entityType: row.entity_type,
    entityId: row.entity_id,
    endpoint: row.endpoint,
    method: row.method,
    payload: JSON.parse(row.payload) as unknown,
    attempts: row.attempts
  }));
}

export async function queueCounts() {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ pending: number; blocked: number }>(
    `SELECT COUNT(*) AS pending,
            SUM(CASE WHEN attempts >= ? THEN 1 ELSE 0 END) AS blocked
     FROM outbox WHERE synced_at IS NULL`,
    [MAX_ATTEMPTS]
  );

  return { pending: row?.pending ?? 0, blocked: row?.blocked ?? 0 };
}

export async function markSynced(clientUuid: string) {
  const db = await getDatabase();

  await db.runAsync('UPDATE outbox SET synced_at = ?, last_error = NULL WHERE client_uuid = ?', [
    new Date().toISOString(),
    clientUuid
  ]);
}

/** Lets the volunteer force another attempt after the automatic retries gave up. */
export async function resetBlockedAttempts() {
  const db = await getDatabase();

  await db.runAsync('UPDATE outbox SET attempts = 0 WHERE synced_at IS NULL AND attempts >= ?', [
    MAX_ATTEMPTS
  ]);
}

export async function markAttemptFailed(clientUuid: string, message: string) {
  const db = await getDatabase();

  await db.runAsync(
    'UPDATE outbox SET attempts = attempts + 1, last_error = ? WHERE client_uuid = ?',
    [message, clientUuid]
  );
}
