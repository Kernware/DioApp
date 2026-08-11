import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import * as authApi from '../api/auth';
import type { Session } from '../api/auth';
import { resetDatabase } from '../db';
import type { Person } from '../domain/types';

const SESSION_KEY = 'dio.field.session';
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'signedIn'; session: Session };

type AuthContextValue = {
  status: AuthState['status'];
  person: Person | null;
  requestCode: (email: string) => Promise<void>;
  verifyCode: (email: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
  /**
   * Returns a usable token, refreshing it when it is close to expiry. Returns
   * null once the session is gone for good and the volunteer has to sign in again.
   */
  getAccessToken: () => Promise<string | null>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function persist(session: Session | null) {
  if (session) {
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
    return;
  }

  await SecureStore.deleteItemAsync(SESSION_KEY);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const refreshInFlight = useRef<Promise<Session | null> | null>(null);

  useEffect(() => {
    let cancelled = false;

    SecureStore.getItemAsync(SESSION_KEY)
      .then((raw) => {
        if (cancelled) {
          return;
        }

        if (!raw) {
          setState({ status: 'signedOut' });
          return;
        }

        setState({ status: 'signedIn', session: JSON.parse(raw) as Session });
      })
      .catch(() => {
        if (!cancelled) {
          setState({ status: 'signedOut' });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const requestCode = useCallback(async (email: string) => {
    await authApi.requestCode(email);
  }, []);

  const verifyCode = useCallback(async (email: string, code: string) => {
    const session = await authApi.verifyCode(email, code);
    await persist(session);
    setState({ status: 'signedIn', session });
  }, []);

  const signOut = useCallback(async () => {
    const current = state.status === 'signedIn' ? state.session : null;

    if (current) {
      // Best effort: the local session goes away either way.
      await authApi.logout(current.accessToken).catch(() => undefined);
    }

    await persist(null);
    await resetDatabase().catch(() => undefined);
    setState({ status: 'signedOut' });
  }, [state]);

  const getAccessToken = useCallback(async () => {
    if (state.status !== 'signedIn') {
      return null;
    }

    const { session } = state;
    const expiresAt = new Date(session.expiresAt).getTime();

    if (Number.isFinite(expiresAt) && expiresAt - Date.now() > REFRESH_MARGIN_MS) {
      return session.accessToken;
    }

    if (!refreshInFlight.current) {
      refreshInFlight.current = authApi
        .refreshSession(session.refreshToken)
        .then(async (refreshed) => {
          await persist(refreshed);
          setState({ status: 'signedIn', session: refreshed });
          return refreshed;
        })
        .catch(() => null)
        .finally(() => {
          refreshInFlight.current = null;
        });
    }

    const refreshed = await refreshInFlight.current;

    // Offline refresh failures fall back to the existing token: it may still be
    // accepted, and a volunteer mid-tour must never be logged out by a dead spot.
    return refreshed?.accessToken ?? session.accessToken;
  }, [state]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status: state.status,
      person: state.status === 'signedIn' ? state.session.person : null,
      requestCode,
      verifyCode,
      signOut,
      getAccessToken
    }),
    [state, requestCode, verifyCode, signOut, getAccessToken]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used inside an AuthProvider.');
  }

  return context;
}
