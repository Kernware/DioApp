import { DEMO_MODE, MOBILE_API_URL } from '../config/env';
import { handleDemoRequest } from './demoBackend';
import { ApiError, OfflineError } from './errors';

export { ApiError, OfflineError } from './errors';

export type ApiEnvelope<T> = {
  success: boolean;
  data: T | null;
  error: { code: string; message: string } | null;
};

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT';
  body?: unknown;
  token?: string | null;
  /** Kept short so a dead spot fails fast instead of blocking the volunteer. */
  timeoutMs?: number;
};

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, token, timeoutMs = 10000 } = options;

  if (DEMO_MODE) {
    return handleDemoRequest(path, body) as Promise<T>;
  }

  const url = `${MOBILE_API_URL}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;

  try {
    response = await fetch(url, {
      method,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
  } catch {
    throw new OfflineError(url);
  } finally {
    clearTimeout(timeout);
  }

  let envelope: ApiEnvelope<T> | null = null;

  try {
    envelope = (await response.json()) as ApiEnvelope<T>;
  } catch {
    envelope = null;
  }

  if (!response.ok || !envelope?.success) {
    throw new ApiError(
      envelope?.error?.code ?? 'REQUEST_FAILED',
      envelope?.error?.message ?? `Die Anfrage ist fehlgeschlagen (${response.status}).`,
      response.status
    );
  }

  return envelope.data as T;
}
