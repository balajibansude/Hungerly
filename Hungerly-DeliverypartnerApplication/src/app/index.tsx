import { Redirect } from 'expo-router';
import { useEffect } from 'react';

import { useSession } from '@/lib/session';
import { ErrorState, LoadingState, Screen } from '@/ui';

/** Entry gate: sends the rider to the right place for their account state. */
export default function Index() {
  const phase = useSession((s) => s.phase);
  const partner = useSession((s) => s.partner);
  const reload = useSession((s) => s.reloadPartner);

  useEffect(() => {
    if (phase === 'signedIn' && !partner) void reload().catch(() => undefined);
  }, [phase, partner, reload]);

  if (phase === 'signedOut') return <Redirect href="/login" />;
  if (phase === 'signedIn' && !partner) {
    // Signed in but launched offline: wait for the network instead of logging the rider out.
    return (
      <Screen>
        <ErrorState title="You're offline" message="Reconnect to the internet to continue." onRetry={() => void reload().catch(() => undefined)} />
      </Screen>
    );
  }
  if (!partner) return <LoadingState />;
  if (partner.status === 'onboarding' || partner.status === 'rejected') return <Redirect href="/onboarding" />;
  if (partner.status !== 'active') return <Redirect href="/review" />;
  return <Redirect href="/home" />;
}
