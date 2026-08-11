import { apiRequest } from './client';
import type { Assignment, House } from '../domain/types';

export type OutboxOperation = {
  clientUuid: string;
  endpoint: string;
  method: 'POST' | 'PUT';
  payload: unknown;
};

export type SyncResult = {
  clientUuid: string;
  status: 'accepted' | 'duplicate' | 'rejected';
  message?: string;
};

export function fetchAssignment(token: string) {
  return apiRequest<{ assignment: Assignment | null }>('/current-assignment', { token });
}

export function fetchRoute(token: string, groupId: number) {
  return apiRequest<{ houses: House[] }>(`/groups/${groupId}/route`, { token });
}

/**
 * One batched call for the whole outbox. The server keys every operation on its
 * client UUID, so replaying a batch after a timeout is safe.
 */
export function pushSync(token: string, operations: OutboxOperation[]) {
  return apiRequest<{ results: SyncResult[] }>('/sync', {
    method: 'POST',
    token,
    body: {
      operations: operations.map((operation) => ({
        client_uuid: operation.clientUuid,
        endpoint: operation.endpoint,
        method: operation.method,
        payload: operation.payload
      }))
    },
    timeoutMs: 20000
  });
}
