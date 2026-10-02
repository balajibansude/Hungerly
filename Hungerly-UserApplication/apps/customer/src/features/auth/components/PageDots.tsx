import { colors, radius, spacing } from '@hungerly/ui';
import { StyleSheet, View } from 'react-native';
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';

interface PageDotsProps {
  count: number;
  /** Scroll progress in pages (0 … count-1), driven by the pager's scroll position. */
  progress: SharedValue<number>;
}

/** Pagination dots that stretch toward the active page as the user swipes. */
export function PageDots({ count, progress }: PageDotsProps) {
  return (
    <View
      style={styles.row}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      {Array.from({ length: count }, (_, index) => (
        <Dot key={index} index={index} progress={progress} />
      ))}
    </View>
  );
}

function Dot({ index, progress }: { index: number; progress: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const distance = Math.min(Math.abs(progress.get() - index), 1);
    return {
      width: interpolate(distance, [0, 1], [24, 8]),
      backgroundColor: interpolateColor(distance, [0, 1], [colors.primary, colors.borderStrong]),
    };
  });
  return <Animated.View style={[styles.dot, style]} />;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  dot: { height: 8, borderRadius: radius.pill },
});
