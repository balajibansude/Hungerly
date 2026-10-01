import { UpcomingTab } from '@/features/shell/UpcomingTab';

/** Menu management (R11–R13) is built in a later phase. */
export default function MenuScreen() {
  return (
    <UpcomingTab
      title="Menu"
      icon="restaurant-outline"
      heading="Your menu"
      message="Categories, dishes, prices and availability switches arrive in the next build."
    />
  );
}
