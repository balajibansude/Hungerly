import { MenuItemInputSchema, MenuItemSchema, MenuSchema, paths } from '@hungerly/api-client';
import {
  Button,
  Card,
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
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { useActiveBranch } from '@/features/branch/useActiveBranch';
import { api } from '@/lib/api';
import { useApiQuery, useMutation } from '@/lib/hooks';
import { QueryView } from '@/features/shell/ScreenState';

const FOOD_TYPES = [
  { value: 'veg', label: 'Veg' },
  { value: 'non_veg', label: 'Non-veg' },
  { value: 'egg', label: 'Egg' },
  { value: 'jain', label: 'Jain' },
] as const;

export default function NewMenuItemScreen() {
  const { branchId } = useActiveBranch();

  const menuQuery = useApiQuery(
    branchId ? paths.partner.menu(branchId) : null,
    MenuSchema,
  );

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [priceRupees, setPriceRupees] = useState('');
  const [foodType, setFoodType] = useState<'veg' | 'non_veg' | 'egg' | 'jain'>('veg');
  const [categoryId, setCategoryId] = useState('');
  const [isBestseller, setIsBestseller] = useState(false);
  const [prepMinutesStr, setPrepMinutesStr] = useState('');

  const { run: createItem, pending, error: createError } = useMutation(async () => {
    if (!branchId) return;
    const priceMinor = Math.round(parseFloat(priceRupees) * 100);
    const prepMinutes = prepMinutesStr ? parseInt(prepMinutesStr, 10) : null;

    const input = {
      categoryId,
      name: name.trim(),
      description: description.trim(),
      priceMinor,
      foodType,
      isBestseller,
      prepMinutes,
    };

    const result = MenuItemInputSchema.safeParse(input);
    if (!result.success) {
      Alert.alert('Invalid details', result.error.issues[0]?.message ?? 'Check your input.');
      return;
    }

    await api.request('POST', paths.partner.menuItems(branchId), {
      schema: MenuItemSchema,
      body: result.data,
    });
    router.back();
  });

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader onBack={() => router.back()} title="Add menu item" />
      <QueryView query={menuQuery} loadingLabel="Loading categories">
        {(menu) => (
          <ScrollView contentContainerStyle={styles.content}>
            <Card style={styles.section}>
              <Text variant="h3">Item details</Text>
              <TextField
                label="Name"
                value={name}
                onChangeText={setName}
                placeholder="e.g. Butter Chicken"
              />
              <TextField
                label="Description (optional)"
                value={description}
                onChangeText={setDescription}
                placeholder="Ingredients, allergens, etc."
                multiline
              />
              <TextField
                label="Price (₹)"
                value={priceRupees}
                onChangeText={setPriceRupees}
                keyboardType="decimal-pad"
                placeholder="e.g. 199"
              />
              <TextField
                label="Prep time (minutes, optional)"
                value={prepMinutesStr}
                onChangeText={setPrepMinutesStr}
                keyboardType="numeric"
                placeholder="e.g. 15"
              />
            </Card>

            <Card style={styles.section}>
              <Text variant="h3">Category</Text>
              {menu.categories.length === 0 ? (
                <Text variant="body" color="textSecondary">
                  No categories found. Create a category first.
                </Text>
              ) : (
                <View style={styles.grid}>
                  {menu.categories.map((cat) => (
                    <Button
                      key={cat.id}
                      label={cat.name}
                      variant={categoryId === cat.id ? 'primary' : 'outline'}
                      onPress={() => setCategoryId(cat.id)}
                      style={styles.gridBtn}
                    />
                  ))}
                </View>
              )}
            </Card>

            <Card style={styles.section}>
              <Text variant="h3">Food type</Text>
              <View style={styles.grid}>
                {FOOD_TYPES.map((ft) => (
                  <Button
                    key={ft.value}
                    label={ft.label}
                    variant={foodType === ft.value ? 'primary' : 'outline'}
                    onPress={() => setFoodType(ft.value)}
                    style={styles.gridBtn}
                  />
                ))}
              </View>
            </Card>

            <Card style={styles.section}>
              <View style={styles.toggleRow}>
                <View style={styles.flex}>
                  <Text variant="label">Bestseller</Text>
                  <Text variant="caption" color="textSecondary">
                    Show a bestseller badge on this item
                  </Text>
                </View>
                <Switch
                  value={isBestseller}
                  onValueChange={setIsBestseller}
                  accessibilityLabel="Mark as bestseller"
                />
              </View>
            </Card>

            {createError && (
              <Text variant="caption" color="error" align="center">
                {createError}
              </Text>
            )}

            <Button
              label="Add item"
              onPress={() => createItem()}
              loading={pending}
              disabled={!categoryId || !name || !priceRupees}
              fullWidth
            />
          </ScrollView>
        )}
      </QueryView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg, paddingHorizontal: screenGutter, paddingBottom: spacing['3xl'] },
  section: { padding: spacing.lg, gap: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  gridBtn: { minWidth: 80 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1, gap: spacing.xs },
});
