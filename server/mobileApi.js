const crypto = require('node:crypto');
const express = require('express');

/**
 * Development stand-in for the parish backend's mobile API. It exists so the app
 * can be exercised end to end; the real implementation belongs in the existing
 * CodeIgniter application under /api/v1/mobile.
 */

/**
 * Development shortcut: any syntactically valid address gets an account on first
 * request so the app can be tried without seeding volunteers. The real backend
 * must only issue codes to addresses a parish has actually registered, so this
 * has to be off before the API is exposed anywhere.
 */
const ALLOW_ANY_EMAIL = process.env.MOBILE_API_ALLOW_ANY_EMAIL !== 'false';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PEOPLE = [
  {
    personId: 42,
    firstName: 'Maria',
    lastName: 'Huber',
    email: 'begleitung@pfarre.at',
    parishId: 7,
    parishName: 'Pfarre Musterstadt',
    roles: [3]
  },
  {
    personId: 43,
    firstName: 'Thomas',
    lastName: 'Bauer',
    email: 'testuser@example.com',
    parishId: 7,
    parishName: 'Pfarre Musterstadt',
    roles: [1, 3]
  }
];

const ASSIGNMENT = {
  shiftId: 3,
  shiftName: 'Samstag 14:00–17:00',
  groupId: 11,
  groupName: 'Könige 1',
  campaignYear: 2027,
  parishShort: 'MST'
};

const HOUSES = [
  ['Hauptstraße', '1', 'Familie Gruber', null],
  ['Hauptstraße', '3', null, 'Bitte erst ab 15:00 klingeln'],
  ['Hauptstraße', '5', 'Familie Wagner', null],
  ['Hauptstraße', '7', null, null],
  ['Kirchengasse', '2', 'Familie Steiner', 'Hund im Vorgarten'],
  ['Kirchengasse', '4', null, null],
  ['Lindenweg', '11', 'Familie Moser', 'Spendenwunsch angemeldet'],
  ['Lindenweg', '13', null, null]
].map(([street, houseNumber, contactName, note], index) => ({
  // Kept URL-safe: the id travels inside the route-item status path.
  id: `${ASSIGNMENT.groupId}-${index + 1}`,
  groupId: ASSIGNMENT.groupId,
  shiftId: ASSIGNMENT.shiftId,
  sortOrder: (index + 1) * 10,
  street,
  houseNumber,
  postalCode: '3100',
  city: 'Musterstadt',
  contactName,
  note,
  latitude: 48.2 + index * 0.001,
  longitude: 15.62 + index * 0.001,
  status: 'open'
}));

const loginCodes = new Map();
const sessions = new Map();
const processedOperations = new Map();
const received = { visits: [], donations: [], statuses: [], tours: [] };

function ok(response, data) {
  return response.json({ success: true, data, error: null });
}

function fail(response, status, code, message) {
  return response.status(status).json({ success: false, data: null, error: { code, message } });
}

