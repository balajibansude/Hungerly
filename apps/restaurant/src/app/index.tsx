import { BrandSplash, EmptyState, Screen } from '@hungerly/ui';
import { Redirect } from 'expo-router';
import { useEffect } from 'react';

import { entryRouteFor, useSessionStore } from '@/features/auth/session';
import { brand } from '@/features/brand/brand';
import { API_BASE_URL } from '@/lib/api';

/**
 * Splash + routing gate. Restores the saved session (refresh token in secure storage →
 * `GET /partner/me`), then sends the owner to login, first-time onboarding or the workspace.
 */
export default function Index() {
  const isRestored = useSessionStore((s) => s.isRestored);
  const session = useSessionStore((s) => s.session);
  const restore = useSessionStore((s) => s.restore);

  useEffect(() => {
    if (!isRestored && API_BASE_URL) restore().catch(() => undefined);
  }, [isRestored, restore]);

  if (!API_BASE_URL) {
    return (
      <Screen edges={['top', 'bottom']}>
        <EmptyState
          icon="cloud-offline-outline"
          title="Server address not set"
          message="This build has no API address. Set EXPO_PUBLIC_API_URL (see apps/restaurant/README.md) and restart the app."
        />
      </Screen>
    );
  }
  if (!isRestored) {
    return <BrandSplash name={brand.name} logo={brand.logo} tagline="Partner · run your restaurant" />;
  }
  return <Redirect href={entryRouteFor(session)} />;
}

