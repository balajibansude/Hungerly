import { colors, Icon, radius, spacing, Text } from '@hungerly/ui';
import { formatMoney } from '@hungerly/utils';
import { StyleSheet, View } from 'react-native';

import { restaurantInitials } from '@/features/restaurants/initials';

import { publicName, type RankedEntry } from '../ranking';

/** Medal colours: gold uses the rating star, silver a neutral grey, bronze the warm amber. */
const MEDAL = {
  1: colors.rating,
  2: colors.textMuted,
  3: colors.onAccentSoft,
} as const;

const PEDESTAL_HEIGHT = { 1: 72, 2: 52, 3: 40 } as const;

function Place({ entry, highlight }: { entry: RankedEntry; highlight: boolean }) {
  const rank = entry.rank as 1 | 2 | 3;
  const first = rank === 1;
  const name = highlight ? 'You' : publicName(entry.name);
  return (
    <View
      style={styles.place}
      accessible
      accessibilityLabel={`Rank ${rank}, ${name}, ${entry.completedOrders} completed orders, ${formatMoney(entry.totalSpent)} spent`}
      testID={`podium-${rank}`}
    >
      <Icon name={first ? 'trophy' : 'medal'} size={first ? 'xl' : 'lg'} tint={MEDAL[rank]} />
      <View
        style={[
          styles.avatar,
          first && styles.avatarFirst,
          { borderColor: MEDAL[rank] },
          highlight && styles.avatarYou,
        ]}
      >
        <Text variant={first ? 'h2' : 'h3'} color="primaryText">
          {restaurantInitials(entry.name)}
        </Text>
      </View>
      <Text variant="label" numberOfLines={1} align="center">
        {name}
      </Text>
      <Text variant="caption" color="textSecondary" numberOfLines={1}>
        {entry.completedOrders} orders
      </Text>
      <Text variant="price" color="primaryText" numberOfLines={1}>
        {formatMoney(entry.totalSpent)}
      </Text>
      <View
        style={[
          styles.pedestal,
          { height: PEDESTAL_HEIGHT[rank] },
          first ? styles.pedestalFirst : styles.pedestalOther,
        ]}
      >
        <Text variant="h2" color={first ? 'onPrimary' : 'primaryText'}>
          {rank}
        </Text>
      </View>
    </View>
  );
}

/** Top three customers on a podium, laid out 2 · 1 · 3. */
export function LeaderboardPodium({
  top,
  currentCustomerId,
}: {
  top: RankedEntry[];
  currentCustomerId?: string;
}) {
  const order = [top[1], top[0], top[2]].filter((e): e is RankedEntry => e !== undefined);
  return (
    <View style={styles.podium}>
      {order.map((entry) => (
        <Place
          key={entry.customerId}
          entry={entry}
          highlight={entry.customerId === currentCustomerId}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  // Bottom padding keeps the rank blocks clear of the parent card's rounded, clipped corners.
  podium: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingBottom: spacing.lg,
  },
  place: { flex: 1, alignItems: 'center', gap: spacing.xxs },
  avatar: {
    width: 56,
    height: 56,
    marginVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  avatarFirst: { width: 72, height: 72 },
  avatarYou: { backgroundColor: colors.accentSoft },
  pedestal: {
    alignSelf: 'stretch',
    marginTop: spacing.sm,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pedestalFirst: { backgroundColor: colors.primary },
  pedestalOther: {
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primarySoftBorder,
  },
});
