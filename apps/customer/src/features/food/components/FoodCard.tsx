import type { Food } from '@hungerly/types';
import {
  colors,
  FOOD_ADD_BUTTON_SIZE,
  FoodCartControl,
  FoodTypeMark,
  Icon,
  radius,
  RemoteImage,
  spacing,
  Text,
} from '@hungerly/ui';
import { formatMoney, formatRating, subtractMoney } from '@hungerly/utils';
import { Pressable, StyleSheet, View } from 'react-native';

import { MAX_LINE_QUANTITY } from '@/features/cart/store';

import { opensAtLabel, type Availability } from '../availability';
import type { DishCartControls } from '../useDishCartControls';

export interface FoodCardProps {
  food: Food;
  restaurant: Availability & { name: string };
  controls: DishCartControls;
  /** Card width in points; the image is square-ish and scales with it. */
  width: number;
  /** Hide the restaurant line where it is already obvious (inside a restaurant's menu). */
  showRestaurant?: boolean;
}

const IMAGE_RATIO = 0.92;
const CONTROL_INSET = spacing.sm;

/** "Popular"/"Deal" while open; CLOSED replaces them while the restaurant is closed. */
function badgeFor(food: Food, closed: boolean): { label: string; closed: boolean } | null {
  if (closed) return { label: 'CLOSED', closed: true };
  if (food.isBestseller) return { label: 'Popular', closed: false };
  if (hasDeal(food)) return { label: 'Deal', closed: false };
  return null;
}

export function hasDeal(food: Pick<Food, 'price' | 'originalPrice'>): boolean {
  return (
    food.originalPrice !== undefined && food.originalPrice.amountMinor > food.price.amountMinor
  );
}

/**
 * The one dish card used on every customer screen. Large photo with a badge, rating and
 * the add control on it; restaurant, food-type mark, name, price (and deal) below.
 * Optional parts (rating, deal, opening time) only render when the data has them.
 *
 * Closed restaurant: the photo turns grayscale and fades, a dark CLOSED pill replaces the
 * badge, "Opens at …" is shown when known, and the add control goes grey. Text stays
 * fully readable.
 */
export function FoodCard({
  food,
  restaurant,
  controls,
  width,
  showRestaurant = true,
}: FoodCardProps) {
  const closed = !restaurant.isOpen;
  const unavailable = !food.isAvailable;
  const imageHeight = Math.round(width * IMAGE_RATIO);
  const badge = badgeFor(food, closed);
  const deal = hasDeal(food) && food.originalPrice ? food.originalPrice : null;
  const saving = deal ? subtractMoney(deal, food.price) : null;
  const opens = closed ? opensAtLabel(restaurant.opensAt) : null;

  const label = [
    food.name,
    showRestaurant ? `from ${restaurant.name}` : undefined,
    deal ? `${formatMoney(food.price)}, was ${formatMoney(deal)}` : formatMoney(food.price),
    food.rating ? `rated ${formatRating(food.rating.average)}` : undefined,
    closed ? `restaurant closed${opens ? `, ${opens.toLowerCase()}` : ''}` : undefined,
    !closed && unavailable ? 'currently unavailable' : undefined,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <View style={{ width }} testID={`food-card-${food.id}`}>
      <Pressable
        onPress={controls.openDetails}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint="Opens dish details"
        style={({ pressed }) => pressed && styles.pressed}
      >
        <View style={[styles.imageWrap, { height: imageHeight }]}>
          <View
            style={[StyleSheet.absoluteFill, (closed || unavailable) && styles.grayscale]}
            testID={closed ? 'food-card-image-closed' : undefined}
          >
            <RemoteImage
              image={food.image}
              decorative
              radius="none"
              fallbackIcon="fast-food-outline"
              style={StyleSheet.absoluteFill}
            />
          </View>
          {badge && (
            <View style={[styles.badge, badge.closed ? styles.badgeClosed : styles.badgeOpen]}>
              <Text
                variant="label"
                color={badge.closed ? 'onSecondary' : 'primaryText'}
                style={badge.closed && styles.closedText}
              >
                {badge.label}
              </Text>
            </View>
          )}
          {food.rating && food.rating.count > 0 && (
            <View style={styles.rating}>
              <Icon name="star" size="sm" tint={colors.primaryText} />
              <Text variant="label" color="primaryText">
                {formatRating(food.rating.average)}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.body}>
          {showRestaurant && (
            <Text variant="bodySmall" color="textTertiary" numberOfLines={1}>
              {restaurant.name}
            </Text>
          )}
          <View style={styles.nameRow}>
            <View style={styles.mark}>
              <FoodTypeMark type={food.foodType} />
            </View>
            <Text variant="h3" numberOfLines={2} style={styles.name}>
              {food.name}
            </Text>
          </View>

          <View style={styles.priceRow}>
            {deal ? (
              <>
                <Text variant="body" color="textTertiary" style={styles.strike}>
                  {formatMoney(deal)}
                </Text>
                <View style={styles.dealPill}>
                  <Text variant="price" color="primaryText">
                    {formatMoney(food.price)}
                  </Text>
                </View>
              </>
            ) : (
              <Text variant="price">{formatMoney(food.price)}</Text>
            )}
          </View>

          {saving && !closed && (
            <View style={styles.metaRow}>
              <Icon name="pricetag" size="sm" tint={colors.primaryText} />
              <Text variant="label" color="primaryText">
                Save {formatMoney(saving)}
              </Text>
            </View>
          )}
          {closed && (
            <View style={styles.metaRow}>
              <Icon name="time-outline" size="sm" color="textSecondary" />
              <Text variant="label" color="textSecondary">
                {opens ?? 'Closed now'}
              </Text>
            </View>
          )}
          {!closed && unavailable && (
            <Text variant="label" color="textSecondary">
              Unavailable right now
            </Text>
          )}
        </View>
      </Pressable>

      {/* A sibling of the card, so screen readers reach the add control on its own. */}
      <View
        style={[styles.control, { top: imageHeight - FOOD_ADD_BUTTON_SIZE - CONTROL_INSET }]}
        pointerEvents="box-none"
      >
        <FoodCartControl
          foodType={food.foodType}
          quantity={controls.quantity}
          blocked={controls.blockedReason !== null}
          blockedReason={controls.blockedReason ?? undefined}
          onIncrement={controls.onIncrement}
          onDecrement={controls.onDecrement}
          onBlockedPress={controls.onBlockedPress}
          itemName={food.name}
          max={MAX_LINE_QUANTITY}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.85 },
  imageWrap: {
    borderRadius: radius.image,
    overflow: 'hidden',
    backgroundColor: colors.imagePlaceholder,
  },
  grayscale: { filter: [{ grayscale: 1 }], opacity: 0.6 },
  badge: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  badgeOpen: { backgroundColor: colors.surface },
  badgeClosed: { backgroundColor: colors.secondary },
  closedText: { letterSpacing: 0.8 },
  rating: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs + 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs + 1,
    borderTopRightRadius: radius.md,
    backgroundColor: colors.primarySoft,
  },
  body: { paddingTop: spacing.sm, gap: spacing.xxs + 1 },
  nameRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs + spacing.xxs },
  mark: { paddingTop: 5 },
  name: { flex: 1 },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xxs,
  },
  strike: { textDecorationLine: 'line-through' },
  dealPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primarySoftBorder,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  control: { position: 'absolute', right: CONTROL_INSET, alignItems: 'flex-end' },
});
