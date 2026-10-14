import { MenuItemSchema, paths, type MenuItem } from '@hungerly/api-client';
import {
  Badge,
  Card,
  FoodTypeMark,
  Screen,
  screenGutter,
  ScreenHeader,
  spacing,
  Switch,
  Text,
} from '@hungerly/ui';
import { formatMoney } from '@hungerly/utils';
import { router, useLocalSearchParams } from 'expo-router';
import { Image, ScrollView, StyleSheet, View } from 'react-native';

import { useActiveBranch } from '@/features/branch/useActiveBranch';
import { api } from '@/lib/api';
import { useApiQuery, useMutation } from '@/lib/hooks';
import { QueryView } from '@/features/shell/ScreenState';

export default function MenuItemDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { branchId } = useActiveBranch();

  const query = useApiQuery(
    branchId && id ? paths.partner.menuItem(branchId, id) : null,
    MenuItemSchema,
  );

  const { run: toggleAvail, pending: toggling } = useMutation(
    async (item: MenuItem, isAvailable: boolean) => {
      if (!branchId) return;
      await api.request('PUT', paths.partner.menuItemAvailability(branchId, item.id), {
        schema: MenuItemSchema,
        body: { isAvailable },
      });
      query.refetch?.();
    },
  );

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader onBack={() => router.back()} title="Item details" />
      <QueryView query={query} loadingLabel="Loading item">
        {(item) => (
          <ScrollView contentContainerStyle={styles.content}>
            {item.imageUrl && (
              <Image source={{ uri: item.imageUrl }} style={styles.image} resizeMode="cover" />
            )}
            <Card style={styles.header}>
              <View style={styles.row}>
                <FoodTypeMark type={item.foodType} />
                <View style={styles.flex}>
                  <Text variant="h2">{item.name}</Text>
                  <Text variant="price">{formatMoney(item.price)}</Text>
                </View>
                <View style={styles.badges}>
                  {item.isBestseller && <Badge label="Bestseller" tone="success" />}
                  {item.isArchived && <Badge label="Archived" tone="neutral" />}
                </View>
              </View>
              {item.description.length > 0 && (
                <Text variant="body" color="textSecondary">
                  {item.description}
                </Text>
              )}
              {item.prepMinutes !== null && (
                <Text variant="caption" color="textSecondary">
                  Prep time: {item.prepMinutes} min
                </Text>
              )}
            </Card>

            {!item.isArchived && (
              <Card style={styles.section}>
                <View style={styles.toggleRow}>
                  <View style={styles.flex}>
                    <Text variant="label">Available</Text>
                    <Text variant="caption" color="textSecondary">
                      Toggle to show or hide this item from customers
                    </Text>
                  </View>
                  <Switch
                    value={item.isAvailable}
                    onValueChange={(v) => toggleAvail(item, v)}
                    disabled={toggling}
                    accessibilityLabel="Item availability"
                  />
                </View>
              </Card>
            )}
          </ScrollView>
        )}
      </QueryView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg, paddingHorizontal: screenGutter, paddingBottom: spacing['3xl'] },
  image: { width: '100%', height: 200, borderRadius: 12 },
  header: { padding: spacing.lg, gap: spacing.md },
  section: { padding: spacing.lg, gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1, gap: spacing.xs },
  badges: { gap: spacing.xs },
});
