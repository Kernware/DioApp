import { getDatabase } from './index';
import type { House, HouseStatus } from '../domain/types';

type HouseRow = {
  id: string;
  group_id: number;
  shift_id: number;
  sort_order: number;
  street: string;
  house_number: string | null;
  postal_code: string | null;
  city: string | null;
  contact_name: string | null;
  note: string | null;
  latitude: number | null;
  longitude: number | null;
  status: HouseStatus;
};

function toHouse(row: HouseRow): House {
  return {
    id: row.id,
    groupId: row.group_id,
    shiftId: row.shift_id,
    sortOrder: row.sort_order,
    street: row.street,
    houseNumber: row.house_number,
    postalCode: row.postal_code,
    city: row.city,
    contactName: row.contact_name,
    note: row.note,
    latitude: row.latitude,
    longitude: row.longitude,
    status: row.status
  };
}

/**
 * Planning fields always follow the server, but a locally changed status wins
 * until its outbox operation is confirmed. Without that guard a refresh mid-tour
 * would silently reopen houses the group already finished.
 */
export async function cacheHouses(houses: House[]) {
  const db = await getDatabase();
  const now = new Date().toISOString();

  await db.withTransactionAsync(async () => {
    for (const house of houses) {
      await db.runAsync(
        `INSERT INTO houses (
           id, group_id, shift_id, sort_order, street, house_number, postal_code,
           city, contact_name, note, latitude, longitude, status, updated_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           group_id = excluded.group_id,
           shift_id = excluded.shift_id,
           sort_order = excluded.sort_order,
           street = excluded.street,
           house_number = excluded.house_number,
           postal_code = excluded.postal_code,
           city = excluded.city,
           contact_name = excluded.contact_name,
           note = excluded.note,
           latitude = excluded.latitude,
           longitude = excluded.longitude,
           status = CASE WHEN houses.status_dirty = 1 THEN houses.status ELSE excluded.status END,
           updated_at = excluded.updated_at`,
        [
          house.id,
          house.groupId,
          house.shiftId,
          house.sortOrder,
          house.street,
          house.houseNumber,
          house.postalCode,
          house.city,
          house.contactName,
          house.note,
          house.latitude,
          house.longitude,
          house.status,
          now
        ]
      );
    }
  });
}

export async function listHouses(groupId: number, shiftId: number) {
  const db = await getDatabase();
  const rows = await db.getAllAsync<HouseRow>(
    `SELECT * FROM houses
     WHERE group_id = ? AND shift_id = ?
     ORDER BY sort_order, street, house_number`,
    [groupId, shiftId]
  );

  return rows.map(toHouse);
}

export async function getHouse(id: string) {
  const db = await getDatabase();
  const row = await db.getFirstAsync<HouseRow>('SELECT * FROM houses WHERE id = ?', [id]);

  return row ? toHouse(row) : null;
}

export async function setHouseStatus(id: string, status: HouseStatus) {
  const db = await getDatabase();

  await db.runAsync(
    'UPDATE houses SET status = ?, status_dirty = 1, updated_at = ? WHERE id = ?',
    [status, new Date().toISOString(), id]
  );
}

export async function clearHouseStatusDirty(id: string) {
  const db = await getDatabase();

  await db.runAsync('UPDATE houses SET status_dirty = 0 WHERE id = ?', [id]);
}
