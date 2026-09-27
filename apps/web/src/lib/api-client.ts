import type { ApiError } from '@acsp/shared';

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1').replace(
  /\/+$/,
  '',
);

/** Normalised error thrown by every `api.*` call. */
export class ApiClientError extends Error {
  readonly status: number;
  /** Individual validation messages when the API returned `message: string[]`. */
  readonly messages: string[];
  readonly code?: string;

  constructor(status: number, message: string | string[], code?: string) {
    const messages = Array.isArray(message) ? message : [message];
    super(messages.join('\n'));
    this.name = 'ApiClientError';
    this.status = status;
    this.messages = messages;
    this.code = code;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

export function isApiClientError(error: unknown): error is ApiClientError {
  return error instanceof ApiClientError;
}

/** Extract a human-readable message from any thrown value (for toasts). */
export function getErrorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (isApiClientError(error)) return error.message || fallback;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface RequestOptions {
  signal?: AbortSignal;
  headers?: Record<string, string>;
  /** Set to false to skip the automatic refresh-and-retry on 401 (default true). */
  retryOn401?: boolean;
}

const DEFAULT_MESSAGES: Record<number, string> = {
  0: 'Could not reach the server. Check your connection and try again.',
  400: 'The request was invalid.',
  401: 'Your session has expired. Please sign in again.',
  403: 'You do not have permission to do that.',
  404: 'Not found.',
  409: 'That already exists.',
  422: 'The request could not be processed.',
  429: 'Too many requests. Please slow down.',
  500: 'The server hit an unexpected error.',
};

function defaultMessage(status: number): string {
  return DEFAULT_MESSAGES[status] ?? `Request failed with status ${status}`;
}

// Routes where a 401 is the actual answer, not an expired session.
const NO_REFRESH_PATHS = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'];

let refreshPromise: Promise<boolean> | null = null;

/** Single-flight refresh so concurrent 401s trigger one `POST /auth/refresh`. */
async function refreshSession(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    })
      .then((res) => res.ok)
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

async function parseBody(res: Response): Promise<unknown> {
  if (res.status === 204 || res.headers.get('content-length') === '0') return undefined;
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      return await res.json();
    } catch {
      return undefined;
    }
  }
  const text = await res.text();
  return text.length > 0 ? text : undefined;
}

function toError(status: number, body: unknown): ApiClientError {
  if (body && typeof body === 'object') {
    const err = body as Partial<ApiError>;
    const message =
      err.message && (Array.isArray(err.message) ? err.message.length > 0 : err.message.length > 0)
        ? err.message
        : defaultMessage(status);
    return new ApiClientError(status, message, err.error);
  }
  if (typeof body === 'string' && body.trim().length > 0) {
    return new ApiClientError(status, body);
  }
  return new ApiClientError(status, defaultMessage(status));
}

function buildUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${API_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

async function request<T>(
  method: Method,
  path: string,
  body?: unknown,
  options: RequestOptions = {},
  attempt = 0,
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };

  let payload: BodyInit | undefined;
  if (body !== undefined) {
    if (body instanceof FormData) {
      payload = body;
    } else {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
  }

  let res: Response;
  try {
    res = await fetch(buildUrl(path), {
      method,
      credentials: 'include',
      headers,
      body: payload,
      signal: options.signal,
      cache: 'no-store',
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    throw new ApiClientError(0, defaultMessage(0));
  }

  const canRefresh =
    res.status === 401 &&
    attempt === 0 &&
    options.retryOn401 !== false &&
    !NO_REFRESH_PATHS.some((p) => path.startsWith(p));

  if (canRefresh) {
    const refreshed = await refreshSession();
    if (refreshed) {
      return request<T>(method, path, body, options, attempt + 1);
    }
  }

  const data = await parseBody(res);
  if (!res.ok) {
    throw toError(res.status, data);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>('GET', path, undefined, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('POST', path, body, options),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('PATCH', path, body, options),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('PUT', path, body, options),
  delete: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('DELETE', path, body, options),
};

export type ApiClient = typeof api;
