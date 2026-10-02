import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { dayLabel, isoDate, rupees } from '@/lib/format';
import { useEarnings } from '@/lib/queries';
import { colors, ErrorState, Icon, radius, screenGutter, Skeleton, spacing, Text } from '@/ui';

type Range = 'week' | 'last' | 'month';
const RANGES: { value: Range; label: string }[] = [
  { value: 'week', label: 'This week' },
  { value: 'last', label: 'Last week' },
  { value: 'month', label: '30 days' },
];

function rangeDates(r: Range): { from: string; to: string; days: number } {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  if (r === 'week') return { from: isoDate(monday), to: isoDate(now), days: 7 };
  if (r === 'last') {
    const start = new Date(monday);
    start.setDate(monday.getDate() - 7);
    const end = new Date(monday);
    end.setDate(monday.getDate() - 1);
    return { from: isoDate(start), to: isoDate(end), days: 7 };
  }
  const start = new Date(now);
  start.setDate(now.getDate() - 29);
  return { from: isoDate(start), to: isoDate(now), days: 30 };
}

export default function EarningsScreen() {
  const insets = useSafeAreaInsets();
  const [range, setRange] = useState<Range>('week');
  const { from, to, days } = useMemo(() => rangeDates(range), [range]);
  const q = useEarnings(from, to);
  const data = q.data;
  const [selected, setSelected] = useState<number | null>(null);

  const series = useMemo(() => {
    const byDate = new Map(data?.days.map((d) => [d.date, d]) ?? []);
    const start = new Date(`${from}T12:00:00`);
    return Array.from({ length: days }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = isoDate(d);
      const row = byDate.get(key);
      return { date: key, earned: row?.earned.amount_minor ?? 0, trips: row?.deliveries ?? 0 };
    });
  }, [data, from, days]);
  const max = Math.max(1, ...series.map((s) => s.earned));
  const sel = selected !== null ? series[selected] : null;
  const avg = data?.total_deliveries ? data.total_earned.amount_minor / data.total_deliveries : 0;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} tintColor={colors.primary} />}
    >
      <Text variant="h1" accessibilityRole="header">Earnings</Text>

      <View style={styles.segment}>
        {RANGES.map((r) => (
          <Pressable
            key={r.value}
            onPress={() => {
              setRange(r.value);
              setSelected(null);
            }}
            style={[styles.segItem, range === r.value && styles.segOn]}
            accessibilityRole="tab"
            accessibilityState={{ selected: range === r.value }}
          >
            <Text variant="label" color={range === r.value ? 'textPrimary' : 'textTertiary'}>{r.label}</Text>
          </Pressable>
        ))}
      </View>

      {q.isError ? (
        <ErrorState onRetry={() => void q.refetch()} />
      ) : (
        <>
          <Animated.View entering={FadeInUp.duration(380)} style={styles.hero}>
            <Text variant="caption" color="textInverse" style={styles.dim}>{sel ? dayLabel(`${sel.date}T12:00:00`) : 'Total earned'}</Text>
            {data ? <Text variant="brand" color="textInverse">{rupees(sel ? sel.earned : data.total_earned)}</Text> : <Skeleton height={52} width={160} />}
            <View style={styles.heroRow}>
              <HeroStat label="Trips" value={data ? String(sel ? sel.trips : data.total_deliveries) : '—'} />
              <HeroStat label="Per trip" value={data ? rupees(avg) : '—'} />
              <HeroStat label="Cash" value={data ? rupees(data.cash_in_hand) : '—'} />
            </View>
          </Animated.View>

          <View style={styles.card}>
            <View style={styles.chart}>
              {series.map((s, i) => (
                <Pressable key={s.date} style={styles.barCol} onPress={() => setSelected(selected === i ? null : i)} accessibilityLabel={`${s.date}: ${rupees(s.earned)}`}>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.bar,
                        { height: `${Math.max(4, (s.earned / max) * 100)}%`, backgroundColor: !s.earned ? colors.border : selected === i ? colors.secondary : colors.primary },
                      ]}
                    />
                  </View>
                  {range !== 'month' && (
                    <Text variant="caption" color={selected === i ? 'textPrimary' : 'textTertiary'}>{dayLabel(`${s.date}T12:00:00`).slice(0, 2)}</Text>
                  )}
                </Pressable>
              ))}
            </View>
          </View>

          <View style={[styles.card, styles.row]}>
            <View style={styles.cashIcon}>
              <Icon name="cash-outline" color="onAccentSoft" />
            </View>
            <View style={styles.flex}>
              <Text variant="label" color="textSecondary">Cash collected</Text>
              <Text variant="caption" color="textTertiary">Settled with your weekly payout</Text>
            </View>
            <Text variant="h3">{data ? rupees(data.cash_in_hand) : '—'}</Text>
          </View>
        </>
      )}
    </ScrollView>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.heroStat}>
      <Text variant="h3" color="textInverse">{value}</Text>
      <Text variant="caption" color="textInverse" style={styles.dim}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { paddingHorizontal: screenGutter, paddingBottom: spacing['3xl'], gap: spacing.lg },
  dim: { opacity: 0.7 },
  segment: { flexDirection: 'row', padding: 4, borderRadius: radius.md, backgroundColor: colors.surfaceMuted },
  segItem: { flex: 1, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: colors.surface },
  hero: { padding: spacing.xl, borderRadius: radius.card, backgroundColor: colors.secondary, gap: spacing.xs },
  heroRow: { flexDirection: 'row', marginTop: spacing.lg, paddingTop: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.18)' },
  heroStat: { flex: 1, gap: 2 },
  card: { padding: spacing.lg, borderRadius: radius.card, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 150 },
  barCol: { flex: 1, alignItems: 'center', gap: 6, height: '100%' },
  barTrack: { flex: 1, width: '100%', justifyContent: 'flex-end', alignItems: 'center' },
  bar: { width: '72%', maxWidth: 26, borderRadius: 6 },
  cashIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
});
