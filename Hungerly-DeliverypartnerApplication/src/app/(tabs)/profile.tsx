import * as LocalAuthentication from 'expo-local-authentication';
import * as Linking from 'expo-linking';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { API_BASE, APP_ENV, APP_VERSION, SUPPORT_PHONE } from '@/lib/config';
import { initials, vehicleLabel } from '@/lib/format';
import { stopTracking } from '@/lib/location';
import { getAppLock, setAppLock } from '@/lib/secure';
import { useSession } from '@/lib/session';
import { colors, ConfirmDialog, Icon, type IconName, radius, screenGutter, spacing, Text } from '@/ui';
import { formatE164India } from '@/ui/shared';

export default function Profile() {
  const insets = useSafeAreaInsets();
  const partner = useSession((s) => s.partner);
  const signOut = useSession((s) => s.signOut);
  const [lock, setLock] = useState(false);
  const [lockAvailable, setLockAvailable] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);

  useEffect(() => {
    void getAppLock().then(setLock);
    void Promise.all([LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync()]).then(([h, e]) => setLockAvailable(h && e));
  }, []);

  const toggleLock = async (on: boolean) => {
    if (on) {
      const res = await LocalAuthentication.authenticateAsync({ promptMessage: 'Confirm to turn on app lock' });
      if (!res.success) return;
    }
    await setAppLock(on);
    setLock(on);
  };

  const doSignOut = async () => {
    setConfirmOut(false);
    if (partner?.is_online) {
      Alert.alert('Go offline first', 'Turn off duty on the Home tab before signing out.');
      return;
    }
    await stopTracking();
    await signOut();
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}>
      <View style={styles.head}>
        <View style={styles.avatar}>
          <Text variant="h1" color="secondary">{initials(partner?.full_name)}</Text>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="h2">{partner?.full_name ?? 'Partner'}</Text>
          <Text variant="bodySmall" color="textSecondary">{partner?.phone_e164 ? formatE164India(partner.phone_e164) : ''}</Text>
          <View style={styles.ratingRow}>
            <Icon name="star" size="sm" color="rating" />
            <Text variant="label">{partner?.rating.count ? partner.rating.average.toFixed(1) : 'New'}</Text>
            {!!partner?.rating.count && <Text variant="caption" color="textTertiary">· {partner.rating.count} ratings</Text>}
          </View>
        </View>
      </View>

      <Section title="Vehicle">
        <Row icon="bicycle-outline" label={vehicleLabel(partner?.vehicle_type)} value={partner?.vehicle_registration ?? undefined} />
        <Row icon="shield-checkmark-outline" label="Verified partner" valueTone="success" value="Active" last />
      </Section>

      <Section title="Security">
        <View style={[styles.row, styles.lastRow]}>
          <Icon name="finger-print" color="textSecondary" />
          <View style={{ flex: 1 }}>
            <Text variant="body">App lock</Text>
            {!lockAvailable && <Text variant="caption" color="textTertiary">Set a screen lock on your phone first</Text>}
          </View>
          <Switch
            value={lock}
            disabled={!lockAvailable}
            onValueChange={(v) => void toggleLock(v)}
            trackColor={{ true: colors.success, false: colors.borderStrong }}
            thumbColor={colors.surface}
          />
        </View>
      </Section>

      <Section title="Help">
        <Row icon="call-outline" label="Call support" onPress={() => void Linking.openURL(`tel:${SUPPORT_PHONE}`)} />
        <Row icon="document-text-outline" label="Terms & privacy" onPress={() => void Linking.openURL('https://hungerly.app/partner/terms')} last />
      </Section>

      <Pressable style={styles.signOut} onPress={() => setConfirmOut(true)} accessibilityRole="button">
        <Icon name="log-out-outline" color="error" />
        <Text variant="button" color="error">Sign out</Text>
      </Pressable>
      <Text variant="caption" color="textTertiary" align="center">
        v{APP_VERSION}
        {APP_ENV !== 'production' ? ' · dev' : ''}
      </Text>

      <ConfirmDialog
        visible={confirmOut}
        title="Sign out?"
        message="You'll need an OTP to sign in again. Your trips and earnings are safe."
        confirmLabel="Sign out"
        destructive
        onConfirm={() => void doSignOut()}
        onCancel={() => setConfirmOut(false)}
      />
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: spacing.sm }}>
      <Text variant="label" color="textTertiary">{title.toUpperCase()}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function Row({
  icon,
  label,
  value,
  valueTone,
  onPress,
  last,
}: {
  icon: IconName;
  label: string;
  value?: string;
  valueTone?: 'success';
  onPress?: () => void;
  last?: boolean;
}) {
  const body = (
    <View style={[styles.row, last && styles.lastRow]}>
      <Icon name={icon} color="textSecondary" />
      <Text variant="body" style={{ flex: 1 }}>{label}</Text>
      {value && <Text variant="bodySmall" color={valueTone ?? 'textTertiary'}>{value}</Text>}
      {onPress && <Icon name="chevron-forward" size="sm" color="textTertiary" />}
    </View>
  );
  return onPress ? <Pressable onPress={onPress} accessibilityRole="button">{body}</Pressable> : body;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: screenGutter, paddingBottom: spacing['3xl'], gap: spacing.xl },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  avatar: { width: 72, height: 72, borderRadius: 26, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  card: { borderRadius: radius.card, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  lastRow: { borderBottomWidth: 0 },
  signOut: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, height: 52, borderRadius: radius.button, backgroundColor: colors.errorSoft },
});
