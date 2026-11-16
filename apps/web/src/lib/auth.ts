import { queryClient } from '@/lib/query-client';
import { Me, useAuthStore } from '@/stores/auth-store';
import { api, refreshSession } from './api';

interface SessionResponse {
  accessToken: string;
  activeCompanyId: string | null;
}

export async function loadMe(): Promise<Me> {
  const me = await api<Me>('/auth/me');
  useAuthStore.getState().setMe(me);
  return me;
}

/** Al iniciar la SPA intenta recuperar la sesión con la cookie de refresh. */
export async function bootstrapSession(): Promise<void> {
  if (await refreshSession()) {
    try {
      await loadMe();
      return;
    } catch {
      /* sesión inválida */
    }
  }
  useAuthStore.getState().clear();
}

async function startSession(res: SessionResponse) {
  useAuthStore.getState().setToken(res.accessToken);
  queryClient.clear();
  return loadMe();
}

export async function login(email: string, password: string) {
  return startSession(await api<SessionResponse>('/auth/login', { method: 'POST', body: { email, password } }));
}

export interface RegisterInput {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  company: { legalName: string; cuit: string; taxCondition: string };
}

export async function register(input: RegisterInput) {
  return startSession(await api<SessionResponse>('/auth/register', { method: 'POST', body: input }));
}

export async function switchCompany(companyId: string) {
  return startSession(await api<SessionResponse>('/auth/switch-company', { method: 'POST', body: { companyId } }));
}

export async function logout() {
  try {
    await api('/auth/logout', { method: 'POST' });
  } finally {
    queryClient.clear();
    useAuthStore.getState().clear();
  }
}
