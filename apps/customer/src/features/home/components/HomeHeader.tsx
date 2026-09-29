import type { Address } from '@hungerly/types';
import { Icon, screenGutter, spacing, Text } from '@hungerly/ui';
import { StyleSheet, View } from 'react-native';

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
      <View
        style={styles.location}
        accessible
        accessibilityLabel={
          address
            ? `Delivering to ${labels[address.label]}, ${address.locality}, ${address.city}`
            : 'Finding your location'
        }
      >
        <Icon name="location" color="primary" />
        <View style={styles.flex}>
          <Text variant="label" numberOfLines={1}>
            {address ? labels[address.label] : 'Locating…'}
          </Text>
          <Text variant="bodySmall" color="textSecondary" numberOfLines={1}>
            {address
              ? `${address.line2 ? `${address.line2}, ` : ''}${address.locality}, ${address.city}`
              : ' '}
          </Text>
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
  location: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  greeting: { gap: spacing.xxs },
});
