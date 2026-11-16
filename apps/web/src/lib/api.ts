import { useAuthStore } from '@/stores/auth-store';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Mensajes de validación del backend en una sola línea legible. */
  get fullMessage(): string {
    if (Array.isArray(this.details) && this.details.length) return `${this.message}: ${this.details.join('; ')}`;
    return this.message;
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Query;
  headers?: Record<string, string>;
}

const BASE = '/api';
let refreshing: Promise<boolean> | null = null;

function buildUrl(path: string, query?: Query): string {
  const url = `${BASE}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

/** Renueva el access token con la cookie httpOnly. Las llamadas concurrentes comparten una sola renovación. */
export function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'same-origin' });
      if (!res.ok) return false;
      const data = (await res.json()) as { accessToken: string };
      useAuthStore.getState().setToken(data.accessToken);
      return true;
    } catch {
      return false;
    } finally {
      setTimeout(() => (refreshing = null), 0);
    }
  })();
  return refreshing;
}

async function send(path: string, opts: RequestOptions, retry: boolean): Promise<Response> {
  const token = useAuthStore.getState().accessToken;
  const headers: Record<string, string> = { Accept: 'application/json', ...opts.headers };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(buildUrl(path, opts.query), {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  });

  if (res.status === 401 && retry && !path.startsWith('/auth/login') && !path.startsWith('/auth/refresh')) {
    if (await refreshSession()) return send(path, opts, false);
    useAuthStore.getState().clear();
  }
  return res;
}

async function toError(res: Response): Promise<ApiError> {
  let body: { message?: string; details?: unknown } = {};
  try {
    body = await res.json();
  } catch {
    /* respuesta sin JSON */
  }
  const fallback = res.status >= 500 ? 'Error del servidor. Intente nuevamente.' : `Error ${res.status}`;
  return new ApiError(body.message ?? fallback, res.status, body.details);
}

export async function api<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await send(path, opts, true);
  if (!res.ok) throw await toError(res);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** Descarga binaria autenticada (PDF de comprobantes). */
export async function apiBlob(path: string): Promise<Blob> {
  const res = await send(path, { headers: { Accept: 'application/pdf' } }, true);
  if (!res.ok) throw await toError(res);
  return res.blob();
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.fullMessage;
  if (err instanceof Error) return err.message;
  return 'Ocurrió un error inesperado';
}
