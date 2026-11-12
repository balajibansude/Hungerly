import type { Order } from '@hungerly/api-client';
import { colors, orderStatusLabel, radius, spacing, Text } from '@hungerly/ui';
import { StyleSheet, View } from 'react-native';

import { formatClock } from '../format';

type TimelineEvent = Order['timeline'][0];
type Actor = TimelineEvent['actor'];

const actorLabels: Record<Actor, string> = {
  customer: 'Customer',
  restaurant: 'Restaurant',
  delivery_partner: 'Rider',
  system: 'Hungerly',
  admin: 'Hungerly support',
};

/** The order's recorded history (`order_status_events`), oldest first. */
export function OrderTimeline({ events }: { events: TimelineEvent[] }) {
  return (
    <View style={styles.list}>
      {events.map((event, index) => {
        const last = index === events.length - 1;
        return (
          <View
            key={`${event.status}:${event.at}`}
            style={styles.event}
            accessible
            accessibilityLabel={`${orderStatusLabel(event.status, 'partner')} at ${formatClock(event.at)} by ${actorLabels[event.actor]}`}
          >
            <View style={styles.rail}>
              <View style={[styles.dot, last && styles.dotCurrent]} />
              {!last && <View style={styles.line} />}
            </View>
            <View style={styles.text}>
              <Text variant="label">{orderStatusLabel(event.status, 'partner')}</Text>
              <Text variant="metadata" color="textSecondary">
                {formatClock(event.at)} · {actorLabels[event.actor]}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const DOT = 12;

const styles = StyleSheet.create({
  list: { gap: 0 },
  event: { flexDirection: 'row', gap: spacing.md, minHeight: 44 },
  rail: { width: DOT, alignItems: 'center' },
  dot: {
    width: DOT,
    height: DOT,
    marginTop: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.borderStrong,
  },
  dotCurrent: { backgroundColor: colors.primary },
  line: { flex: 1, width: 2, backgroundColor: colors.border, marginVertical: 2 },
  text: { flex: 1, paddingBottom: spacing.md },
});
