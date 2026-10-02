import { create } from 'zustand';

import { acceptTokens, api, ApiError, clearTokens, refreshTokens, setSessionLostHandler } from './api';
import { clearLocalSettings, getDeviceId } from './secure';
import type { Partner } from './types';

type Phase = 'booting' | 'signedOut' | 'signedIn';

interface SessionState {
  phase: Phase;
  partner: Partner | null;
  /** Restore a session from secure storage at launch. */
  restore: () => Promise<void>;
  requestOtp: (phoneE164: string) => Promise<{ otp_request_id: string; resend_after: number }>;
  verifyOtp: (args: { phoneE164: string; requestId: string; otp: string }) => Promise<void>;
  reloadPartner: () => Promise<Partner | null>;
  setPartner: (p: Partner) => void;
  signOut: () => Promise<void>;
}

export const useSession = create<SessionState>((set, get) => ({
  phase: 'booting',
  partner: null,

  restore: async () => {
    try {
      if (await refreshTokens()) {
        const partner = await api<Partner>('/delivery/me');
        set({ phase: 'signedIn', partner });
        return;
      }
    } catch (e) {
      // Offline at launch with a stored session: keep the user signed in and retry later
      // rather than throwing away a valid login.
      if (e instanceof ApiError && e.status === 0) {
        set({ phase: 'signedIn' });
        return;
      }
    }
    set({ phase: 'signedOut', partner: null });
  },

  requestOtp: async (phoneE164) => {
    const device_id = await getDeviceId();
    return api('/auth/otp/request', {
      method: 'POST',
      auth: false,
      body: { phone_e164: phoneE164, client_app: 'delivery', device_id },
    });
  },

  verifyOtp: async ({ phoneE164, requestId, otp }) => {
    const device_id = await getDeviceId();
    const tokens = await api<Parameters<typeof acceptTokens>[0]>('/auth/otp/verify', {
      method: 'POST',
      auth: false,
      body: { otp_request_id: requestId, phone_e164: phoneE164, otp, client_app: 'delivery', device_id, device_name: 'Hungerly Partner app' },
    });
    await acceptTokens(tokens);
    const partner = await api<Partner>('/delivery/me');
    set({ phase: 'signedIn', partner });
  },

  reloadPartner: async () => {
    const partner = await api<Partner>('/delivery/me');
    set({ partner, phase: 'signedIn' });
    return partner;
  },

  setPartner: (partner) => set({ partner }),

  signOut: async () => {
    try {
      if (get().phase === 'signedIn') await api('/auth/logout', { method: 'POST' });
    } catch {
      /* the local session is cleared regardless */
    }
    await clearTokens();
    await clearLocalSettings();
    set({ phase: 'signedOut', partner: null });
  },
}));

// If the server revokes the session (suspension, sign-out elsewhere, token theft detection) drop to login.
setSessionLostHandler(() => {
  void clearTokens();
  useSession.setState({ phase: 'signedOut', partner: null });
});
