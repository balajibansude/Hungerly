import { AvailabilitySchema, HoursResponseSchema, paths } from '@hungerly/api-client';
import {
  Badge,
  Card,
  Divider,
  EmptyState,
  Screen,
  screenGutter,
  ScreenHeader,
  spacing,
  Switch,
  Text,
} from '@hungerly/ui';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { useActiveBranch } from '@/features/branch/useActiveBranch';
import { api } from '@/lib/api';
import { useApiQuery, useMutation } from '@/lib/hooks';
import { QueryView } from '@/features/shell/ScreenState';
import { formatIstDateTime } from '@/features/wallet/format';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const STATE_TONE = {
  open: 'success',
  on_break: 'warning',
  closed_for_day: 'neutral',
  not_open_yet: 'info',
  holiday: 'neutral',
  paused: 'warning',
  offline: 'neutral',
  not_active: 'neutral',
} as const;

const STATE_LABEL = {
  open: 'Open',
  on_break: 'On break',
  closed_for_day: 'Closed for today',
  not_open_yet: 'Not open yet',
  holiday: 'Holiday',
  paused: 'Paused',
  offline: 'Offline',
  not_active: 'Inactive',
} as const;

export default function HoursScreen() {
  const { branchId } = useActiveBranch();
  const query = useApiQuery(
    branchId ? paths.partner.hours(branchId) : null,
    HoursResponseSchema,
  );

  const { run: toggleOnline, pending: toggling } = useMutation(async (isAcceptingOrders: boolean) => {
    if (!branchId) return;
    await api.request('PUT', paths.partner.intake(branchId), {
      schema: AvailabilitySchema,
      body: { isAcceptingOrders },
    });
    query.refetch?.();
  });

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader onBack={() => router.back()} title="Opening hours" />
      <QueryView query={query} loadingLabel="Loading hours">
        {({ sessions, closures, availability: avail }) => (
          <ScrollView contentContainerStyle={styles.content}>
            <Card style={styles.statusCard}>
              <View style={styles.row}>
                <View style={styles.flex}>
                  <Text variant="label">Current status</Text>
                  <Text variant="caption" color="textSecondary">
                    {avail.reason}
                  </Text>
                </View>
                <Badge label={STATE_LABEL[avail.state]} tone={STATE_TONE[avail.state]} />
              </View>
              <Divider />
              <View style={styles.row}>
                <View style={styles.flex}>
                  <Text variant="label">Accepting orders</Text>
                  <Text variant="caption" color="textSecondary">
                    Toggle to go online or offline
                  </Text>
                </View>
                <Switch
                  value={avail.acceptingOrders}
                  onValueChange={(v) => toggleOnline(v)}
                  disabled={toggling}
                  accessibilityLabel="Accepting orders"
                />
              </View>
              {avail.closesAt !== null && (
                <Text variant="caption" color="textSecondary">
                  Open until {formatIstDateTime(avail.closesAt)}
                </Text>
              )}
              {avail.nextOpenAt !== null && (
                <Text variant="caption" color="textSecondary">
                  Next open: {formatIstDateTime(avail.nextOpenAt)}
                </Text>
              )}
            </Card>

            <Text variant="h3" style={styles.sectionTitle}>
              Weekly schedule
            </Text>
            {sessions.length === 0 ? (
              <EmptyState
                icon="time-outline"
                title="No hours set"
                message="Contact Swaadone support to configure your opening hours."
              />
            ) : (
              <Card style={styles.scheduleCard}>
                {sessions.map((session, idx) => (
                  <View key={`${session.dayOfWeek}-${session.opensAt}`}>
                    {idx > 0 && <Divider />}
                    <View style={styles.sessionRow}>
                      <Text variant="label" style={styles.dayLabel}>
                        {DAY_NAMES[session.dayOfWeek]}
                      </Text>
                      <Text variant="body" color="textSecondary">
                        {session.opensAt} – {session.closesAt}
                      </Text>
                    </View>
                  </View>
                ))}
              </Card>
            )}

            {closures.length > 0 && (
              <>
                <Text variant="h3" style={styles.sectionTitle}>
                  Upcoming closures
                </Text>
                <Card style={styles.scheduleCard}>
                  {closures.map((closure, idx) => (
                    <View key={closure.id}>
                      {idx > 0 && <Divider />}
                      <View style={styles.sessionRow}>
                        <Text variant="label" style={styles.dayLabel}>
                          {closure.date}
                        </Text>
                        <Text variant="body" color="textSecondary">
                          {closure.note ?? 'Holiday'}
                        </Text>
                      </View>
                    </View>
                  ))}
                </Card>
              </>
            )}
          </ScrollView>
        )}
      </QueryView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg, paddingHorizontal: screenGutter, paddingBottom: spacing['3xl'] },
  statusCard: { padding: spacing.lg, gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1, gap: spacing.xs },
  sectionTitle: { marginTop: spacing.xs },
  scheduleCard: { gap: 0 },
  sessionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, paddingHorizontal: spacing.lg, gap: spacing.lg },
  dayLabel: { width: 36 },
});
