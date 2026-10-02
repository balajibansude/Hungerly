import type { RestaurantSummary } from '@hungerly/types';
import {
  Badge,
  Card,
  colors,
  Icon,
  radius,
  Rating,
  RemoteImage,
  spacing,
  Text,
} from '@hungerly/ui';
import { formatDistance, formatMinutesRange, formatMoney, formatPriceLevel } from '@hungerly/utils';
import { StyleSheet, View } from 'react-native';

export interface RestaurantCardProps {
  restaurant: RestaurantSummary;
  onPress: () => void;
  /** `featured`: tall image for horizontal carousels. `list`: full-width row card. */
  variant?: 'featured' | 'list';
  width?: number;
}

/** Everything needed to decide at a glance: what, how good, how fast, how far, how pricey. */
export function RestaurantCard({
  restaurant,
  onPress,
  variant = 'list',
  width,
}: RestaurantCardProps) {
  const eta = formatMinutesRange(restaurant.deliveryTimeMinutes);
  const distance = formatDistance(restaurant.distanceMeters);
  const label = [
    restaurant.name,
    restaurant.cuisines.join(', '),
    `rated ${restaurant.rating.average.toFixed(1)}`,
    `${eta}`,
    distance,
    `${formatMoney(restaurant.costForTwo)} for two`,
    restaurant.offer?.label,
    restaurant.isOpen ? undefined : 'currently closed',
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Card
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityHint="Opens the menu"
      style={width ? { width } : undefined}
    >
      <View>
        <RemoteImage
          image={restaurant.image}
          decorative
          radius="none"
          style={variant === 'featured' ? styles.featuredImage : styles.listImage}
        />
        {!restaurant.isOpen && (
          <View style={styles.closedOverlay}>
            <Badge label="Closed now" tone="dark" icon="time-outline" />
          </View>
        )}
        {restaurant.offer && restaurant.isOpen && (
          <View style={styles.offerRibbon}>
            <Icon name="pricetag" size="sm" color="onPrimary" />
            <Text variant="label" color="onPrimary" numberOfLines={1}>
              {restaurant.offer.label}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text variant="h3" numberOfLines={1} style={styles.flex}>
            {restaurant.name}
          </Text>
          <Rating rating={restaurant.rating} size="md" />
        </View>
        <Text variant="bodySmall" color="textSecondary" numberOfLines={1}>
          {restaurant.cuisines.join(' · ')}
        </Text>
        <View style={styles.metaRow}>
          <Meta icon="time-outline" text={eta} />
          <Dot />
          <Meta icon="navigate-outline" text={distance} />
          <Dot />
          <Text variant="metadata" color="textSecondary">
            {formatPriceLevel(restaurant.priceLevel)}
          </Text>
          {restaurant.isPureVeg && (
            <>
              <Dot />
              <Text variant="metadata" color="veg">
                Pure veg
              </Text>
            </>
          )}
        </View>
      </View>
    </Card>
  );
}

function Meta({ icon, text }: { icon: 'time-outline' | 'navigate-outline'; text: string }) {
  return (
    <View style={styles.meta}>
      <Icon name={icon} size="sm" color="textTertiary" />
      <Text variant="metadata" color="textSecondary">
        {text}
      </Text>
    </View>
  );
}

function Dot() {
  return <View style={styles.dot} />;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  featuredImage: { height: 168 },
  listImage: { height: 176 },
  closedOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.55)',
  },
  offerRibbon: {
    position: 'absolute',
    left: spacing.md,
    bottom: spacing.md,
    maxWidth: '85%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm + spacing.xxs,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
  },
  body: { padding: spacing.md + spacing.xxs, gap: spacing.xs },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xxs,
  },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  dot: { width: 3, height: 3, borderRadius: radius.pill, backgroundColor: colors.borderStrong },
});
