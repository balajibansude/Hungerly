import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';

import { colors } from '../theme/colors';
import { spacing } from '../theme/layout';
import { Text } from './Text';

export interface BrandSplashProps {
  /** Line under the wordmark, e.g. the app's promise or audience. */
  tagline: string;
}

/**
 * Continues the native splash (same terracotta background) while the session is
 * restored, so the hand-off from native to JS is seamless instead of a white flash.
 */
export function BrandSplash({ tagline }: BrandSplashProps) {
  return (
    <View style={styles.container} accessible accessibilityLabel="Hungerly is loading">
      <StatusBar style="light" />
      <Animated.View entering={FadeInUp.duration(400)} style={styles.brand}>
        <Text variant="brand" color="onPrimary">
          hungerly
        </Text>
        <Text variant="body" color="onPrimary" style={styles.tagline}>
          {tagline}
        </Text>
      </Animated.View>
      <Animated.View entering={FadeIn.delay(500)} style={styles.loader}>
        <ActivityIndicator color={colors.onPrimary} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  brand: { alignItems: 'center', gap: spacing.xs },
  tagline: { opacity: 0.85 },
  loader: { position: 'absolute', bottom: spacing['5xl'] },
});
