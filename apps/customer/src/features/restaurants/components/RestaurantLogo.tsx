import type { ImageRef } from '@hungerly/types';
import { colors, elevation, radius, RemoteImage, spacing, Text } from '@hungerly/ui';
import { StyleSheet, View } from 'react-native';

import { restaurantInitials } from '../initials';

/**
 * The restaurant's own logo on a white rounded tile. Logos are fitted, never cropped or
 * stretched. Without a logo, the tile shows the restaurant's monogram so cards stay
 * distinguishable instead of repeating one placeholder.
 */
export function RestaurantLogo({
  logo,
  name,
  size = 64,
}: {
  logo?: ImageRef;
  name: string;
  size?: number;
}) {
  return (
    <View
      style={[styles.tile, { width: size, height: size }]}
      testID={logo ? 'restaurant-logo-image' : 'restaurant-logo-fallback'}
    >
      {logo ? (
        <RemoteImage
          image={logo}
          decorative
          radius="md"
          contentFit="contain"
          fallbackIcon="storefront-outline"
          style={styles.image}
        />
      ) : (
        <Text variant="h3" color="primaryText" accessible={false}>
          {restaurantInitials(name)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...elevation.low,
  },
  image: { width: '100%', height: '100%', backgroundColor: colors.surface },
});
