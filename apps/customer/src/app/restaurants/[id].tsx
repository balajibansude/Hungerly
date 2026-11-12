import { useQuery } from '@hungerly/app-core';
import type { Food, MenuCategory } from '@hungerly/types';
import {
  Chip,
  colors,
  EmptyState,
  ErrorState,
  IconButton,
  radius,
  RemoteImage,
  screenGutter,
  Skeleton,
  spacing,
  Text,
} from '@hungerly/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { ScrollView, SectionList, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CART_BAR_SPACE, CartBar } from '@/features/cart/components/CartBar';
import { opensAtLabel } from '@/features/food/availability';
import { FoodCard } from '@/features/food/components/FoodCard';
import { useGridCardWidth } from '@/features/food/components/FoodCollections';
import { FoodPreferenceChips } from '@/features/food/components/FoodPreference';
import {
  filterByPreference,
  preferenceLabel,
  useFoodPreferenceStore,
} from '@/features/food/preference';
import { useDishCartControls, useSyncCartAvailability } from '@/features/food/useDishCartControls';
import { RestaurantInfo } from '@/features/restaurants/components/RestaurantInfo';
import { useServices } from '@/services';

type MenuSection = MenuCategory & { count: number; data: Food[][] };

const HERO_HEIGHT = 240;

/** Splits a section's dishes into rows for the grid. */
function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

