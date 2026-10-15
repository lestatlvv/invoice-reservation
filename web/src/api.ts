import type { ApiErrorBody, Capacity, ReadyStatus, Reservation } from './types';

const TOKEN_KEY = 'capacity-desk-token';

export const DEMO_PROGRAM_ID = '11111111-1111-4111-8111-111111111111';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string,
  ) {
    super(message);
  }
}

export function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
}

async function parseError(res: Response): Promise<ApiError> {
  let body: ApiErrorBody = {};
  try {
    body = (await res.json()) as ApiErrorBody;
  } catch {
    body = {};
  }
  const raw = body.message;
  const message = Array.isArray(raw)
    ? raw.join('; ')
    : (raw ?? res.statusText ?? 'Request failed');
  return new ApiError(res.status, body.error, message);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  const token = getToken();
  if (token) headers.set('authorization', `Bearer ${token}`);

  const res = await fetch(path, { ...init, headers });
  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  login: (username: string, password: string) =>
    request<{ accessToken: string }>('/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  health: () => request<{ status: string }>('/health'),

  ready: () => request<ReadyStatus>('/ready'),

  capacity: (programId: string) =>
    request<Capacity>(`/v1/programs/${programId}/capacity`),

  reservations: (programId: string) =>
    request<Reservation[]>(`/v1/programs/${programId}/reservations`),

  reserve: (
    programId: string,
    body: { invoiceId: string; amount: string; currency: string },
  ) =>
    request<Reservation>(`/v1/programs/${programId}/reservations`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  release: (programId: string, invoiceId: string) =>
    request<Reservation>(
      `/v1/programs/${programId}/reservations/${encodeURIComponent(invoiceId)}/release`,
      { method: 'POST' },
    ),
};
