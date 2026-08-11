import { Platform } from 'react-native';
import { apiRequest } from './client';
import type { Person } from '../domain/types';

export type Session = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  person: Person;
};

function deviceInfo() {
  return {
    name: `${Platform.OS} ${Platform.Version}`,
    platform: Platform.OS,
    appVersion: '0.1.0'
  };
}

/**
 * Always resolves for a well-formed email. The backend only sends a code to
 * addresses it knows, but must not reveal which ones those are.
 */
export function requestCode(email: string) {
  return apiRequest<{ sent: true }>('/auth/request-code', {
    method: 'POST',
    body: { email: email.trim().toLowerCase() }
  });
}

export function verifyCode(email: string, code: string) {
  return apiRequest<Session>('/auth/verify-code', {
    method: 'POST',
    body: { email: email.trim().toLowerCase(), code: code.trim(), device: deviceInfo() }
  });
}

export function refreshSession(refreshToken: string) {
  return apiRequest<Session>('/auth/refresh', {
    method: 'POST',
    body: { refresh_token: refreshToken }
  });
}

export function logout(accessToken: string) {
  return apiRequest<{ revoked: true }>('/auth/logout', {
    method: 'POST',
    token: accessToken
  });
}
