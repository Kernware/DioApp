import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as Crypto from 'expo-crypto';
import { OfflineError } from '../api/client';
import { fetchAssignment, fetchRoute } from '../api/field';
import { useAuth } from '../auth/AuthContext';
import { insertDonation, insertVisit, listDonationsForTour, tourTotals } from '../db/entries';
import { cacheHouses, listHouses, setHouseStatus } from '../db/houses';
import { enqueue } from '../db/outbox';
import { readSetting, writeSetting } from '../db/settings';
import { finishTour, getTour, startTour } from '../db/tours';
import type { Tour } from '../db/tours';
import { allocateReceiptNumber } from '../receipt/number';
import { useSync } from '../sync/SyncContext';
import type {
  Assignment,
  Donation,
  Donor,
  House,
  HouseStatus,
  PaymentType,
  TourTotals,
  VisitResult
} from '../domain/types';

const ASSIGNMENT_KEY = 'tour.assignment';

const EMPTY_TOTALS: TourTotals = {
  housesTotal: 0,
  housesDone: 0,
  visitCount: 0,
  donationCount: 0,
  amountCents: 0,
  pendingSync: 0
};

export type RecordVisitInput = {
  house: House;
  result: VisitResult;
  note: string;
  donation: {
    amountCents: number;
    paymentType: PaymentType;
    donor: Donor | null;
  } | null;
};

type TourContextValue = {
  assignment: Assignment | null;
  houses: House[];
  donations: Donation[];
  totals: TourTotals;
  tour: Tour | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  recordVisit: (input: RecordVisitInput) => Promise<Donation | null>;
  submitSummary: (note: string) => Promise<void>;
};

const TourContext = createContext<TourContextValue | null>(null);

function statusForResult(result: VisitResult): HouseStatus {
  if (result === 'skipped' || result === 'not_found') {
    return 'skipped';
  }

  if (result === 'callback_requested') {
    return 'in_progress';
  }

  return 'done';
}

