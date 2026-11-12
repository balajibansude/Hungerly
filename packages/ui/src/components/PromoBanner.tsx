import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import type { ImageRef } from '@hungerly/types';

import { colors } from '../theme/colors';
import { radius, spacing } from '../theme/layout';
import { fontFamily } from '../theme/typography';
import { Icon } from './Icon';
import { RemoteImage } from './Media';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

export type PromoBannerTone = 'green' | 'orange' | 'pink' | 'blue';

const toneColor: Record<PromoBannerTone, string> = {
  green: colors.promoGreen,
  orange: colors.promoOrange,
  pink: colors.promoPink,
  blue: colors.promoBlue,
};

/** Banner colours in display order; lists cycle through them. */
export const PROMO_BANNER_TONES: readonly PromoBannerTone[] = ['green', 'orange', 'pink', 'blue'];

export interface PromoBannerProps {
  tone: PromoBannerTone;
  /** The big number, e.g. "30%" or "₹75". Comes from the offer's discount rule. */
  headline: string;
  /** Word under the headline, e.g. "OFF". */
  kicker?: string;
  title: string;
  /** Second line, e.g. "On orders above ₹249". */
  subtitle?: string;
  /** Small print such as a promo code or validity, only when the data has it. */
  footnote?: string;
  image?: ImageRef;
  onPress: () => void;
  accessibilityLabel: string;
  /** Visually muted (e.g. an expired offer). */
  muted?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Large promotional banner: a bold discount on a bright colour with a food photo cut into
 * a circle on the right. The multi-colour accents live here and nowhere else.
 */
export function PromoBanner({
  tone,
  headline,
  kicker,
  title,
  subtitle,
  footnote,
  image,
  onPress,
  accessibilityLabel,
  muted = false,
  style,
}: PromoBannerProps) {
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.banner,
        { backgroundColor: muted ? colors.textTertiary : toneColor[tone] },
        style,
      ]}
    >
      {/* Decorative rings, as in the reference kit. */}
      <View style={[styles.ring, styles.ringLarge]} pointerEvents="none" />
      <View style={[styles.ring, styles.ringSmall]} pointerEvents="none" />

      <View style={styles.copy}>
        <View style={styles.headlineRow}>
          <Text style={styles.headline} color="onPrimary" numberOfLines={1} adjustsFontSizeToFit>
            {headline}
          </Text>
          {kicker && (
            <Text variant="label" color="onPrimary" style={styles.kicker}>
              {kicker}
            </Text>
          )}
        </View>
        <Text variant="h3" color="onPrimary" numberOfLines={2}>
          {title}
        </Text>
        {subtitle && (
          <Text variant="bodySmall" color="onPrimary" numberOfLines={2} style={styles.strong}>
            {subtitle}
          </Text>
        )}
        {footnote && (
          <View style={styles.footnote}>
            <Text variant="label" color="onPrimary" numberOfLines={1}>
              {footnote}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.imageWrap}>
        {image ? (
          <RemoteImage image={image} decorative radius="pill" style={styles.image} />
        ) : (
          <View style={[styles.image, styles.iconTile]}>
            <Icon name="pricetags" size="hero" color="onPrimary" />
          </View>
        )}
      </View>
    </PressableScale>
  );
}

const IMAGE_SIZE = 116;

const styles = StyleSheet.create({
  banner: {
    minHeight: 160,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.xl,
    borderRadius: radius.xl,
    overflow: 'hidden',
  },
  ring: { position: 'absolute', borderRadius: radius.pill, borderColor: 'rgba(255,255,255,0.18)' },
  ringLarge: { width: 220, height: 220, right: -60, top: -50, borderWidth: 28 },
  ringSmall: { width: 90, height: 90, left: -30, bottom: -40, borderWidth: 16 },
  copy: { flex: 1, gap: spacing.xs },
  headlineRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.xs },
  headline: { fontFamily: fontFamily.extrabold, fontSize: 40, lineHeight: 46, letterSpacing: -1 },
  kicker: { marginBottom: spacing.sm, letterSpacing: 1 },
  strong: { fontFamily: fontFamily.semibold },
  footnote: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.85)',
  },
  imageWrap: {
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
    borderRadius: radius.pill,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.6)',
    overflow: 'hidden',
  },
  image: { width: '100%', height: '100%' },
  iconTile: { alignItems: 'center', justifyContent: 'center' },
});
