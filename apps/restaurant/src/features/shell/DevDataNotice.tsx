import { Badge } from '@hungerly/ui';

/**
 * Shown wherever figures include rows created by the development seed script, so sample
 * data is never mistaken for real business data.
 */
export function DevDataNotice({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return <Badge tone="warning" icon="flask-outline" label="Includes development sample data" />;
}
