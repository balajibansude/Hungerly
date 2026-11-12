import { Image, type ImageSource } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { colors } from '../theme/colors';
import { spacing } from '../theme/layout';
import { Text } from './Text';

export interface BrandSplashProps {
  /** Brand name, spoken to screen readers and shown when there is no logo. */
  name: string;
  /** Logo artwork (square). Rendered with `contain`, so its aspect ratio is never altered. */
  logo?: ImageSource | number;
  /** Optional line under the brand. */
  tagline?: string;
}

/**
 * Short, quiet startup screen on white: continues the native splash (same background and
 * logo) while the session is restored, then the app routes straight on.
 */
export function BrandSplash({ name, logo, tagline }: BrandSplashProps) {
  return (
    <View style={styles.container} accessible accessibilityLabel={`${name} is loading`}>
      <StatusBar style="dark" />
      <Animated.View entering={FadeIn.duration(250)} style={styles.brand}>
        {logo !== undefined ? (
          <Image source={logo} style={styles.logo} contentFit="contain" />
        ) : (
          <Text variant="brand" color="primary">
            {name}
          </Text>
        )}
        {tagline && (
          <Text variant="body" color="textSecondary">
            {tagline}
          </Text>
        )}
      </Animated.View>
      <Animated.View entering={FadeIn.delay(600)} style={styles.loader}>
        <ActivityIndicator color={colors.primary} />
      </Animated.View>
    </View>
  );
}

/** Splash logo size; matches `imageWidth` of the native splash so the hand-off is seamless. */
export const BRAND_SPLASH_LOGO_SIZE = 200;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  brand: { alignItems: 'center', gap: spacing.xs },
  logo: { width: BRAND_SPLASH_LOGO_SIZE, height: BRAND_SPLASH_LOGO_SIZE },
  loader: { position: 'absolute', bottom: spacing['5xl'] },
});
