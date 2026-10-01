import { UpcomingTab } from '@/features/shell/UpcomingTab';

/** Dashboard (today's orders, revenue, status counts) is built in a later phase. */
export default function DashboardScreen() {
  return (
    <UpcomingTab
      title="Dashboard"
      icon="grid-outline"
      heading="Today at a glance"
      message="Today’s orders, revenue and kitchen status will appear here in the next build."
    />
  );
}
