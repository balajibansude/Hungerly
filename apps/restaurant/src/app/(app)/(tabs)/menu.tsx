import { MenuItemSchema, MenuSchema, paths, type MenuItem } from '@hungerly/api-client';
import {
  Card,
  Divider,
  EmptyState,
  FoodTypeMark,
  Screen,
  screenGutter,
  spacing,
  Switch,
  Text,
} from '@hungerly/ui';
import { formatMoney } from '@hungerly/utils';
import { ScrollView, StyleSheet, View } from 'react-native';

import { useActiveBranch } from '@/features/branch/useActiveBranch';
import { api } from '@/lib/api';
import { useApiQuery, useMutation } from '@/lib/hooks';
import { QueryView } from '@/features/shell/ScreenState';
import { TabHeader } from '@/features/shell/TabHeader';
import { paths as apiPaths } from '@hungerly/api-client';

function MenuItemRow({
  item,
  branchId,
  onToggle,
}: {
  item: MenuItem;
  branchId: string;
  onToggle: (item: MenuItem, available: boolean) => void;
}) {
  return (
    <View style={styles.item}>
      <FoodTypeMark type={item.foodType} />
      <View style={styles.flex}>
        <Text variant="body" numberOfLines={1}>
          {item.name}
        </Text>
        <Text variant="caption" color="textSecondary">
          {formatMoney(item.price)}
          {!item.isAvailable && ' · Unavailable'}
          {item.isArchived && ' · Archived'}
        </Text>
      </View>
      {!item.isArchived && (
        <Switch
          value={item.isAvailable}
          onValueChange={(v) => onToggle(item, v)}
          accessibilityLabel={`${item.name} availability`}
        />
      )}
    </View>
  );
}

/** Menu management: toggle item availability, navigate to details. */
export default function MenuScreen() {
  const { branchId } = useActiveBranch();
  const menuQuery = useApiQuery(
    branchId ? paths.partner.menu(branchId) : null,
    MenuSchema,
  );

  const { run: toggleAvailability } = useMutation(
    async (branchId: string, itemId: string, isAvailable: boolean) => {
      await api.request('PUT', apiPaths.partner.menuItemAvailability(branchId, itemId), {
        schema: MenuItemSchema,
        body: { isAvailable },
      });
      menuQuery.refetch?.();
    },
  );

  if (!branchId) return null;

  return (
    <Screen edges={['top']}>
      <TabHeader title="Menu" />
      <QueryView query={menuQuery} loadingLabel="Loading menu">
        {(menu) =>
          menu.categories.length === 0 ? (
            <EmptyState
              icon="restaurant-outline"
              title="No menu yet"
              message="Add your first category and items to get started."
            />
          ) : (
            <ScrollView contentContainerStyle={styles.content}>
              {menu.categories.map((category) => (
                <View key={category.id} style={styles.category}>
                  <View style={styles.categoryHeader}>
                    <Text variant="h3">{category.name}</Text>
                    {!category.isActive && (
                      <Text variant="caption" color="textSecondary">
                        Hidden
                      </Text>
                    )}
                  </View>

                  {category.items.length === 0 ? (
                    <Text variant="bodySmall" color="textSecondary" style={styles.emptyCategory}>
                      No items in this category
                    </Text>
                  ) : (
                    <Card>
                      {category.items.map((item, index) => (
                        <View key={item.id}>
                          {index > 0 && <Divider />}
                          <MenuItemRow
                            item={item}
                            branchId={branchId}
                            onToggle={(i, v) => toggleAvailability(branchId, i.id, v)}
                          />
                        </View>
                      ))}
                    </Card>
                  )}
                </View>
              ))}
            </ScrollView>
          )
        }
      </QueryView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg, paddingHorizontal: screenGutter, paddingBottom: spacing['3xl'] },
  category: { gap: spacing.sm },
  categoryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.lg },
  flex: { flex: 1 },
  emptyCategory: { paddingLeft: spacing.lg },
});
