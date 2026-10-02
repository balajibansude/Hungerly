import type { Food } from '@hungerly/types';
import {
  Badge,
  colors,
  FoodTypeMark,
  Price,
  QuantitySelector,
  radius,
  Rating,
  RemoteImage,
  spacing,
  Text,
} from '@hungerly/ui';
import { formatMoney } from '@hungerly/utils';
import { Pressable, StyleSheet, View } from 'react-native';

export interface MenuItemRowProps {
  food: Food;
  quantity: number;
  /** Opens the dish details (customisation, description). */
  onOpen: () => void;
  onIncrement: () => void;
  onDecrement: () => void;
  /** True when the restaurant is closed: items are visible but cannot be added. */
  restaurantClosed?: boolean;
}

const IMAGE_SIZE = 116;

/**
 * Menu row: text left, image with the add control overlapping its bottom edge on the
 * right — the control stays in the same place with or without an image.
 */
export function MenuItemRow({
  food,
  quantity,
  onOpen,
  onIncrement,
  onDecrement,
  restaurantClosed = false,
}: MenuItemRowProps) {
  const unavailable = !food.isAvailable;
  const blocked = unavailable || restaurantClosed;
  const customisable = food.optionGroups.length > 0;

  return (
    <View style={styles.row}>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`${food.name}, ${formatMoney(food.price)}${unavailable ? ', currently unavailable' : ''}`}
        accessibilityHint="Opens dish details"
        style={styles.info}
      >
        <View style={styles.marks}>
          <FoodTypeMark type={food.foodType} />
          {food.isBestseller && <Badge label="Bestseller" tone="offer" icon="flame" />}
        </View>
        <Text variant="h3" numberOfLines={2} color={unavailable ? 'textTertiary' : 'textPrimary'}>
          {food.name}
        </Text>
        <Price value={food.price} color={unavailable ? 'textTertiary' : 'textPrimary'} />
        {food.rating && <Rating rating={food.rating} showCount />}
        <Text variant="bodySmall" color="textSecondary" numberOfLines={2}>
          {food.description}
        </Text>
      </Pressable>

      <View style={styles.media}>
        {food.image ? (
          <Pressable onPress={onOpen} accessible={false}>
            <RemoteImage
              image={food.image}
              decorative
              style={[styles.image, unavailable && styles.faded]}
            />
          </Pressable>
        ) : (
          <View style={styles.imageSpacer} />
        )}
        <View style={[styles.control, !food.image && styles.controlNoImage]}>
          {blocked ? (
            <View style={styles.unavailable}>
              <Text variant="caption" color="textTertiary">
                {unavailable ? 'Unavailable' : 'Closed'}
              </Text>
            </View>
          ) : (
            <QuantitySelector
              quantity={quantity}
              onIncrement={onIncrement}
              onDecrement={onDecrement}
              itemName={food.name}
            />
          )}
        </View>
        {customisable && !blocked && (
          <Text variant="caption" color="textTertiary" align="center">
            Customisable
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.lg, paddingVertical: spacing.lg },
  info: { flex: 1, gap: spacing.xs + spacing.xxs },
  marks: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  media: { width: IMAGE_SIZE, alignItems: 'center' },
  image: { width: IMAGE_SIZE, height: IMAGE_SIZE },
  imageSpacer: { height: spacing.sm },
  faded: { opacity: 0.5 },
  control: { marginTop: -spacing.xl, marginBottom: spacing.xs },
  controlNoImage: { marginTop: 0 },
  unavailable: {
    minWidth: 92,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
});
