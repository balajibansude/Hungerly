import { EmptyState, Screen } from '@hungerly/ui';

// Placeholder route: being implemented in this change set; replaced before release.
export default function PendingScreen() {
  return (
    <Screen edges={['top', 'bottom']}>
      <EmptyState icon="construct-outline" title="Being built" message="This screen is part of the current update." />
    </Screen>
  );
}
