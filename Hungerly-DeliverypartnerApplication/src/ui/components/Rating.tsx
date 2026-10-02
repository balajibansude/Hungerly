import { StyleSheet, View } from 'react-native';

import type { RatingSummary } from '../shared/types';
import { formatCount, formatRating } from '../shared';

import { spacing } from '../theme/layout';
import { Icon } from './Icon';
import { Text } from './Text';

export interface RatingProps {
  rating: RatingSummary;
  /** Show the number of ratings next to the average. */
  showCount?: boolean;
  size?: 'sm' | 'md';
}

export function Rating({ rating, showCount = false, size = 'sm' }: RatingProps) {
  const average = formatRating(rating.average);
  const count = formatCount(rating.count);
  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`Rated ${average} out of 5${showCount ? ` from ${count} ratings` : ''}`}
    >
      <Icon name="star" size="sm" color="rating" />
      <Text variant={size === 'md' ? 'label' : 'metadata'} color="textPrimary">
        {average}
      </Text>
      {showCount && (
        <Text variant="metadata" color="textTertiary">
          ({count})
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
