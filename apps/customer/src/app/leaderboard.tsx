import {
  colors,
  Icon,
  radius,
  Screen,
  ScreenHeader,
  screenGutter,
  spacing,
  Text,
  type IconName,
} from '@hungerly/ui';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { useSessionStore } from '@/features/auth/session';
import { LeaderboardPodium } from '@/features/leaderboard/components/LeaderboardPodium';
import { MyRankCard } from '@/features/leaderboard/components/MyRankCard';
import {
  daysLeftInMonth,
  monthLabel,
  rankCity,
  REWARDED_PLACES,
  type LeaderboardEntry,
} from '@/features/leaderboard/ranking';
import { currentCustomerSample, defaultAddress, leaderboardEntries } from '@/mock';

const RULES: { icon: IconName; title: string; body: string }[] = [
  {
    icon: 'bag-check-outline',
    title: 'Completed orders come first',
    body: 'Only delivered orders count. Cancelled or refunded orders are not included.',
  },
  {
    icon: 'wallet-outline',
    title: 'Total spent breaks ties',
    body: 'When two customers have the same number of orders, the one who spent more ranks higher.',
  },
  {
    icon: 'location-outline',
    title: 'Ranked within your city',
    body: 'You only compete with customers in your delivery city. The board resets on the 1st.',
  },
];

/**
 * Monthly city leaderboard. UI prototype: totals come from sample data in `@/mock` and the
 * city from the sample delivery address — no backend integration yet.
 */
export default function LeaderboardScreen() {
  const user = useSessionStore((s) => s.session?.user);
  const now = useMemo(() => new Date(), []);
  const city = defaultAddress.city;

  const ranked = useMemo(() => {
    const entries: LeaderboardEntry[] = user
      ? [
          ...leaderboardEntries,
          { customerId: user.id, name: user.fullName ?? 'You', city, ...currentCustomerSample },
        ]
      : leaderboardEntries;
    return rankCity(entries, city);
  }, [user, city]);

  const top = ranked.slice(0, REWARDED_PLACES);
  const me = user ? (ranked.find((e) => e.customerId === user.id) ?? null) : null;
  const daysLeft = daysLeftInMonth(now);

  return (
    <Screen>
      <ScreenHeader
        title="City Leaderboard"
        subtitle={`${city} · ${monthLabel(now)}`}
        onBack={() => (router.canGoBack() ? router.back() : router.navigate('/profile'))}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.heroBadge}>
              <Icon name="calendar-outline" size="sm" color="primaryText" />
              <Text variant="caption" color="primaryText">
                {monthLabel(now)}
              </Text>
            </View>
            <Text variant="caption" color="textSecondary">
              {daysLeft} {daysLeft === 1 ? 'day' : 'days'} left
            </Text>
          </View>
          <Text variant="h2">Top foodies of {city}</Text>
          <View style={styles.reward}>
            <Icon name="gift" color="onAccentSoft" />
            <Text variant="bodySmall" color="onAccentSoft" style={styles.flex}>
              The top {REWARDED_PLACES} customers this month unlock exclusive offers for{' '}
              {monthLabel(now, 1)}.
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text variant="label" color="textTertiary" accessibilityRole="header">
            TOP {REWARDED_PLACES} THIS MONTH
          </Text>
          <View style={styles.podiumCard}>
            <LeaderboardPodium top={top} currentCustomerId={user?.id} />
          </View>
        </View>

        <MyRankCard
          me={me}
          thirdPlace={ranked[REWARDED_PLACES - 1]}
          total={ranked.length}
          onLogin={() => router.push({ pathname: '/login', params: { reason: 'account' } })}
        />

        <View style={styles.section}>
          <Text variant="label" color="textTertiary" accessibilityRole="header">
            HOW RANKING WORKS
          </Text>
          <View style={styles.rules}>
            {RULES.map((rule) => (
              <View key={rule.title} style={styles.rule}>
                <View style={styles.ruleIcon}>
                  <Icon name={rule.icon} color="textSecondary" />
                </View>
                <View style={styles.flex}>
                  <Text variant="label">{rule.title}</Text>
                  <Text variant="bodySmall" color="textSecondary">
                    {rule.body}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        <Text variant="caption" color="textTertiary" align="center">
          Swaadone prototype · leaderboard shows sample data
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: screenGutter, paddingTop: spacing.xs, gap: spacing['2xl'] },
  flex: { flex: 1 },
  hero: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.primarySoftBorder,
    backgroundColor: colors.primarySoft,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  reward: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
  },
  section: { gap: spacing.sm },
  podiumCard: {
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.md,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  rules: {
    gap: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    backgroundColor: colors.card,
  },
  rule: { flexDirection: 'row', gap: spacing.md },
  ruleIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
});
