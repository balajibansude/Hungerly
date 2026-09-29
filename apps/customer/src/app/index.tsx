import { Redirect } from 'expo-router';
import { useEffect } from 'react';

import { BrandSplash } from '@/features/auth/components/BrandSplash';
import { entryRouteFor, useSessionStore } from '@/features/auth/session';
import { useServices } from '@/services';

/**
 * Splash + routing gate. Shows the brand while the saved session is checked, then sends
 * the user to onboarding, login, profile setup or the app. Every auth transition returns
 * here so routing decisions live in one place.
 */
export default function Index() {
  const { auth } = useServices();
  const isRestored = useSessionStore((s) => s.isRestored);
  const session = useSessionStore((s) => s.session);
  const hasSeenOnboarding = useSessionStore((s) => s.hasSeenOnboarding);
  const markRestored = useSessionStore((s) => s.markRestored);

  useEffect(() => {
    if (isRestored) return;
    auth
      .restoreSession()
      .then(markRestored)
      .catch(() => markRestored(null));
  }, [auth, isRestored, markRestored]);

  if (!isRestored) return <BrandSplash />;
  return <Redirect href={entryRouteFor({ session, hasSeenOnboarding })} />;
}
