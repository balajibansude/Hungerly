import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';

import { brand } from './brand';

/**
 * The Swaadone logo at a given height. The width follows the artwork's aspect ratio and
 * the image is contained, never cropped or stretched.
 */
export function BrandLogo({ height }: { height: number }) {
  return (
    <Image
      source={brand.logo}
      style={[styles.logo, { height, width: height * brand.logoAspectRatio }]}
      contentFit="contain"
      accessible
      accessibilityRole="image"
      accessibilityLabel={brand.name}
      testID="brand-logo"
    />
  );
}

const styles = StyleSheet.create({
  logo: { flexShrink: 0 },
});