export function TourProvider({ children }: { children: React.ReactNode }) {
  const { status, getAccessToken } = useAuth();
  const { syncNow, pending } = useSync();
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [houses, setHouses] = useState<House[]>([]);
  const [donations, setDonations] = useState<Donation[]>([]);
  const [totals, setTotals] = useState<TourTotals>(EMPTY_TOTALS);
  const [tour, setTour] = useState<Tour | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadLocal = useCallback(async (current: Assignment | null) => {
    if (!current) {
      setHouses([]);
      setDonations([]);
      setTotals(EMPTY_TOTALS);
      setTour(null);
      return;
    }

    const [nextHouses, nextDonations, nextTotals, nextTour] = await Promise.all([
      listHouses(current.groupId, current.shiftId),
      listDonationsForTour(current.groupId, current.shiftId),
      tourTotals(current.groupId, current.shiftId),
      getTour(current.groupId, current.shiftId)
    ]);

    setHouses(nextHouses);
    setDonations(nextDonations);
    setTotals({ ...nextTotals, pendingSync: 0 });
    setTour(nextTour);
  }, []);

  const refresh = useCallback(async () => {
    setError(null);

    const cached = await readSetting<Assignment>(ASSIGNMENT_KEY);

    if (cached) {
      setAssignment(cached);
      await loadLocal(cached);
    }

    setLoading(false);

    const token = await getAccessToken();

    if (!token) {
      return;
    }

    try {
      const { assignment: fresh } = await fetchAssignment(token);

      if (!fresh) {
        setError('Für dich ist derzeit keine Gruppe eingeteilt.');
        return;
      }

      await writeSetting(ASSIGNMENT_KEY, fresh);
      setAssignment(fresh);

      const { houses: route } = await fetchRoute(token, fresh.groupId);
      await cacheHouses(route);
      await loadLocal(fresh);
    } catch (caught) {
      if (caught instanceof OfflineError) {
        // Cached route and queued writes carry the tour until signal returns.
        setError(cached ? null : 'Offline und keine gespeicherte Route vorhanden.');
        return;
      }

      setError(caught instanceof Error ? caught.message : 'Route konnte nicht geladen werden.');
    }
  }, [getAccessToken, loadLocal]);

  useEffect(() => {
    if (status === 'signedIn') {
      void refresh();
      return;
    }

    if (status === 'signedOut') {
      setAssignment(null);
      setLoading(false);
      void loadLocal(null);
    }
  }, [loadLocal, refresh, status]);

  useEffect(() => {
    setTotals((current) => ({ ...current, pendingSync: pending }));
  }, [pending]);

  const recordVisit = useCallback(
    async ({ house, result, note, donation }: RecordVisitInput) => {
      if (!assignment) {
        throw new Error('Keine aktive Gruppe.');
      }

      const createdAt = new Date().toISOString();
      const visitUuid = Crypto.randomUUID();

      await startTour(assignment.groupId, assignment.shiftId);

      await insertVisit({
        uuid: visitUuid,
        houseId: house.id,
        groupId: assignment.groupId,
        shiftId: assignment.shiftId,
        result,
        note: note.trim() || null,
        createdAt,
        syncState: 'pending'
      });

      await enqueue({
        clientUuid: visitUuid,
        entityType: 'visit',
        entityId: visitUuid,
        endpoint: '/visit-entries',
        method: 'POST',
        payload: {
          client_uuid: visitUuid,
          group_id: assignment.groupId,
          shift_id: assignment.shiftId,
          house_id: house.id,
          street: house.street,
          house_number: house.houseNumber,
          postal_code: house.postalCode,
          city: house.city,
          result,
          note: note.trim() || null,
          created_at_client: createdAt
        }
      });

      let created: Donation | null = null;

      if (donation && donation.amountCents > 0) {
        const donationUuid = Crypto.randomUUID();
        const receiptNumber = await allocateReceiptNumber(assignment);

        created = {
          uuid: donationUuid,
          visitUuid,
          houseId: house.id,
          amountCents: donation.amountCents,
          currency: 'EUR',
          paymentType: donation.paymentType,
          receiptNumber,
          receiptUri: null,
          donor: donation.donor,
          createdAt,
          syncState: 'pending'
        };

        await insertDonation({
          ...created,
          groupId: assignment.groupId,
          shiftId: assignment.shiftId
        });

        await enqueue({
          clientUuid: donationUuid,
          entityType: 'donation',
          entityId: donationUuid,
          endpoint: '/donation-entries',
          method: 'POST',
          payload: {
            client_uuid: donationUuid,
            visit_client_uuid: visitUuid,
            group_id: assignment.groupId,
            shift_id: assignment.shiftId,
            house_id: house.id,
            amount_cents: donation.amountCents,
            currency: 'EUR',
            payment_type: donation.paymentType,
            receipt_number: receiptNumber,
            donor: donation.donor,
            created_at_client: createdAt
          }
        });
      }

      const nextStatus = statusForResult(result);
      await setHouseStatus(house.id, nextStatus);
      await enqueue({
        clientUuid: `house-status:${house.id}:${createdAt}`,
        entityType: 'house_status',
        entityId: house.id,
        endpoint: `/route-items/house/${encodeURIComponent(house.id)}/status`,
        method: 'PUT',
        payload: {
          client_uuid: `house-status:${house.id}:${createdAt}`,
          group_id: assignment.groupId,
          shift_id: assignment.shiftId,
          // Redundant with the path, but it keeps the batched payload self-describing.
          house_id: house.id,
          status: nextStatus,
          changed_at_client: createdAt
        }
      });

      await loadLocal(assignment);
      void syncNow();

      return created;
    },
    [assignment, loadLocal, syncNow]
  );

  const submitSummary = useCallback(
    async (note: string) => {
      if (!assignment) {
        throw new Error('Keine aktive Gruppe.');
      }

      await finishTour(assignment.groupId, assignment.shiftId, note.trim());

      const localTotals = await tourTotals(assignment.groupId, assignment.shiftId);
      const clientUuid = `tour-finish:${assignment.groupId}:${assignment.shiftId}`;

      await enqueue({
        clientUuid,
        entityType: 'tour',
        entityId: `${assignment.groupId}:${assignment.shiftId}`,
        endpoint: `/tours/${assignment.groupId}/${assignment.shiftId}/finish`,
        method: 'POST',
        payload: {
          client_uuid: clientUuid,
          summary_note: note.trim(),
          finished_at_client: new Date().toISOString(),
          // Reconciliation only. The server recomputes totals from the entries.
          reported_totals: localTotals
        }
      });

      await loadLocal(assignment);
      void syncNow();
    },
    [assignment, loadLocal, syncNow]
  );

  const value = useMemo<TourContextValue>(
    () => ({
      assignment,
      houses,
      donations,
      totals,
      tour,
      loading,
      error,
      refresh,
      recordVisit,
      submitSummary
    }),
    [assignment, houses, donations, totals, tour, loading, error, refresh, recordVisit, submitSummary]
  );

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}

export function useTour() {
  const context = useContext(TourContext);

  if (!context) {
    throw new Error('useTour must be used inside a TourProvider.');
  }

  return context;
}
