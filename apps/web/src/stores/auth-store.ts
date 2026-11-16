import { create } from 'zustand';

export interface Me {
  user: { id: string; email: string; firstName: string; lastName: string; isPlatformAdmin: boolean };
  deploymentMode: 'saas' | 'private';
  companies: Array<{ id: string; legalName: string; tradeName: string | null; cuit: string; role: string }>;
  activeCompanyId: string | null;
  permissions: string[];
}

type Status = 'loading' | 'authenticated' | 'anonymous';

interface AuthState {
  /** El access token vive solo en memoria; el refresh token es una cookie httpOnly. */
  accessToken: string | null;
  me: Me | null;
  status: Status;
  setToken: (token: string | null) => void;
  setMe: (me: Me) => void;
  setStatus: (status: Status) => void;
  clear: () => void;
  can: (permission: string) => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: null,
  me: null,
  status: 'loading',
  setToken: (accessToken) => set({ accessToken }),
  setMe: (me) => set({ me, status: 'authenticated' }),
  setStatus: (status) => set({ status }),
  clear: () => set({ accessToken: null, me: null, status: 'anonymous' }),
  can: (permission) => Boolean(get().me?.permissions.includes(permission)),
}));

export const useCan = (permission: string) => useAuthStore((s) => Boolean(s.me?.permissions.includes(permission)));
