import type { RestaurantSummary } from '@hungerly/types';
import {
  Badge,
  Card,
  colors,
  elevation,
  Icon,
  IconButton,
  radius,
  RemoteImage,
  spacing,
  Text,
} from '@hungerly/ui';
import {
  formatDistance,
  formatMinutesRange,
  formatMoney,
  formatPriceLevel,
  formatRating,
} from '@hungerly/utils';
import { StyleSheet, View } from 'react-native';

import { opensAtLabel } from '@/features/food/availability';

import { RestaurantLogo } from './RestaurantLogo';

export const RESTAURANT_COVER_HEIGHT = 184;
export const RESTAURANT_LOGO_SIZE = 64;

export interface RestaurantCardProps {
  restaurant: RestaurantSummary;
  onPress: () => void;
  /** Bookmark state. The bookmark is hidden when `onToggleFavorite` is not given. */
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
}

/**
 * Large restaurant card: cover photo, the restaurant's logo across the photo edge, then
 * what decides an order at a glance — rating, cuisines, distance, delivery time, price.
 * Optional facts (starting price, rating, offer) only appear when the data has them.
 */
export function RestaurantCard({
  restaurant,
  onPress,
  isFavorite = false,
  onToggleFavorite,
}: RestaurantCardProps) {
  const eta = formatMinutesRange(restaurant.deliveryTimeMinutes);
  const distance = formatDistance(restaurant.distanceMeters);
  const hasRating = restaurant.rating.count > 0;
  const closed = !restaurant.isOpen;
  const opens = closed ? opensAtLabel(restaurant.opensAt) : null;
  const label = [
    restaurant.name,
    restaurant.cuisines.join(', '),
    hasRating ? `rated ${formatRating(restaurant.rating.average)}` : undefined,
    eta,
    distance,
    restaurant.startingPrice ? `dishes from ${formatMoney(restaurant.startingPrice)}` : undefined,
    restaurant.offer?.label,
    closed ? `currently closed${opens ? `, ${opens.toLowerCase()}` : ''}` : undefined,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <View style={styles.shadow}>
      <Card onPress={onPress} accessibilityLabel={label} accessibilityHint="Opens the menu">
        <View>
          <View style={closed && styles.grayscale}>
            <RemoteImage image={restaurant.image} decorative radius="none" style={styles.cover} />
          </View>
          {closed ? (
            <View style={styles.closedPill}>
              <Text variant="label" color="onSecondary" style={styles.closedText}>
                CLOSED
              </Text>
            </View>
          ) : (
            restaurant.startingPrice && (
              <Badge
                label={`From ${formatMoney(restaurant.startingPrice)}`}
                tone="dark"
                style={styles.priceBadge}
              />
            )
          )}
        </View>

        <View style={styles.logo}>
          <RestaurantLogo logo={restaurant.logo} name={restaurant.name} />
        </View>

        <View style={styles.body}>
          <View style={styles.titleRow}>
            <Text variant="h3" numberOfLines={1} style={styles.flex}>
              {restaurant.name}
            </Text>
            {hasRating && (
              <Badge label={formatRating(restaurant.rating.average)} tone="success" icon="star" />
            )}
          </View>
          <View style={styles.metaRow}>
            <Text variant="bodySmall" color="textSecondary" numberOfLines={1} style={styles.shrink}>
              {restaurant.cuisines.join(', ')}
            </Text>
            <Dot />
            <Text variant="bodySmall" color="textSecondary">
              {distance}
            </Text>
          </View>
          <View style={styles.metaRow}>
            <Icon name="time-outline" size="sm" color="textTertiary" />
            <Text variant="metadata" color="textSecondary">
              {eta}
            </Text>
            <Dot />
            <Text variant="metadata" color="textSecondary">
              {formatPriceLevel(restaurant.priceLevel)}
            </Text>
            {restaurant.isPureVeg && (
              <>
                <Dot />
                <Text variant="metadata" color="success">
                  Pure veg
                </Text>
              </>
            )}
          </View>
          {closed && (
            <View style={styles.metaRow}>
              <Icon name="time-outline" size="sm" color="textSecondary" />
              <Text variant="label" color="textSecondary">
                {opens ?? 'Closed now'}
              </Text>
            </View>
          )}
          {restaurant.offer && !closed && (
            <View style={styles.metaRow}>
              <Icon name="pricetag" size="sm" color="primaryText" />
              <Text variant="label" color="primaryText" numberOfLines={1} style={styles.shrink}>
                {restaurant.offer.label}
              </Text>
            </View>
          )}
        </View>
      </Card>

      {/* A sibling of the card, not a child, so screen readers can reach it on its own. */}
      {onToggleFavorite && (
        <IconButton
          icon={isFavorite ? 'bookmark' : 'bookmark-outline'}
          iconColor={isFavorite ? 'primary' : 'textPrimary'}
          variant="overlay"
          accessibilityLabel={
            isFavorite
              ? `Remove ${restaurant.name} from favourites`
              : `Save ${restaurant.name} to favourites`
          }
          onPress={onToggleFavorite}
          style={styles.favorite}
          testID={`favorite-${restaurant.id}`}
        />
      )}
    </View>
  );
}

function Dot() {
  return <View style={styles.dot} />;
}

const styles = StyleSheet.create({
  // Shadow lives on a wrapper: the card clips its children, which would clip iOS shadows.
  shadow: { borderRadius: radius.card, backgroundColor: colors.card, ...elevation.low },
  flex: { flex: 1 },
  shrink: { flexShrink: 1 },
  cover: { height: RESTAURANT_COVER_HEIGHT },
  grayscale: { filter: [{ grayscale: 1 }], opacity: 0.6 },
  closedPill: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.secondary,
  },
  closedText: { letterSpacing: 0.8 },
  priceBadge: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    paddingHorizontal: spacing.sm + spacing.xxs,
    paddingVertical: spacing.xs,
  },
  logo: {
    position: 'absolute',
    top: RESTAURANT_COVER_HEIGHT - RESTAURANT_LOGO_SIZE / 2,
    left: 0,
    right: 0,
    alignItems: 'center',
    pointerEvents: 'none',
  },
  body: {
    paddingTop: RESTAURANT_LOGO_SIZE / 2 + spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.xs,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + spacing.xxs },
  dot: { width: 3, height: 3, borderRadius: radius.pill, backgroundColor: colors.borderStrong },
  favorite: { position: 'absolute', top: spacing.md, right: spacing.md },
});
