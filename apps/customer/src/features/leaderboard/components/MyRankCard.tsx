import { Button, colors, Icon, radius, spacing, Text } from '@hungerly/ui';
import { formatMoney } from '@hungerly/utils';
import { Fragment } from 'react';
import { StyleSheet, View } from 'react-native';

import { REWARDED_PLACES, type RankedEntry } from '../ranking';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text variant="h3" numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text variant="caption" color="textSecondary" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** What the next place needs: orders to pass them, or extra spend when orders are level. */
function progressHint(me: RankedEntry, target: RankedEntry | undefined): string | null {
  if (me.rank <= REWARDED_PLACES)
    return 'You’re in the top 3 — keep it up to win next month’s offers!';
  if (!target) return null;
  const gap = target.completedOrders - me.completedOrders;
  if (gap > 0) {
    return `${gap + 1} more completed ${gap + 1 === 1 ? 'order' : 'orders'} to reach the top ${REWARDED_PLACES}`;
  }
  return `Spend a little more to pass #${REWARDED_PLACES} on equal orders`;
}

/** The signed-in customer's own position, or a sign-in prompt for guests. */
export function MyRankCard({
  me,
  thirdPlace,
  total,
  onLogin,
}: {
  me: RankedEntry | null;
  thirdPlace: RankedEntry | undefined;
  total: number;
  onLogin: () => void;
}) {
  if (!me) {
    return (
      <View style={styles.card} testID="my-rank-guest">
        <View style={styles.headerRow}>
          <View style={styles.rankTile}>
            <Icon name="person-outline" color="primaryText" />
          </View>
          <View style={styles.copy}>
            <Text variant="h3">See where you stand</Text>
            <Text variant="bodySmall" color="textSecondary">
              Log in to see your rank, completed orders and spending this month.
            </Text>
          </View>
        </View>
        <Button label="Log in" onPress={onLogin} fullWidth />
      </View>
    );
  }

  const hint = progressHint(me, thirdPlace);
  const stats = [
    { label: 'Your rank', value: `#${me.rank}` },
    { label: 'Completed orders', value: String(me.completedOrders) },
    { label: 'Total spent', value: formatMoney(me.totalSpent) },
  ];
  return (
    <View
      style={[styles.card, styles.cardMine]}
      accessible
      accessibilityLabel={`Your rank ${me.rank} of ${total}, ${me.completedOrders} completed orders, ${formatMoney(me.totalSpent)} spent. ${hint ?? ''}`}
      testID="my-rank"
    >
      <Text variant="label" color="primaryText">
        YOUR POSITION · {total} customers
      </Text>
      <View style={styles.stats}>
        {stats.map((s, i) => (
          <Fragment key={s.label}>
            {i > 0 && <View style={styles.separator} />}
            <Stat {...s} />
          </Fragment>
        ))}
      </View>
      {hint && (
        <View style={styles.hint}>
          <Icon name="trending-up" size="sm" color="onAccentSoft" />
          <Text variant="bodySmall" color="onAccentSoft" style={styles.copy}>
            {hint}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    backgroundColor: colors.card,
  },
  cardMine: {
    borderWidth: 1,
    borderColor: colors.primarySoftBorder,
    backgroundColor: colors.primarySoft,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rankTile: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  copy: { flex: 1 },
  stats: { flexDirection: 'row', alignItems: 'center' },
  stat: { flex: 1, alignItems: 'center', gap: spacing.xxs, paddingHorizontal: spacing.xs },
  separator: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    backgroundColor: colors.primarySoftBorder,
  },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.accentSoft,
  },
});
