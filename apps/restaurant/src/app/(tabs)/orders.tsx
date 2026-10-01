import { UpcomingTab } from '@/features/shell/UpcomingTab';

/** Live order board (R8) and order detail (R9) are built in a later phase. */
export default function OrdersScreen() {
  return (
    <UpcomingTab
      title="Orders"
      icon="receipt-outline"
      heading="Live orders"
      message="New, preparing and ready orders — with accept, reject and mark-ready — arrive in the next build."
    />
  );
}
