import { BrandSplash } from '@hungerly/ui';
import { Redirect } from 'expo-router';
import { useEffect } from 'react';

import { entryRouteFor, useSessionStore } from '@/features/auth/session';
import { brand } from '@/features/brand/brand';
import { useServices } from '@/services';

/**
 * Startup: a short white splash with the logo while the saved session is checked, then
 * straight to Home — signed in or as a guest. There is no intro to tap through.
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

  if (!isRestored) return <BrandSplash name={brand.name} logo={brand.logo} />;
  return <Redirect href={entryRouteFor({ session })} />;
}
