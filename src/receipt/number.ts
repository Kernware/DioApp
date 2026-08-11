import * as Crypto from 'expo-crypto';
import { getDatabase } from '../db';
import { readSetting, writeSetting } from '../db/settings';
import type { Assignment } from '../domain/types';

const DEVICE_CODE_KEY = 'receipt.device_code';

/**
 * Receipt numbers have to be collision-free while the phone is offline, and two
 * escorts in the same group can both be issuing them. A per-device segment makes
 * every device its own numbering space, so no server counter is needed.
 */
async function deviceCode() {
  const existing = await readSetting<string>(DEVICE_CODE_KEY);

  if (existing) {
    return existing;
  }

  const code = Crypto.randomUUID().replace(/-/g, '').slice(0, 4).toUpperCase();
  await writeSetting(DEVICE_CODE_KEY, code);

  return code;
}

export async function allocateReceiptNumber(assignment: Assignment) {
  const scope = [
    assignment.parishShort,
    assignment.campaignYear,
    assignment.groupId,
    await deviceCode()
  ].join('-');

  const db = await getDatabase();
  let sequence = 1;

  await db.withTransactionAsync(async () => {
    const row = await db.getFirstAsync<{ next_seq: number }>(
      'SELECT next_seq FROM receipt_counters WHERE scope = ?',
      [scope]
    );

    sequence = row?.next_seq ?? 1;

    await db.runAsync(
      `INSERT INTO receipt_counters (scope, next_seq) VALUES (?, ?)
       ON CONFLICT(scope) DO UPDATE SET next_seq = excluded.next_seq`,
      [scope, sequence + 1]
    );
  });

  return `${scope}-${String(sequence).padStart(4, '0')}`;
}
