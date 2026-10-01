import { BrandSplash } from '@hungerly/ui';
import { Redirect } from 'expo-router';
import { useEffect } from 'react';

import { entryRouteFor, useSessionStore } from '@/features/auth/session';
import { useOnboardingStore } from '@/features/onboarding/draft';
import { useServices } from '@/services';

/**
 * Splash + routing gate. Shows the brand while the saved session is checked, then sends
 * the user to login, onboarding, the registration-complete screen or the workspace.
 * Every auth and registration transition returns here so routing lives in one place.
 */
export default function Index() {
  const { auth } = useServices();
  const isRestored = useSessionStore((s) => s.isRestored);
  const session = useSessionStore((s) => s.session);
  const markRestored = useSessionStore((s) => s.markRestored);
  const registrationCompleted = useOnboardingStore((s) => s.completed !== null);

  useEffect(() => {
    if (isRestored) return;
    auth
      .restoreSession()
      .then(markRestored)
      .catch(() => markRestored(null));
  }, [auth, isRestored, markRestored]);

  if (!isRestored) return <BrandSplash tagline="Partner · run your restaurant" />;
  return <Redirect href={entryRouteFor(session, { registrationCompleted })} />;
}
