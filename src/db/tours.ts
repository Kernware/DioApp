import { getDatabase } from './index';

export type TourStatus = 'not_started' | 'in_progress' | 'finished' | 'submitted';

export type Tour = {
  groupId: number;
  shiftId: number;
  status: TourStatus;
  startedAt: string | null;
  finishedAt: string | null;
  summaryNote: string | null;
};

type TourRow = {
  group_id: number;
  shift_id: number;
  status: TourStatus;
  started_at: string | null;
  finished_at: string | null;
  summary_note: string | null;
};

export async function getTour(groupId: number, shiftId: number): Promise<Tour> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<TourRow>(
    'SELECT * FROM tours WHERE group_id = ? AND shift_id = ?',
    [groupId, shiftId]
  );

  if (!row) {
    return {
      groupId,
      shiftId,
      status: 'not_started',
      startedAt: null,
      finishedAt: null,
      summaryNote: null
    };
  }

  return {
    groupId: row.group_id,
    shiftId: row.shift_id,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    summaryNote: row.summary_note
  };
}

export async function startTour(groupId: number, shiftId: number) {
  const db = await getDatabase();

  await db.runAsync(
    `INSERT INTO tours (group_id, shift_id, status, started_at)
     VALUES (?, ?, 'in_progress', ?)
     ON CONFLICT(group_id, shift_id) DO UPDATE SET
       status = CASE WHEN tours.status = 'not_started' THEN 'in_progress' ELSE tours.status END,
       started_at = COALESCE(tours.started_at, excluded.started_at)`,
    [groupId, shiftId, new Date().toISOString()]
  );
}

export async function finishTour(groupId: number, shiftId: number, summaryNote: string) {
  const db = await getDatabase();

  await db.runAsync(
    `INSERT INTO tours (group_id, shift_id, status, started_at, finished_at, summary_note)
     VALUES (?, ?, 'finished', ?, ?, ?)
     ON CONFLICT(group_id, shift_id) DO UPDATE SET
       status = 'finished',
       finished_at = excluded.finished_at,
       summary_note = excluded.summary_note`,
    [groupId, shiftId, new Date().toISOString(), new Date().toISOString(), summaryNote]
  );
}

export async function markTourSubmitted(groupId: number, shiftId: number) {
  const db = await getDatabase();

  await db.runAsync(
    `UPDATE tours SET status = 'submitted', sync_state = 'synced'
     WHERE group_id = ? AND shift_id = ?`,
    [groupId, shiftId]
  );
}
