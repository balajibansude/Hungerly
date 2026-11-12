import type { Address } from '@hungerly/types';
import { Icon, screenGutter, spacing, Text } from '@hungerly/ui';
import { StyleSheet, View } from 'react-native';

import { BrandLogo } from '@/features/brand/BrandLogo';

const labels: Record<Address['label'], string> = {
  home: 'Home',
  work: 'Work',
  other: 'Saved address',
};

export function HomeHeader({
  address,
  greeting,
  prompt,
}: {
  address?: Address;
  greeting: string;
  prompt: string;
}) {
  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <BrandLogo height={48} />
        <View
          style={styles.location}
          accessible
          accessibilityLabel={
            address
              ? `Delivering to ${labels[address.label]}, ${address.locality}, ${address.city}`
              : 'Delivery location not set yet'
          }
        >
          <Text variant="caption" color="textTertiary">
            Deliver to
          </Text>
          <View style={styles.addressRow}>
            <Icon name="location" size="sm" color="primary" />
            <Text variant="label" numberOfLines={1} style={styles.flex}>
              {address
                ? `${labels[address.label]} · ${address.locality}, ${address.city}`
                : 'Choose at checkout'}
            </Text>
          </View>
        </View>
      </View>
      <View style={styles.greeting}>
        <Text variant="h1" accessibilityRole="header">
          {greeting}
        </Text>
        <Text variant="body" color="textSecondary">
          {prompt}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: screenGutter, gap: spacing.lg, paddingTop: spacing.sm },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  location: { flex: 1, gap: spacing.xxs },
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  flex: { flex: 1 },
  greeting: { gap: spacing.xxs },
});
