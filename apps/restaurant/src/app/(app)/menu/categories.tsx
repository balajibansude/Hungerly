import { CreateCategorySchema, MenuCategorySchema, MenuSchema, paths } from '@hungerly/api-client';
import {
  Button,
  Card,
  EmptyState,
  Screen,
  screenGutter,
  ScreenHeader,
  spacing,
  Switch,
  Text,
  TextField,
} from '@hungerly/ui';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';

import { useActiveBranch } from '@/features/branch/useActiveBranch';
import { api } from '@/lib/api';
import { useApiQuery, useMutation } from '@/lib/hooks';
import { QueryView } from '@/features/shell/ScreenState';

export default function MenuCategoriesScreen() {
  const { branchId } = useActiveBranch();
  const [newName, setNewName] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  const query = useApiQuery(
    branchId ? paths.partner.menu(branchId) : null,
    MenuSchema,
  );

  const { run: createCategory, pending: creating } = useMutation(async () => {
    if (!branchId) return;
    const result = CreateCategorySchema.safeParse({ name: newName.trim() });
    if (!result.success) {
      Alert.alert('Invalid name', result.error.issues[0]?.message ?? 'Enter a valid name.');
      return;
    }
    await api.request('POST', paths.partner.menuCategories(branchId), {
      schema: MenuCategorySchema,
      body: result.data,
    });
    setNewName('');
    setShowAdd(false);
    query.refetch?.();
  });

  const { run: toggleCategory } = useMutation(
    async (categoryId: string, isActive: boolean) => {
      if (!branchId) return;
      await api.request('PATCH', paths.partner.menuCategory(branchId, categoryId), {
        schema: MenuCategorySchema,
        body: { isActive },
      });
      query.refetch?.();
    },
  );

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader onBack={() => router.back()} title="Categories" />
      <QueryView query={query} loadingLabel="Loading categories">
        {(menu) => (
          <FlatList
            data={menu.categories}
            keyExtractor={(c) => c.id}
            contentContainerStyle={styles.content}
            ListHeaderComponent={
              showAdd ? (
                <Card style={styles.addCard}>
                  <TextField
                    label="Category name"
                    value={newName}
                    onChangeText={setNewName}
                    placeholder="e.g. Starters"
                    autoFocus
                  />
                  <View style={styles.addActions}>
                    <Button
                      label="Cancel"
                      variant="outline"
                      onPress={() => { setShowAdd(false); setNewName(''); }}
                      style={styles.flex}
                    />
                    <Button
                      label="Add"
                      onPress={() => createCategory()}
                      loading={creating}
                      disabled={!newName.trim()}
                      style={styles.flex}
                    />
                  </View>
                </Card>
              ) : (
                <Button
                  label="Add category"
                  icon="add"
                  onPress={() => setShowAdd(true)}
                  style={styles.addBtn}
                />
              )
            }
            ListEmptyComponent={
              <EmptyState
                icon="folder-open-outline"
                title="No categories"
                message="Add a category to organize your menu items."
              />
            }
            renderItem={({ item: cat }) => (
              <Card style={styles.row}>
                <View style={styles.flex}>
                  <Text variant="label">{cat.name}</Text>
                  <Text variant="caption" color="textSecondary">
                    {cat.items.length} items
                  </Text>
                </View>
                <Switch
                  value={cat.isActive}
                  onValueChange={(v) => toggleCategory(cat.id, v)}
                  accessibilityLabel={`${cat.name} active`}
                />
              </Card>
            )}
          />
        )}
      </QueryView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.sm, paddingHorizontal: screenGutter, paddingBottom: spacing['3xl'] },
  addBtn: { marginBottom: spacing.sm },
  addCard: { padding: spacing.lg, gap: spacing.md, marginBottom: spacing.sm },
  addActions: { flexDirection: 'row', gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  flex: { flex: 1, gap: spacing.xs },
});
