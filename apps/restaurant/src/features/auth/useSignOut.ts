import { useState } from 'react';

import { useServices } from '@/services';

import { useSessionStore } from './session';

/**
 * Ends the session. The local session is cleared even if the server call fails, so the
 * user is never stuck signed in; the route guards then return them to login.
 */
export function useSignOut() {
  const { auth } = useServices();
  const clearSession = useSessionStore((s) => s.signOut);
  const [signingOut, setSigningOut] = useState(false);

  const signOut = async () => {
    setSigningOut(true);
    try {
      await auth.signOut();
    } catch {
      // Ignored: a failed server sign-out must not keep the user signed in on this device.
    } finally {
      setSigningOut(false);
      clearSession();
    }
  };

  return { signOut, signingOut };
}
