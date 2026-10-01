import type { Food, MenuCategory } from '@hungerly/types';
import {
  Chip,
  colors,
  Divider,
  EmptyState,
  ErrorState,
  IconButton,
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
import { useAddToCart } from '@/features/cart/useAddToCart';
import { MenuItemRow } from '@/features/menu/components/MenuItemRow';
import { useMenuItemControls } from '@/features/menu/useMenuItemControls';
import { RestaurantInfo } from '@/features/restaurants/components/RestaurantInfo';
import { useQuery } from '@/hooks/useQuery';
import { useServices } from '@/services';

const HERO_HEIGHT = 240;

export default function RestaurantDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { restaurants } = useServices();
  const insets = useSafeAreaInsets();
  const listRef = useRef<SectionList<Food, MenuCategory>>(null);
  const pendingJump = useRef<{ sectionIndex: number; retries: number } | null>(null);
  const [vegOnly, setVegOnly] = useState(false);
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
  const { add, dialog } = useAddToCart();
  const controlsFor = useMenuItemControls(
    data.status === 'success' ? data.data.restaurant : undefined,
    add,
  );

  const sections = useMemo(() => {
    if (data.status !== 'success') return [];
    return data.data.menu.categories
      .map((category) => ({
        ...category,
        data: vegOnly ? category.foods.filter((food) => food.foodType === 'veg') : category.foods,
      }))
      .filter((section) => section.data.length > 0);
  }, [data, vegOnly]);

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
  const showVegToggle = !restaurant.isPureVeg;

  return (
    <View style={styles.screen}>
      <SectionList
        ref={listRef}
        sections={sections}
        keyExtractor={(food) => food.id}
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
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}
            >
              {showVegToggle && (
                <Chip
                  label="Veg only"
                  icon="leaf-outline"
                  selected={vegOnly}
                  onPress={() => setVegOnly((v) => !v)}
                />
              )}
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
              {section.data.length} {section.data.length === 1 ? 'item' : 'items'}
            </Text>
          </View>
        )}
        ItemSeparatorComponent={() => <Divider inset />}
        renderItem={({ item }) => {
          const controls = controlsFor(item);
          return (
            <View style={styles.row}>
              <MenuItemRow
                food={item}
                quantity={controls.quantity}
                onOpen={controls.openDetails}
                onIncrement={controls.onIncrement}
                onDecrement={controls.onDecrement}
                restaurantClosed={!restaurant.isOpen}
              />
            </View>
          );
        }}
        ListEmptyComponent={
          <EmptyState
            icon="leaf-outline"
            title="No veg dishes here"
            message="This restaurant has no vegetarian dishes on its menu yet."
            actionLabel="Show all dishes"
            onAction={() => setVegOnly(false)}
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
  chips: { paddingHorizontal: screenGutter, gap: spacing.sm, paddingVertical: spacing.lg },
  sectionHeader: {
    paddingHorizontal: screenGutter,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xs,
    gap: spacing.xxs,
    backgroundColor: colors.background,
  },
  row: { paddingHorizontal: screenGutter },
});
