import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Network from 'expo-network';
import { ApiError, OfflineError } from '../api/client';
import { pushSync } from '../api/field';
import { useAuth } from '../auth/AuthContext';
import { DEMO_MODE } from '../config/env';
import { markEntrySynced } from '../db/entries';
import { clearHouseStatusDirty } from '../db/houses';
import {
  markAttemptFailed,
  markSynced,
  pendingEntries,
  queueCounts,
  resetBlockedAttempts
} from '../db/outbox';
import { markTourSubmitted } from '../db/tours';
import type { OutboxEntityType } from '../db/outbox';

const SYNC_INTERVAL_MS = 30000;

/**
 * The operating system's answer is only a hint. Every field of NetworkState is
 * optional, and Android reports `isInternetReachable: false` for any network it
 * has not validated, which includes emulators and plenty of working Wi-Fi. So
 * unknown counts as online and a completed request is what actually settles it.
 */
function osReportsOffline(state: Network.NetworkState) {
  return state.isConnected === false || state.type === Network.NetworkStateType.NONE;
}

type SyncContextValue = {
  pending: number;
  /** Operations the server keeps rejecting, so automatic retries have stopped. */
  blocked: number;
  online: boolean;
  syncing: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
  syncNow: () => Promise<void>;
  retryBlocked: () => Promise<void>;
  refreshPending: () => Promise<void>;
};

const SyncContext = createContext<SyncContextValue | null>(null);

async function applyAccepted(entityType: OutboxEntityType, entityId: string) {
  if (entityType === 'visit') {
    await markEntrySynced('visits', entityId);
    return;
  }

  if (entityType === 'donation') {
    await markEntrySynced('donations', entityId);
    return;
  }

  if (entityType === 'house_status') {
    await clearHouseStatusDirty(entityId);
    return;
  }

  const [groupId, shiftId] = entityId.split(':').map(Number);
  await markTourSubmitted(groupId, shiftId);
}

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { status, getAccessToken } = useAuth();
  const [pending, setPending] = useState(0);
  const [blocked, setBlocked] = useState(0);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const running = useRef(false);

  const refreshPending = useCallback(async () => {
    const counts = await queueCounts();
    setPending(counts.pending);
    setBlocked(counts.blocked);
  }, []);

  const syncNow = useCallback(async () => {
    if (running.current || status !== 'signedIn') {
      return;
    }

    running.current = true;
    setSyncing(true);

    try {
      const entries = await pendingEntries();
      await refreshPending();

      if (entries.length === 0) {
        return;
      }

      const token = await getAccessToken();

      if (!token) {
        return;
      }

      const { results } = await pushSync(token, entries);
      const byUuid = new Map(entries.map((entry) => [entry.clientUuid, entry]));

      for (const result of results) {
        const entry = byUuid.get(result.clientUuid);

        if (!entry) {
          continue;
        }

        if (result.status === 'accepted' || result.status === 'duplicate') {
          await applyAccepted(entry.entityType, entry.entityId);
          await markSynced(result.clientUuid);
          continue;
        }

        await markAttemptFailed(result.clientUuid, result.message ?? 'Vom Server abgelehnt.');
      }

      setLastSyncAt(new Date().toISOString());
      setLastError(null);
      setOnline(true);
    } catch (error) {
      // A failed flush is normal offline: the queue simply stays put. An ApiError
      // means the server did answer, so the connection itself is fine.
      setOnline(!(error instanceof OfflineError));
      setLastError(error instanceof ApiError ? error.message : 'Synchronisierung nicht möglich.');
    } finally {
      await refreshPending();
      running.current = false;
      setSyncing(false);
    }
  }, [getAccessToken, refreshPending, status]);

  useEffect(() => {
    if (DEMO_MODE) {
      // The demo backend runs in-process, so device connectivity is irrelevant.
      setOnline(true);
      return;
    }

    const subscription = Network.addNetworkStateListener((state) => {
      if (osReportsOffline(state)) {
        setOnline(false);
        return;
      }

      // Connectivity looks restored: flush straight away and let the outcome of
      // that request decide what the indicator shows.
      setOnline(true);
      void syncNow();
    });

    Network.getNetworkStateAsync()
      .then((state) => setOnline(!osReportsOffline(state)))
      .catch(() => setOnline(true));

    return () => subscription.remove();
  }, [syncNow]);

  useEffect(() => {
    if (status !== 'signedIn') {
      return;
    }

    void refreshPending();
    void syncNow();

    const interval = setInterval(() => void syncNow(), SYNC_INTERVAL_MS);
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        void syncNow();
      }
    });

    return () => {
      clearInterval(interval);
      appState.remove();
    };
  }, [refreshPending, status, syncNow]);

  const retryBlocked = useCallback(async () => {
    await resetBlockedAttempts();
    await refreshPending();
    await syncNow();
  }, [refreshPending, syncNow]);

  const value = useMemo<SyncContextValue>(
    () => ({
      pending,
      blocked,
      online,
      syncing,
      lastSyncAt,
      lastError,
      syncNow,
      retryBlocked,
      refreshPending
    }),
    [pending, blocked, online, syncing, lastSyncAt, lastError, syncNow, retryBlocked, refreshPending]
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync() {
  const context = useContext(SyncContext);

  if (!context) {
    throw new Error('useSync must be used inside a SyncProvider.');
  }

  return context;
}
