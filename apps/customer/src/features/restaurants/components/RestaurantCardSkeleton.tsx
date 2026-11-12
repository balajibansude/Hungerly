import { Card, colors, radius, Skeleton, spacing } from '@hungerly/ui';
import { StyleSheet, View } from 'react-native';

import { RESTAURANT_COVER_HEIGHT, RESTAURANT_LOGO_SIZE } from './RestaurantCard';

/** Mirrors RestaurantCard's layout so nothing jumps when data arrives. */
export function RestaurantCardSkeleton() {
  return (
    <Card>
      <Skeleton height={RESTAURANT_COVER_HEIGHT} radius="none" />
      <View style={styles.logo}>
        <Skeleton width={RESTAURANT_LOGO_SIZE} height={RESTAURANT_LOGO_SIZE} radius="lg" />
      </View>
      <View style={styles.body}>
        <Skeleton height={20} width="60%" />
        <Skeleton height={14} width="75%" />
        <Skeleton height={14} width="45%" />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  logo: {
    position: 'absolute',
    top: RESTAURANT_COVER_HEIGHT - RESTAURANT_LOGO_SIZE / 2,
    alignSelf: 'center',
    borderRadius: radius.lg,
    borderWidth: spacing.xs,
    borderColor: colors.card,
  },
  body: {
    paddingTop: RESTAURANT_LOGO_SIZE / 2 + spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
});
