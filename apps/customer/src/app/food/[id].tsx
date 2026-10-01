import { useQuery } from '@hungerly/app-core';
import {
  Badge,
  Button,
  colors,
  ErrorState,
  FoodTypeMark,
  IconButton,
  LoadingState,
  Price,
  QuantitySelector,
  Rating,
  RemoteImage,
  screenGutter,
  spacing,
  Text,
} from '@hungerly/ui';
import { formatMoney, multiplyMoney } from '@hungerly/utils';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { unitPrice } from '@/features/cart/pricing';
import { MAX_LINE_QUANTITY, toCartRestaurant } from '@/features/cart/store';
import { useAddToCart } from '@/features/cart/useAddToCart';
import { OptionGroupPicker } from '@/features/menu/components/OptionGroupPicker';
import {
  initialSelection,
  toggleOption,
  toSelectedOptions,
  validateSelection,
  type Selection,
} from '@/features/menu/selection';
import { useServices } from '@/services';

/** Dish details and customisation, presented as a modal over the menu. */
export default function FoodDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { foods } = useServices();
  const insets = useSafeAreaInsets();
  const result = useQuery(`food:${id}`, () => foods.get(id));
  const { add, dialog } = useAddToCart();

  // null until the customer changes something: the dish's defaults are derived, not copied.
  const [edited, setEdited] = useState<Selection | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [showErrors, setShowErrors] = useState(false);

  const food = result.status === 'success' ? result.data.food : undefined;
  const restaurant = result.status === 'success' ? result.data.restaurant : undefined;

  const selection = useMemo(() => edited ?? (food ? initialSelection(food) : {}), [edited, food]);

  const options = useMemo(
    () => (food ? toSelectedOptions(food, selection) : []),
    [food, selection],
  );
  const issues = useMemo(() => (food ? validateSelection(food, selection) : []), [food, selection]);
  const total = food ? multiplyMoney(unitPrice(food.price, options), quantity) : undefined;

  const close = (
    <IconButton
      icon="close"
      variant="overlay"
      accessibilityLabel="Close"
      onPress={() => router.back()}
      style={[styles.close, { top: spacing.md }]}
    />
  );

  if (result.status === 'loading') {
    return (
      <View style={styles.screen}>
        <LoadingState label="Loading dish" />
        {close}
      </View>
    );
  }
  if (result.status === 'error' || !food || !restaurant) {
    return (
      <View style={styles.screen}>
        <ErrorState message="We couldn't load this dish." onRetry={result.refetch} />
        {close}
      </View>
    );
  }

  const canOrder = restaurant.isOpen && food.isAvailable;

  const onAdd = () => {
    if (issues.length > 0) {
      setShowErrors(true);
      return;
    }
    add({
      food,
      restaurant: toCartRestaurant(restaurant),
      options,
      quantity,
      onAdded: () => router.back(),
    });
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        {food.image && <RemoteImage image={food.image} radius="none" style={styles.image} />}
        <View style={[styles.body, !food.image && styles.bodyNoImage]}>
          <View style={styles.marks}>
            <FoodTypeMark type={food.foodType} size={16} />
            {food.isBestseller && <Badge label="Bestseller" tone="offer" icon="flame" />}
          </View>
          <Text variant="h1" accessibilityRole="header">
            {food.name}
          </Text>
          <Text variant="bodySmall" color="textSecondary">
            from {restaurant.name}
          </Text>
          <View style={styles.priceRow}>
            <Price value={food.price} variant="h3" />
            {food.rating && <Rating rating={food.rating} showCount size="md" />}
          </View>
          <Text variant="body" color="textSecondary">
            {food.description}
          </Text>

          {food.optionGroups.map((group) => (
            <View key={group.id} style={styles.group}>
              <OptionGroupPicker
                group={group}
                selected={selection[group.id] ?? []}
                onToggle={(optionId) => setEdited(toggleOption(selection, group, optionId))}
                error={
                  showErrors
                    ? issues.find((issue) => issue.groupId === group.id)?.message
                    : undefined
                }
              />
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        {canOrder ? (
          <>
            <QuantitySelector
              quantity={quantity}
              onIncrement={() => setQuantity((q) => Math.min(q + 1, MAX_LINE_QUANTITY))}
              onDecrement={() => setQuantity((q) => Math.max(q - 1, 1))}
              itemName={food.name}
              min={1}
              max={MAX_LINE_QUANTITY}
            />
            <Button
              label={`Add item · ${total ? formatMoney(total) : ''}`}
              onPress={onAdd}
              style={styles.flex}
              accessibilityHint="Adds this dish to your cart"
            />
          </>
        ) : (
          <Text variant="body" color="textSecondary" align="center" style={styles.flex}>
            {restaurant.isOpen
              ? 'This dish is unavailable right now.'
              : `${restaurant.name} is closed right now.`}
          </Text>
        )}
      </View>
      {close}
      {dialog}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { paddingBottom: spacing['2xl'] },
  image: { height: 260 },
  body: { padding: screenGutter, gap: spacing.sm },
  bodyNoImage: { paddingTop: spacing['5xl'] + spacing.lg },
  marks: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  group: {
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: screenGutter,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  flex: { flex: 1 },
  close: { position: 'absolute', right: screenGutter },
});
