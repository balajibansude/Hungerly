import { EmptyState, Screen, type IconName } from '@hungerly/ui';

import { TabHeader } from './TabHeader';

export interface UpcomingTabProps {
  title: string;
  icon: IconName;
  heading: string;
  message: string;
}

/** Placeholder for a tab that is built in a future phase. */
export function UpcomingTab({ title, icon, heading, message }: UpcomingTabProps) {
  return (
    <Screen edges={['top', 'bottom']}>
      <TabHeader title={title} />
      <EmptyState icon={icon} title={heading} message={message} />
    </Screen>
  );
}
