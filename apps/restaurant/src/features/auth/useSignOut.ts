import { paths } from '@hungerly/api-client';
import { useState } from 'react';

import { api } from '@/lib/api';

import { useSessionStore } from './session';

/**
 * Ends the session on the server, then locally. Local state is cleared even if the
 * server call fails, so the user is never stuck signed in; the guards then show login.
 */
export function useSignOut() {
  const [signingOut, setSigningOut] = useState(false);

  const signOut = async () => {
    setSigningOut(true);
    try {
      await api.request('POST', paths.auth.logout);
    } catch {
      // Ignored: a failed server sign-out must not keep the user signed in on this device.
    } finally {
      setSigningOut(false);
      await useSessionStore.getState().signOut();
    }
  };

  return { signOut, signingOut };
}
