import type { Offer } from '@hungerly/types';
import { colors, Icon, PressableScale, radius, screenGutter, spacing, Text } from '@hungerly/ui';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

/**
 * Offers as calm, text-first cards on the brand ink colour. No imagery: offers must be
 * readable at a glance and should not compete with food photos below.
 */
export function PromoCarousel({
  offers,
  onPress,
}: {
  offers: Offer[];
  onPress: (offer: Offer) => void;
}) {
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(width - screenGutter * 2 - spacing['2xl'], 340);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      snapToInterval={cardWidth + spacing.md}
      decelerationRate="fast"
      contentContainerStyle={styles.rail}
    >
      {offers.map((offer, index) => (
        <PressableScale
          key={offer.id}
          onPress={() => onPress(offer)}
          accessibilityRole="button"
          accessibilityLabel={`${offer.label}. ${offer.description}${offer.code ? `. Code ${offer.code}` : ''}`}
          style={[styles.card, { width: cardWidth }, index % 2 === 1 && styles.alt]}
        >
          <View style={styles.iconBadge}>
            <Icon name="sparkles" color="secondary" />
          </View>
          <View style={styles.copy}>
            <Text variant="h2" color="onSecondary" numberOfLines={1}>
              {offer.label}
            </Text>
            <Text variant="bodySmall" color="onSecondary" numberOfLines={2} style={styles.muted}>
              {offer.description}
            </Text>
            {offer.code && (
              <View style={styles.code}>
                <Text variant="label" color="accent">
                  {offer.code}
                </Text>
              </View>
            )}
          </View>
        </PressableScale>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  rail: { paddingHorizontal: screenGutter, gap: spacing.md },
  card: {
    minHeight: 132,
    flexDirection: 'row',
    gap: spacing.lg,
    padding: spacing.xl,
    borderRadius: radius.card,
    backgroundColor: colors.secondary,
  },
  alt: { backgroundColor: colors.secondaryMuted },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  copy: { flex: 1, gap: spacing.xs },
  muted: { opacity: 0.8 },
  code: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.accent,
  },
});
