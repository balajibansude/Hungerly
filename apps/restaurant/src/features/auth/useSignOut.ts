import { useState } from 'react';

import { useServices } from '@/services';

import { clearLocalSession } from './clearLocalSession';

/**
 * Ends the session. Local state (session and registration draft) is cleared even if the
 * server call fails, so the user is never stuck signed in; the guards then show login.
 */
export function useSignOut() {
  const { auth } = useServices();
  const [signingOut, setSigningOut] = useState(false);

  const signOut = async () => {
    setSigningOut(true);
    try {
      await auth.signOut();
    } catch {
      // Ignored: a failed server sign-out must not keep the user signed in on this device.
    } finally {
      setSigningOut(false);
      clearLocalSession();
    }
  };

  return { signOut, signingOut };
}
