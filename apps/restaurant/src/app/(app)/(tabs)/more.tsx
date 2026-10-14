import {
  Badge,
  Card,
  colors,
  ConfirmDialog,
  Icon,
  screenGutter,
  spacing,
  Text,
  type IconName,
} from '@hungerly/ui';
import { formatE164India } from '@hungerly/utils';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSessionStore } from '@/features/auth/session';
import { useSignOut } from '@/features/auth/useSignOut';
import { BrandLogo } from '@/features/brand/BrandLogo';
import { brand } from '@/features/brand/brand';
import { branchStatusMeta } from '@/features/branch/status';
import { useActiveBranch } from '@/features/branch/useActiveBranch';
import { TabHeader } from '@/features/shell/TabHeader';

interface Entry {
  icon: IconName;
  label: string;
  hint: string;
  href: Href;
}

/** Everything that is not a daily tab: branch setup, compliance, growth and account. */
export default function MoreScreen() {
  const session = useSessionStore((s) => s.session);
  const { branch } = useActiveBranch();
  const { signOut, signingOut } = useSignOut();
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  const sections: { title: string; entries: Entry[] }[] = [
    {
      title: 'This branch',
      entries: [
        ...(branch
          ? [
              {
                icon: 'storefront-outline',
                label: 'Branch profile & setup',
                hint: 'Details, location, review status',
                href: { pathname: '/branches/[id]', params: { id: branch.id } },
              } satisfies Entry,
            ]
          : []),
        { icon: 'time-outline', label: 'Opening hours & holidays', hint: 'Sessions, breaks, closures', href: '/hours' },
        { icon: 'document-text-outline', label: 'Licence & documents', hint: 'FSSAI licence and verification', href: '/documents' },
        { icon: 'card-outline', label: 'Bank account for payouts', hint: 'Masked details and verification', href: '/wallet/payout-account' },
        { icon: 'shield-checkmark-outline', label: 'Restaurant declaration', hint: 'What you agreed to and when', href: '/declaration' },
      ],
    },
    {
      title: 'Grow',
      entries: [
        { icon: 'bar-chart-outline', label: 'Reports & analytics', hint: 'Sales trends and order summaries', href: '/reports' },
        { icon: 'pricetags-outline', label: 'Offers & coupons', hint: 'Create and track coupons', href: '/coupons' },
        { icon: 'star-outline', label: 'Ratings & reviews', hint: 'Read and reply to customers', href: '/reviews' },
      ],
    },
    {
      title: 'Account',
      entries: [
        { icon: 'business-outline', label: 'Your branches', hint: 'Switch, add or review branches', href: '/branches' },
        { icon: 'briefcase-outline', label: 'Business profile', hint: 'Legal name and GSTIN', href: '/business' },
        { icon: 'settings-outline', label: 'Settings & notifications', hint: 'Your name and alerts', href: '/settings' },
        { icon: 'help-buoy-outline', label: 'Help & support', hint: 'Get help from Swaadone', href: '/support' },
      ],
    },
  ];

  const user = session?.user;
  const meta = branch ? branchStatusMeta[branch.status] : null;

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <TabHeader title="More" />
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.profile}>
          <View style={styles.avatar}>
            <Icon name="person" color="primary" />
          </View>
          <View style={styles.flex}>
            <Text variant="h3" numberOfLines={1}>
              {user?.fullName ?? 'Restaurant owner'}
            </Text>
            <Text variant="bodySmall" color="textSecondary" numberOfLines={1}>
              {user?.phoneE164 ? formatE164India(user.phoneE164) : (user?.email ?? '')}
            </Text>
            {session?.business && (
              <Text variant="bodySmall" color="textSecondary" numberOfLines={1}>
                {session.business.legalName}
              </Text>
            )}
          </View>
          <Badge label="Owner" tone="offer" />
        </Card>

        {branch && meta && (
          <Card style={styles.branchCard}>
            <View style={styles.row}>
              <Text variant="label" color="textSecondary" style={styles.flex}>
                Current branch
              </Text>
              <Badge label={meta.label} tone={meta.tone} />
            </View>
            <Text variant="h3">{branch.name}</Text>
            <Text variant="bodySmall" color="textSecondary">
              {meta.hint}
            </Text>
          </Card>
        )}

        {sections.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text variant="label" color="textSecondary" accessibilityRole="header">
              {section.title}
            </Text>
            <View style={styles.group}>
              {section.entries.map((entry, index) => (
                <Pressable
                  key={entry.label}
                  onPress={() => router.push(entry.href)}
                  accessibilityRole="button"
                  accessibilityLabel={entry.label}
                  accessibilityHint={entry.hint}
                  style={({ pressed }) => [styles.entry, index > 0 && styles.divider, pressed && styles.pressed]}
                >
                  <View style={styles.entryIcon}>
                    <Icon name={entry.icon} color="primary" />
                  </View>
                  <View style={styles.flex}>
                    <Text variant="body">{entry.label}</Text>
                    <Text variant="caption" color="textTertiary">
                      {entry.hint}
                    </Text>
                  </View>
                  <Icon name="chevron-forward" size="sm" color="textTertiary" />
                </Pressable>
              ))}
            </View>
          </View>
        ))}

        <Pressable
          onPress={() => setConfirmSignOut(true)}
          accessibilityRole="button"
          disabled={signingOut}
          style={({ pressed }) => [styles.signOut, pressed && styles.pressed]}
        >
          <Icon name="log-out-outline" color="error" />
          <Text variant="label" color="error">
            {signingOut ? 'Signing out…' : 'Sign out'}
          </Text>
        </Pressable>

        <View style={styles.footer}>
          <BrandLogo height={32} />
          <Text variant="caption" color="textTertiary">
            {brand.appName}
          </Text>
        </View>
      </ScrollView>

      <ConfirmDialog
        visible={confirmSignOut}
        title="Sign out?"
        message="You will stop seeing new orders on this device until you sign in again."
        confirmLabel="Sign out"
        destructive
        onConfirm={() => {
          setConfirmSignOut(false);
          signOut().catch(() => undefined);
        }}
        onCancel={() => setConfirmSignOut(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: screenGutter, paddingBottom: spacing['3xl'], gap: spacing.xl },
  profile: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  branchCard: { gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  section: { gap: spacing.sm },
  group: { borderRadius: 16, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  entry: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.surface },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  entryIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  pressed: { backgroundColor: colors.surfacePressed },
  signOut: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderRadius: 16, backgroundColor: colors.errorSoft },
  footer: { alignItems: 'center', gap: spacing.xs },
});
