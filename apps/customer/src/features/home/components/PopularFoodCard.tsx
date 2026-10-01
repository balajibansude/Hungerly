import type { Food } from '@hungerly/types';
import { Card, FoodTypeMark, Price, RemoteImage, spacing, Text } from '@hungerly/ui';
import { formatMoney } from '@hungerly/utils';
import { StyleSheet, View } from 'react-native';

export const POPULAR_FOOD_CARD_WIDTH = 164;

export function PopularFoodCard({
  food,
  restaurantName,
  onPress,
}: {
  food: Food;
  restaurantName: string;
  onPress: () => void;
}) {
  return (
    <Card
      onPress={onPress}
      accessibilityLabel={`${food.name} from ${restaurantName}, ${formatMoney(food.price)}`}
      accessibilityHint="Opens dish details"
      style={styles.card}
    >
      <RemoteImage image={food.image} decorative radius="none" style={styles.image} />
      <View style={styles.body}>
        <View style={styles.row}>
          <FoodTypeMark type={food.foodType} />
          <Text variant="label" numberOfLines={1} style={styles.flex}>
            {food.name}
          </Text>
        </View>
        <Text variant="metadata" color="textSecondary" numberOfLines={1}>
          {restaurantName}
        </Text>
        <Price value={food.price} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { width: POPULAR_FOOD_CARD_WIDTH },
  image: { height: 112 },
  body: { padding: spacing.md, gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + spacing.xxs },
  flex: { flex: 1 },
});
