import { UpcomingTab } from '@/features/shell/UpcomingTab';

/** Insights (R15) are built in a later phase. */
export default function InsightsScreen() {
  return (
    <UpcomingTab
      title="Insights"
      icon="stats-chart-outline"
      heading="How the business is doing"
      message="Orders, revenue, average order value and popular dishes arrive in the next build."
    />
  );
}