/** Turns "maria.huber@pfarre.at" into "Maria Huber" so receipts carry a plausible name. */
function nameFromEmail(email) {
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

function findOrCreatePerson(email) {
  const existing = PEOPLE.find((candidate) => candidate.email === email);

  if (existing) {
    return existing;
  }

  if (!ALLOW_ANY_EMAIL || !EMAIL_PATTERN.test(email)) {
    return null;
  }

  const person = {
    personId: 1000 + PEOPLE.length,
    ...nameFromEmail(email),
    email,
    parishId: 7,
    parishName: 'Pfarre Musterstadt',
    roles: [3]
  };

  PEOPLE.push(person);
  console.log(`[mobile-api] Demo-Zugang angelegt für ${email}`);

  return person;
}

function issueSession(person) {
  const accessToken = crypto.randomBytes(24).toString('hex');
  const refreshToken = crypto.randomBytes(24).toString('hex');

  sessions.set(accessToken, { personId: person.personId, refreshToken });

  return {
    accessToken,
    refreshToken,
    expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
    person
  };
}

function authenticate(request, response, next) {
  const header = request.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const session = token ? sessions.get(token) : null;

  if (!session) {
    return fail(response, 401, 'UNAUTHENTICATED', 'Die Sitzung ist abgelaufen.');
  }

  request.person = PEOPLE.find((person) => person.personId === session.personId);

  return next();
}

function applyOperation(operation) {
  const { endpoint, payload } = operation;

  if (endpoint === '/visit-entries') {
    received.visits.push(payload);
    return;
  }

  if (endpoint === '/donation-entries') {
    if (!Number.isInteger(payload?.amount_cents) || payload.amount_cents <= 0) {
      throw new Error('amount_cents muss eine positive ganze Zahl sein.');
    }

    received.donations.push(payload);
    return;
  }

  if (endpoint.startsWith('/route-items/')) {
    received.statuses.push(payload);
    return;
  }

  if (endpoint.includes('/finish')) {
    received.tours.push(payload);
    return;
  }

  throw new Error(`Unbekannter Endpunkt: ${endpoint}`);
}

const router = express.Router();

router.post('/auth/request-code', (request, response) => {
  const email = String(request.body?.email || '').trim().toLowerCase();
  const person = findOrCreatePerson(email);

  if (person) {
    const code = String(crypto.randomInt(100000, 1000000));
    loginCodes.set(email, { code, expiresAt: Date.now() + 10 * 60 * 1000 });
    console.log(`\n[mobile-api] Login-Code für ${email}: ${code}\n`);
  } else {
    console.log(`[mobile-api] Unbekannte E-Mail-Adresse, kein Code gesendet: ${email}`);
  }

  // Identical response either way, so the endpoint cannot be used to discover
  // which volunteers exist.
  return ok(response, { sent: true });
});

router.post('/auth/verify-code', (request, response) => {
  const email = String(request.body?.email || '').trim().toLowerCase();
  const code = String(request.body?.code || '').trim();
  const entry = loginCodes.get(email);

  if (!entry || entry.code !== code || entry.expiresAt < Date.now()) {
    return fail(response, 401, 'INVALID_CODE', 'Der Code ist falsch oder abgelaufen.');
  }

  loginCodes.delete(email);
  const person = PEOPLE.find((candidate) => candidate.email === email);

  return ok(response, issueSession(person));
});

router.post('/auth/refresh', (request, response) => {
  const refreshToken = String(request.body?.refresh_token || '');
  const match = [...sessions.entries()].find(([, session]) => session.refreshToken === refreshToken);

  if (!match) {
    return fail(response, 401, 'INVALID_REFRESH_TOKEN', 'Bitte melde dich erneut an.');
  }

  const [oldToken, session] = match;
  sessions.delete(oldToken);
  const person = PEOPLE.find((candidate) => candidate.personId === session.personId);

  return ok(response, issueSession(person));
});

router.post('/auth/logout', authenticate, (request, response) => {
  const token = request.headers.authorization.slice(7);
  sessions.delete(token);

  return ok(response, { revoked: true });
});

router.get('/me', authenticate, (request, response) => ok(response, { person: request.person }));

router.get('/current-assignment', authenticate, (_request, response) =>
  ok(response, { assignment: ASSIGNMENT })
);

router.get('/groups/:groupId/route', authenticate, (request, response) => {
  if (Number(request.params.groupId) !== ASSIGNMENT.groupId) {
    return fail(response, 403, 'NOT_ASSIGNED', 'Diese Gruppe ist dir nicht zugeteilt.');
  }

  const statusByHouse = new Map(received.statuses.map((entry) => [entry.house_id, entry.status]));

  return ok(response, {
    houses: HOUSES.map((house) => ({ ...house, status: statusByHouse.get(house.id) ?? house.status }))
  });
});

router.post('/sync', authenticate, (request, response) => {
  const operations = Array.isArray(request.body?.operations) ? request.body.operations : [];
  const results = [];

  for (const operation of operations) {
    const clientUuid = operation?.client_uuid;

    if (!clientUuid) {
      results.push({ clientUuid: null, status: 'rejected', message: 'client_uuid fehlt.' });
      continue;
    }

    const previous = processedOperations.get(clientUuid);

    if (previous) {
      // A replayed operation repeats its original verdict. Reporting a rejected
      // operation as a duplicate would make the client drop it silently.
      results.push(
        previous.status === 'accepted'
          ? { clientUuid, status: 'duplicate' }
          : { clientUuid, status: 'rejected', message: previous.message }
      );
      continue;
    }

    try {
      applyOperation(operation);
      processedOperations.set(clientUuid, { status: 'accepted' });
      results.push({ clientUuid, status: 'accepted' });
    } catch (error) {
      processedOperations.set(clientUuid, { status: 'rejected', message: error.message });
      results.push({ clientUuid, status: 'rejected', message: error.message });
    }
  }

  return ok(response, { results });
});

router.get('/_debug/state', (_request, response) =>
  ok(response, {
    receivedVisits: received.visits.length,
    receivedDonations: received.donations.length,
    totalCents: received.donations.reduce((sum, entry) => sum + entry.amount_cents, 0),
    tours: received.tours,
    donations: received.donations
  })
);

if (ALLOW_ANY_EMAIL) {
  console.warn(
    '[mobile-api] Development mode: any valid email address can sign in. Set MOBILE_API_ALLOW_ANY_EMAIL=false to restrict logins to the seeded accounts.'
  );
}

module.exports = { mobileApiRouter: router };
