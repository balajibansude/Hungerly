import { Image, type ImageContentFit } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import type { ImageRef } from '../shared/types';

import { colors } from '../theme/colors';
import { radius as radii } from '../theme/layout';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export interface RemoteImageProps {
  image?: ImageRef;
  style?: StyleProp<ViewStyle>;
  radius?: keyof typeof radii;
  contentFit?: ImageContentFit;
  /** Icon shown when there is no image or it failed to load. */
  fallbackIcon?: IconName;
  /** Set for images that duplicate adjacent text so screen readers skip them. */
  decorative?: boolean;
}

/**
 * Cached image with a neutral placeholder and a graceful fallback. Food imagery must
 * never leave a broken box: missing or failed images show a calm tile instead.
 */
export function RemoteImage({
  image,
  style,
  radius = 'image',
  contentFit = 'cover',
  fallbackIcon = 'restaurant-outline',
  decorative = false,
}: RemoteImageProps) {
  const [failed, setFailed] = useState(false);
  const container = [styles.base, { borderRadius: radii[radius] }, style];

  if (!image || failed) {
    return (
      <View
        style={[container, styles.fallback]}
        accessible={!decorative}
        accessibilityRole="image"
        accessibilityLabel={image?.alt}
      >
        <Icon name={fallbackIcon} size="lg" color="textTertiary" />
      </View>
    );
  }

  return (
    <View style={container}>
      <Image
        source={{ uri: image.uri }}
        style={StyleSheet.absoluteFill}
        contentFit={contentFit}
        transition={200}
        cachePolicy="memory-disk"
        onError={() => setFailed(true)}
        accessible={!decorative}
        accessibilityLabel={decorative ? undefined : image.alt}
      />
    </View>
  );
}

export interface AvatarProps {
  name: string | null;
  size?: number;
}

/** Initials avatar. Profile photos come later with the backend. */
export function Avatar({ name, size = 48 }: AvatarProps) {
  const initials = (name ?? '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
  return (
    <View
      style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={name ? `${name}'s avatar` : 'Profile'}
    >
      {initials ? (
        <Text variant="h3" color="onSecondary">
          {initials}
        </Text>
      ) : (
        <Icon name="person" color="onSecondary" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { overflow: 'hidden', backgroundColor: colors.imagePlaceholder },
  fallback: { alignItems: 'center', justifyContent: 'center' },
  avatar: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.secondary },
});
