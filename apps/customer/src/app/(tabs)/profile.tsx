import {
  Avatar,
  Badge,
  Button,
  Card,
  colors,
  Divider,
  Icon,
  screenGutter,
  spacing,
  Text,
  type IconName,
} from '@hungerly/ui';
import { formatE164India } from '@hungerly/utils';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSessionStore } from '@/features/auth/session';
import { useCartStore } from '@/features/cart/store';
import { useServices } from '@/services';

const upcoming: { icon: IconName; label: string }[] = [
  { icon: 'location-outline', label: 'Saved addresses' },
  { icon: 'heart-outline', label: 'Favourites' },
  { icon: 'card-outline', label: 'Payment methods' },
  { icon: 'notifications-outline', label: 'Notifications' },
  { icon: 'help-buoy-outline', label: 'Help & support' },
];

export default function ProfileScreen() {
  const { auth } = useServices();
  const user = useSessionStore((s) => s.session?.user);
  const signOut = useSessionStore((s) => s.signOut);
  const clearCart = useCartStore((s) => s.clear);
  const [signingOut, setSigningOut] = useState(false);

  const onSignOut = async () => {
    setSigningOut(true);
    try {
      await auth.signOut();
    } finally {
      clearCart();
      // Protected routes send the user back to the entry gate, which shows login.
      signOut();
    }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="h1" accessibilityRole="header">
          Account
        </Text>

        <View style={styles.identity}>
          <Avatar name={user?.fullName ?? null} size={64} />
          <View style={styles.flex}>
            <Text variant="h2" numberOfLines={1}>
              {user?.fullName ?? 'Hungerly guest'}
            </Text>
            <Text variant="body" color="textSecondary">
              {user ? formatE164India(user.phoneE164) : ''}
            </Text>
            {user?.email && (
              <Text variant="bodySmall" color="textSecondary" numberOfLines={1}>
                {user.email}
              </Text>
            )}
          </View>
        </View>

        <Card>
          {upcoming.map((item, index) => (
            <View key={item.label}>
              {index > 0 && <Divider />}
              <View style={styles.row} accessible accessibilityLabel={`${item.label}, coming soon`}>
                <Icon name={item.icon} color="textSecondary" />
                <Text variant="body" style={styles.flex}>
                  {item.label}
                </Text>
                <Badge label="Soon" tone="neutral" />
              </View>
            </View>
          ))}
        </Card>

        <Button
          label="Log out"
          variant="outline"
          icon="log-out-outline"
          onPress={onSignOut}
          loading={signingOut}
          fullWidth
        />
        <Text variant="caption" color="textTertiary" align="center">
          Hungerly prototype · data shown is sample data
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  content: { padding: screenGutter, gap: spacing['2xl'] },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.card,
  },
});