export default function RestaurantDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { restaurants } = useServices();
  const insets = useSafeAreaInsets();
  const listRef = useRef<SectionList<Food[], MenuSection>>(null);
  const pendingJump = useRef<{ sectionIndex: number; retries: number } | null>(null);
  const preference = useFoodPreferenceStore((s) => s.preference);
  const setPreference = useFoodPreferenceStore((s) => s.setPreference);
  const { width: cardWidth, columns } = useGridCardWidth();
  // Once the hero scrolls away, a solid top bar replaces the floating back button so it
  // never sits on top of menu text.
  const [collapsed, setCollapsed] = useState(false);

  const jumpTo = (sectionIndex: number, retries = 0) => {
    pendingJump.current = { sectionIndex, retries };
    listRef.current?.scrollToLocation({ sectionIndex, itemIndex: 0, viewOffset: spacing['5xl'] });
  };

  const data = useQuery(`restaurant:${id}`, () =>
    Promise.all([restaurants.get(id), restaurants.getMenu(id)]).then(([restaurant, menu]) => ({
      restaurant,
      menu,
    })),
  );
  const { controlsFor, dialog } = useDishCartControls();
  useSyncCartAvailability(data.status === 'success' ? [data.data.restaurant] : undefined);

  const sections = useMemo(() => {
    if (data.status !== 'success') return [];
    return data.data.menu.categories
      .map((category) => {
        const foods = filterByPreference(category.foods, preference, (food) => food.foodType);
        return { ...category, count: foods.length, data: chunk(foods, columns) };
      })
      .filter((section) => section.count > 0);
  }, [data, preference, columns]);

  const back = (
    <IconButton
      icon="chevron-back"
      variant="overlay"
      accessibilityLabel="Go back"
      onPress={() => router.back()}
      style={[styles.back, { top: insets.top + spacing.sm }]}
    />
  );

  if (data.status === 'loading') {
    return (
      <View style={styles.screen}>
        <Skeleton height={HERO_HEIGHT + insets.top} radius="none" />
        <View style={styles.loadingBody}>
          <Skeleton height={28} width="60%" />
          <Skeleton height={16} width="40%" />
          <Skeleton height={96} radius="card" />
        </View>
        {back}
      </View>
    );
  }

  if (data.status === 'error') {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + spacing['5xl'] + spacing.sm }]}>
        <ErrorState message="We couldn't load this restaurant." onRetry={data.refetch} />
        {back}
      </View>
    );
  }

  const { restaurant } = data.data;
  const opens = opensAtLabel(restaurant.opensAt);

  return (
    <View style={styles.screen}>
      <SectionList
        ref={listRef}
        sections={sections}
        keyExtractor={(row) => row.map((food) => food.id).join('+')}
        stickySectionHeadersEnabled={false}
        scrollEventThrottle={16}
        onScroll={(event) => {
          const next = event.nativeEvent.contentOffset.y > HERO_HEIGHT - spacing['3xl'];
          if (next !== collapsed) setCollapsed(next);
        }}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View>
            <RemoteImage
              image={restaurant.image}
              radius="none"
              style={{ height: HERO_HEIGHT + insets.top }}
            />
            <View style={styles.infoWrap}>
              <RestaurantInfo restaurant={restaurant} />
            </View>
            {!restaurant.isOpen && (
              <View style={styles.closedBanner} accessibilityRole="alert">
                <Text variant="label" color="onSecondary">
                  This restaurant is currently closed.{opens ? ` ${opens}.` : ''}
                </Text>
                <Text variant="bodySmall" color="onSecondary" style={styles.closedHint}>
                  You can browse the menu, but items can’t be added until it reopens.
                </Text>
              </View>
            )}
            <FoodPreferenceChips style={styles.preferenceChips} />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}
            >
              {sections.map((section, sectionIndex) => (
                <Chip
                  key={section.id}
                  label={section.name}
                  accessibilityHint="Jumps to this part of the menu"
                  onPress={() => jumpTo(sectionIndex)}
                />
              ))}
            </ScrollView>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text variant="h2" accessibilityRole="header">
              {section.name}
            </Text>
            <Text variant="bodySmall" color="textTertiary">
              {section.count} {section.count === 1 ? 'item' : 'items'}
            </Text>
          </View>
        )}
        renderItem={({ item: row }) => (
          <View style={styles.row}>
            {row.map((food) => (
              <FoodCard
                key={food.id}
                food={food}
                restaurant={restaurant}
                controls={controlsFor(food, restaurant)}
                width={cardWidth}
                showRestaurant={false}
              />
            ))}
          </View>
        )}
        ListEmptyComponent={
          <EmptyState
            icon="leaf-outline"
            title={`No ${preferenceLabel(preference)} dishes here`}
            message="This restaurant has no dishes matching your food preference."
            actionLabel="Show all dishes"
            onAction={() => setPreference('mixed')}
          />
        }
        // Sections far down the list may not be measured yet; retry once they have rendered.
        onScrollToIndexFailed={() => {
          const target = pendingJump.current;
          if (target && target.retries < 3) {
            setTimeout(() => jumpTo(target.sectionIndex, target.retries + 1), 120);
          }
        }}
      />
      <View
        style={[
          styles.topBar,
          { paddingTop: insets.top + spacing.xs },
          collapsed && styles.topBarSolid,
        ]}
        pointerEvents="box-none"
      >
        <IconButton
          icon="chevron-back"
          variant={collapsed ? 'ghost' : 'overlay'}
          accessibilityLabel="Go back"
          onPress={() => router.back()}
        />
        {collapsed && (
          <Animated.View
            entering={FadeIn.duration(150)}
            exiting={FadeOut.duration(100)}
            style={styles.flex}
          >
            <Text variant="h3" numberOfLines={1}>
              {restaurant.name}
            </Text>
          </Animated.View>
        )}
      </View>
      <CartBar />
      {dialog}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  back: { position: 'absolute', left: screenGutter },
  flex: { flex: 1 },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: screenGutter - spacing.xs,
    paddingBottom: spacing.sm,
  },
  topBarSolid: {
    backgroundColor: colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  loadingBody: { padding: screenGutter, gap: spacing.md },
  listContent: { paddingBottom: CART_BAR_SPACE },
  infoWrap: { paddingHorizontal: screenGutter, marginTop: -spacing['3xl'] },
  closedBanner: {
    marginHorizontal: screenGutter,
    marginTop: spacing.lg,
    padding: spacing.md,
    gap: spacing.xxs,
    borderRadius: radius.lg,
    backgroundColor: colors.secondary,
  },
  closedHint: { opacity: 0.85 },
  preferenceChips: { paddingTop: spacing.lg },
  chips: { paddingHorizontal: screenGutter, gap: spacing.sm, paddingVertical: spacing.md },
  sectionHeader: {
    paddingHorizontal: screenGutter,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xs,
    gap: spacing.xxs,
    backgroundColor: colors.background,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.lg,
    paddingHorizontal: screenGutter,
    paddingVertical: spacing.md,
  },
});
