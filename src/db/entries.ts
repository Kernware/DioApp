import { getDatabase } from './index';
import type { Donation, Donor, PaymentType, SyncState, Visit, VisitResult } from '../domain/types';

type VisitRow = {
  uuid: string;
  house_id: string;
  group_id: number;
  shift_id: number;
  result: VisitResult;
  note: string | null;
  created_at: string;
  sync_state: SyncState;
};

type DonationRow = {
  uuid: string;
  visit_uuid: string;
  house_id: string;
  amount_cents: number;
  currency: string;
  payment_type: PaymentType;
  receipt_number: string | null;
  receipt_uri: string | null;
  donor_json: string | null;
  created_at: string;
  sync_state: SyncState;
};

function toVisit(row: VisitRow): Visit {
  return {
    uuid: row.uuid,
    houseId: row.house_id,
    groupId: row.group_id,
    shiftId: row.shift_id,
    result: row.result,
    note: row.note,
    createdAt: row.created_at,
    syncState: row.sync_state
  };
}

function toDonation(row: DonationRow): Donation {
  return {
    uuid: row.uuid,
    visitUuid: row.visit_uuid,
    houseId: row.house_id,
    amountCents: row.amount_cents,
    currency: row.currency,
    paymentType: row.payment_type,
    receiptNumber: row.receipt_number,
    receiptUri: row.receipt_uri,
    donor: row.donor_json ? (JSON.parse(row.donor_json) as Donor) : null,
    createdAt: row.created_at,
    syncState: row.sync_state
  };
}

export async function insertVisit(visit: Visit) {
  const db = await getDatabase();

  await db.runAsync(
    `INSERT INTO visits (uuid, house_id, group_id, shift_id, result, note, created_at, sync_state)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      visit.uuid,
      visit.houseId,
      visit.groupId,
      visit.shiftId,
      visit.result,
      visit.note,
      visit.createdAt,
      visit.syncState
    ]
  );
}

export async function insertDonation(
  donation: Donation & { groupId: number; shiftId: number }
) {
  const db = await getDatabase();

  await db.runAsync(
    `INSERT INTO donations (
       uuid, visit_uuid, house_id, group_id, shift_id, amount_cents, currency,
       payment_type, receipt_number, receipt_uri, donor_json, created_at, sync_state
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      donation.uuid,
      donation.visitUuid,
      donation.houseId,
      donation.groupId,
      donation.shiftId,
      donation.amountCents,
      donation.currency,
      donation.paymentType,
      donation.receiptNumber,
      donation.receiptUri,
      donation.donor ? JSON.stringify(donation.donor) : null,
      donation.createdAt,
      donation.syncState
    ]
  );
}

export async function attachReceipt(uuid: string, receiptNumber: string, receiptUri: string) {
  const db = await getDatabase();

  await db.runAsync('UPDATE donations SET receipt_number = ?, receipt_uri = ? WHERE uuid = ?', [
    receiptNumber,
    receiptUri,
    uuid
  ]);
}

export async function markEntrySynced(table: 'visits' | 'donations', uuid: string) {
  const db = await getDatabase();

  await db.runAsync(`UPDATE ${table} SET sync_state = 'synced' WHERE uuid = ?`, [uuid]);
}

export async function getDonation(uuid: string) {
  const db = await getDatabase();
  const row = await db.getFirstAsync<DonationRow>('SELECT * FROM donations WHERE uuid = ?', [uuid]);

  return row ? toDonation(row) : null;
}

export async function listVisitsForHouse(houseId: string) {
  const db = await getDatabase();
  const rows = await db.getAllAsync<VisitRow>(
    'SELECT * FROM visits WHERE house_id = ? ORDER BY created_at DESC',
    [houseId]
  );

  return rows.map(toVisit);
}

export async function listDonationsForTour(groupId: number, shiftId: number) {
  const db = await getDatabase();
  const rows = await db.getAllAsync<DonationRow>(
    'SELECT * FROM donations WHERE group_id = ? AND shift_id = ? ORDER BY created_at DESC',
    [groupId, shiftId]
  );

  return rows.map(toDonation);
}

/**
 * Local totals are for the volunteer's own reassurance. The server recomputes
 * them from the individual entries, so these numbers are never authoritative.
 */
export async function tourTotals(groupId: number, shiftId: number) {
  const db = await getDatabase();

  const houses = await db.getFirstAsync<{ total: number; done: number }>(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN status IN ('done', 'skipped') THEN 1 ELSE 0 END) AS done
     FROM houses WHERE group_id = ? AND shift_id = ?`,
    [groupId, shiftId]
  );

  const visits = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM visits WHERE group_id = ? AND shift_id = ?',
    [groupId, shiftId]
  );

  const donations = await db.getFirstAsync<{ count: number; amount: number }>(
    `SELECT COUNT(*) AS count, COALESCE(SUM(amount_cents), 0) AS amount
     FROM donations WHERE group_id = ? AND shift_id = ?`,
    [groupId, shiftId]
  );

  return {
    housesTotal: houses?.total ?? 0,
    housesDone: houses?.done ?? 0,
    visitCount: visits?.count ?? 0,
    donationCount: donations?.count ?? 0,
    amountCents: donations?.amount ?? 0
  };
}
