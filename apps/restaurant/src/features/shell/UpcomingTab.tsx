import { EmptyState, Screen, type IconName } from '@hungerly/ui';

import { TabHeader } from './TabHeader';

export interface UpcomingTabProps {
  title: string;
  icon: IconName;
  heading: string;
  message: string;
}

/**
 * A navigation-shell tab whose feature is built in a later phase. Says so plainly instead
 * of showing fake controls.
 */
export function UpcomingTab({ title, icon, heading, message }: UpcomingTabProps) {
  return (
    <Screen edges={['top']}>
      <TabHeader title={title} />
      <EmptyState icon={icon} title={heading} message={message} />
    </Screen>
  );
}
