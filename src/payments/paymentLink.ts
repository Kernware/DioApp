import { API_URL, DEMO_MODE, PAYMENT_LINK_URL } from '../config/env';
import { OfflineError } from '../api/errors';

export type PaymentLink = {
  /** Null for the statically configured link, which has no session to track. */
  id: string | null;
  url: string;
  expiresAt: string | null;
};

export type PaymentLinkStatus = 'open' | 'paid' | 'expired';

async function requestJson<T>(path: string, body?: unknown, timeoutMs = 10000): Promise<T> {
  const url = `${API_URL}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;

  try {
    response = await fetch(url, {
      method: body ? 'POST' : 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
  } catch {
    throw new OfflineError(url);
  } finally {
    clearTimeout(timeout);
  }

  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;

  if (!response.ok) {
    throw new Error(
      typeof payload?.error === 'string'
        ? payload.error
        : `Der Zahlungsserver antwortete mit ${response.status}.`
    );
  }

  if (!payload) {
    throw new Error('Der Zahlungsserver hat keine verwertbare Antwort geschickt.');
  }

  return payload as T;
}

/** The link from the app configuration, used when no payment server is available. */
export function staticPaymentLink(): PaymentLink | null {
  if (!PAYMENT_LINK_URL) {
    return null;
  }

  return { id: null, url: PAYMENT_LINK_URL, expiresAt: null };
}

/**
 * Asks the payment server for a Stripe page that already holds this amount. The
 * URL goes into a QR code, so the donor pays on their own phone.
 */
export async function createPaymentLink(amountCents: number): Promise<PaymentLink> {
  if (DEMO_MODE) {
    const fallback = staticPaymentLink();

    if (!fallback) {
      throw new Error('Im Demo-Modus gibt es keinen Zahlungsserver und keinen festen Link.');
    }

    return fallback;
  }

  const created = await requestJson<{ id: string; url: string; expiresAt: string }>(
    '/create-payment-link',
    { amount_cents: amountCents }
  );

  return { id: created.id, url: created.url, expiresAt: created.expiresAt };
}

export async function fetchPaymentLinkStatus(id: string): Promise<PaymentLinkStatus> {
  const session = await requestJson<{ status: string; paymentStatus: string }>(
    `/payment-link/${encodeURIComponent(id)}/status`
  );

  if (session.paymentStatus === 'paid') {
    return 'paid';
  }

  return session.status === 'expired' ? 'expired' : 'open';
}
