import * as Crypto from 'expo-crypto';
import { readSetting, writeSetting } from '../db/settings';
import { ApiError } from './errors';
import type { Assignment, House, HouseStatus, Person } from '../domain/types';

/**
 * Answers the mobile API contract inside the app so the flow can be demonstrated
 * on a phone with no backend running. House statuses are persisted locally, so
 * progress survives an app restart the way it would against a real server.
 */

const STATUS_KEY = 'demo.house_status';

const ASSIGNMENT: Assignment = {
  shiftId: 3,
  shiftName: 'Samstag 14:00–17:00',
  groupId: 11,
  groupName: 'Könige 1',
  campaignYear: 2027,
  parishShort: 'MST'
};

const ADDRESSES = [
  { street: 'Hauptstraße', houseNumber: '1', contactName: 'Familie Gruber', note: null },
  { street: 'Hauptstraße', houseNumber: '3', contactName: null, note: 'Bitte erst ab 15:00 klingeln' },
  { street: 'Hauptstraße', houseNumber: '5', contactName: 'Familie Wagner', note: null },
  { street: 'Hauptstraße', houseNumber: '7', contactName: null, note: null },
  { street: 'Kirchengasse', houseNumber: '2', contactName: 'Familie Steiner', note: 'Hund im Vorgarten' },
  { street: 'Kirchengasse', houseNumber: '4', contactName: null, note: null },
  { street: 'Lindenweg', houseNumber: '11', contactName: 'Familie Moser', note: 'Spendenwunsch angemeldet' },
  { street: 'Lindenweg', houseNumber: '13', contactName: null, note: null }
];

const acceptedOperations = new Set<string>();
let currentPerson: Person | null = null;

/** Turns "maria.huber@pfarre.at" into "Maria Huber" so receipts carry a plausible name. */
function nameFromEmail(email: string) {
  const parts = email
    .split('@')[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1));

  return {
    firstName: parts[0] ?? 'Test',
    lastName: parts.slice(1).join(' ') || 'Begleitperson'
  };
}

function personFromEmail(email: string): Person {
  return {
    personId: 1,
    ...nameFromEmail(email || 'demo@sternsingen.at'),
    email: email || 'demo@sternsingen.at',
    parishId: 7,
    parishName: 'Pfarre Musterstadt',
    roles: [3]
  };
}

function buildSession(person: Person) {
  currentPerson = person;

  return {
    accessToken: Crypto.randomUUID(),
    refreshToken: Crypto.randomUUID(),
    expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
    person
  };
}

async function readStatuses() {
  return (await readSetting<Record<string, HouseStatus>>(STATUS_KEY)) ?? {};
}

async function listHouses(): Promise<House[]> {
  const statuses = await readStatuses();

  return ADDRESSES.map((address, index) => {
    const id = `${ASSIGNMENT.groupId}-${index + 1}`;

    return {
      id,
      groupId: ASSIGNMENT.groupId,
      shiftId: ASSIGNMENT.shiftId,
      sortOrder: (index + 1) * 10,
      street: address.street,
      houseNumber: address.houseNumber,
      postalCode: '3100',
      city: 'Musterstadt',
      contactName: address.contactName,
      note: address.note,
      latitude: 48.2 + index * 0.001,
      longitude: 15.62 + index * 0.001,
      status: statuses[id] ?? 'open'
    };
  });
}

type DemoOperation = {
  client_uuid?: string;
  endpoint?: string;
  payload?: { house_id?: string; status?: HouseStatus };
};

async function applySync(operations: DemoOperation[]) {
  const statuses = await readStatuses();
  const results: Array<{ clientUuid: string | null; status: string; message?: string }> = [];
  let statusesChanged = false;

  for (const operation of operations) {
    const clientUuid = operation?.client_uuid;

    if (!clientUuid) {
      results.push({ clientUuid: null, status: 'rejected', message: 'client_uuid fehlt.' });
      continue;
    }

    if (acceptedOperations.has(clientUuid)) {
      results.push({ clientUuid, status: 'duplicate' });
      continue;
    }

    const houseId = operation.payload?.house_id;
    const status = operation.payload?.status;

    if (operation.endpoint?.startsWith('/route-items/') && houseId && status) {
      statuses[houseId] = status;
      statusesChanged = true;
    }

    acceptedOperations.add(clientUuid);
    results.push({ clientUuid, status: 'accepted' });
  }

  if (statusesChanged) {
    await writeSetting(STATUS_KEY, statuses);
  }

  return { results };
}

export async function handleDemoRequest(path: string, body: unknown): Promise<unknown> {
  // A touch of latency so loading states behave like they will in the field.
  await new Promise((resolve) => setTimeout(resolve, 150));

  const payload = (body ?? {}) as Record<string, unknown>;
  const email = String(payload.email ?? '').trim().toLowerCase();

  if (path === '/auth/request-code') {
    return { sent: true };
  }

  if (path === '/auth/verify-code') {
    if (!/^\d{6}$/.test(String(payload.code ?? ''))) {
      throw new ApiError('INVALID_CODE', 'Im Demo-Modus gilt jeder 6-stellige Code.', 401);
    }

    return buildSession(personFromEmail(email));
  }

  if (path === '/auth/refresh') {
    return buildSession(currentPerson ?? personFromEmail(''));
  }

  if (path === '/auth/logout') {
    currentPerson = null;
    return { revoked: true };
  }

  if (path === '/current-assignment') {
    return { assignment: ASSIGNMENT };
  }

  if (/^\/groups\/\d+\/route$/.test(path)) {
    return { houses: await listHouses() };
  }

  if (path === '/sync') {
    return applySync(Array.isArray(payload.operations) ? (payload.operations as DemoOperation[]) : []);
  }

  throw new ApiError('NOT_IMPLEMENTED', `Im Demo-Modus nicht verfügbar: ${path}`, 404);
}
