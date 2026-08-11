export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }

  /** Retrying will not help: the server rejected the request on its merits. */
  get isPermanent() {
    return this.status >= 400 && this.status < 500 && this.status !== 408 && this.status !== 429;
  }
}

/**
 * The request never reached a server. Carries the URL it tried, because the usual
 * cause during development is an unreachable base URL rather than a dead network.
 */
export class OfflineError extends Error {
  readonly url: string;

  constructor(url: string) {
    super(`Server nicht erreichbar: ${url}`);
    this.name = 'OfflineError';
    this.url = url;
  }
}
