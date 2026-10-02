import { usePanels } from '../lib/panels';
import { CustomerPanel } from './CustomerPanel';
import { OrderPanel } from './OrderPanel';
import { RestaurantPanel } from './RestaurantPanel';
import { RiderPanel } from './RiderPanel';

/** Renders the top panel of the stack. Escape / Back pops one level; the scrim or × closes all. */
export function PanelHost() {
  const { stack, back, close } = usePanels();
  const top = stack.at(-1);
  if (!top) return null;
  const nav = { onClose: close, onBack: stack.length > 1 ? back : undefined };
  switch (top.kind) {
    case 'order':
      return <OrderPanel key={`o-${top.id}`} id={top.id} {...nav} />;
    case 'customer':
      return <CustomerPanel key={`c-${top.id}`} id={top.id} {...nav} />;
    case 'rider':
      return <RiderPanel key={`r-${top.id}`} id={top.id} {...nav} />;
    case 'restaurant':
      return <RestaurantPanel key={`s-${top.id}`} id={top.id} {...nav} />;
  }
}

export interface PanelNav {
  onClose: () => void;
  onBack?: () => void;
}
