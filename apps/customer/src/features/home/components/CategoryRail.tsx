import type { Category } from '@hungerly/types';
import { colors, Icon, RemoteImage, screenGutter, spacing, Text } from '@hungerly/ui';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

const ITEM_SIZE = 72;
const FILTER_SIZE = 56;

/**
 * Horizontal cuisine shortcuts with a Filters control at the end of the row.
 *
 * The row is two flex columns: the cuisines scroll in the first (it takes the remaining
 * width), the Filters control owns the second (fixed to its content). Nothing is
 * positioned absolutely, so the control can never sit on top of a cuisine or its label.
 * Both columns use the same structure — a 72pt image slot, then a caption — so the filter
 * circle is centred on the cuisine images and its label lines up with theirs at any text
 * size. A dot on the circle shows when a preference other than Mixed is active.
 */
export function CategoryRail({
  categories,
  onSelect,
  onOpenFilters,
  filterActive = false,
}: {
  categories: Category[];
  onSelect: (category: Category) => void;
  onOpenFilters: () => void;
  filterActive?: boolean;
}) {
  return (
    <View style={styles.row}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.rail}
        contentContainerStyle={styles.railContent}
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
            <RemoteImage
              image={category.image}
              decorative
              radius="pill"
              fallbackIcon="fast-food-outline"
              style={styles.image}
            />
            <Text variant="caption" align="center" numberOfLines={1}>
              {category.name}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <Pressable
        onPress={onOpenFilters}
        accessibilityRole="button"
        accessibilityLabel={filterActive ? 'Filters, food preference on' : 'Filters'}
        accessibilityHint="Choose Veg, Mixed or Jain, or browse all cuisines"
        testID="food-filter-button"
        style={styles.filterColumn}
      >
        {({ pressed }) => (
          <>
            <View style={styles.filterSlot}>
              <View style={[styles.filterCircle, pressed && styles.filterPressed]}>
                <Icon name="options-outline" size="lg" color="primary" />
                {filterActive && <View style={styles.filterDot} />}
              </View>
            </View>
            <Text variant="caption" align="center" color="primaryText" numberOfLines={1}>
              Filters
            </Text>
          </>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  rail: { flex: 1 },
  railContent: { paddingLeft: screenGutter, paddingRight: spacing.md, gap: spacing.lg },
  item: { width: ITEM_SIZE + spacing.sm, alignItems: 'center', gap: spacing.sm },
  pressed: { opacity: 0.7 },
  image: { width: ITEM_SIZE, height: ITEM_SIZE },
  filterColumn: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: spacing.md,
    paddingRight: screenGutter,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: colors.border,
  },
  filterSlot: { height: ITEM_SIZE, justifyContent: 'center' },
  filterCircle: {
    width: FILTER_SIZE,
    height: FILTER_SIZE,
    borderRadius: FILTER_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primarySoftBorder,
  },
  filterPressed: { backgroundColor: colors.primarySoftBorder },
  filterDot: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
});
