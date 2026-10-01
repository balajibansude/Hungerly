import type { Category } from '@hungerly/types';
import { RemoteImage, screenGutter, spacing, Text } from '@hungerly/ui';
import { Pressable, ScrollView, StyleSheet } from 'react-native';

const ITEM_SIZE = 72;

export function CategoryRail({
  categories,
  onSelect,
}: {
  categories: Category[];
  onSelect: (category: Category) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.rail}
    >
      {categories.map((category) => (
        <Pressable
          key={category.id}
          onPress={() => onSelect(category)}
          accessibilityRole="button"
          accessibilityLabel={category.name}
          accessibilityHint="Shows restaurants for this cuisine"
          style={({ pressed }) => [styles.item, pressed && styles.pressed]}
        >
          <RemoteImage image={category.image} decorative radius="pill" style={styles.image} />
          <Text variant="caption" align="center" numberOfLines={1}>
            {category.name}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  rail: { paddingHorizontal: screenGutter, gap: spacing.lg },
  item: { width: ITEM_SIZE + spacing.sm, alignItems: 'center', gap: spacing.sm },
  pressed: { opacity: 0.7 },
  image: { width: ITEM_SIZE, height: ITEM_SIZE },
});
