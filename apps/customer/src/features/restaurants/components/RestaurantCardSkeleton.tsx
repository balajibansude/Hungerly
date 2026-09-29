import { Card, Skeleton, spacing } from '@hungerly/ui';
import { StyleSheet, View } from 'react-native';

/** Mirrors RestaurantCard's layout so nothing jumps when data arrives. */
export function RestaurantCardSkeleton({
  width,
  imageHeight = 176,
}: {
  width?: number;
  imageHeight?: number;
}) {
  return (
    <Card style={width ? { width } : undefined}>
      <Skeleton height={imageHeight} radius="none" />
      <View style={styles.body}>
        <Skeleton height={20} width="60%" />
        <Skeleton height={14} width="45%" />
        <Skeleton height={14} width="70%" />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.md + spacing.xxs, gap: spacing.sm },
});
