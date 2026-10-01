import { BrandSplash } from '@hungerly/ui';
import { Redirect } from 'expo-router';
import { useEffect } from 'react';

import { entryRouteFor, useSessionStore } from '@/features/auth/session';
import { useServices } from '@/services';

/**
 * Splash + routing gate. Shows the brand while the saved session is checked, then sends
 * the user to login, onboarding or the restaurant workspace. Every auth transition
 * returns here so routing decisions live in one place.
 */
export default function Index() {
  const { auth } = useServices();
  const isRestored = useSessionStore((s) => s.isRestored);
  const session = useSessionStore((s) => s.session);
  const markRestored = useSessionStore((s) => s.markRestored);

  useEffect(() => {
    if (isRestored) return;
    auth
      .restoreSession()
      .then(markRestored)
      .catch(() => markRestored(null));
  }, [auth, isRestored, markRestored]);

  if (!isRestored) return <BrandSplash tagline="Partner · run your restaurant" />;
  return <Redirect href={entryRouteFor(session)} />;
}
