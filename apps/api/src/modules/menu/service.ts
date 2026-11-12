import { and, asc, eq, sql } from 'drizzle-orm';

import type { Menu, MenuItem, MenuItemInput } from '@hungerly/api-client';

import type { Config } from '../../config';
import type { Db } from '../../db/client';
import { menuCategories, menuItems } from '../../db/schema';
import { notFound, unprocessable } from '../../lib/errors';
import { inr } from '../../lib/money';

type ItemRow = typeof menuItems.$inferSelect;

export function menuImageUrl(config: Config, key: string | null): string | null {
  return key
    ? `${config.PUBLIC_BASE_URL.replace(/\/+$/, '')}/api/v1/media/menu/${key.replace(/^menu\//, '')}`
    : null;
}

export function toMenuItem(config: Config, row: ItemRow): MenuItem {
  return {
    id: row.id,
    categoryId: row.categoryId,
    name: row.name,
    description: row.description,
    price: inr(row.priceMinor),
    foodType: row.foodType,
    imageUrl: menuImageUrl(config, row.imageKey),
    isAvailable: row.isAvailable,
    isArchived: row.isArchived,
    isBestseller: row.isBestseller,
    prepMinutes: row.prepMinutes,
    sortOrder: row.sortOrder,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** The branch's menu: categories in order with their non-archived items (archived optional). */
export async function loadMenu(
  db: Db,
  config: Config,
  branchId: string,
  includeArchived = false,
): Promise<Menu> {
  const categories = await db
    .select()
    .from(menuCategories)
    .where(eq(menuCategories.branchId, branchId))
    .orderBy(asc(menuCategories.sortOrder), asc(menuCategories.createdAt));
  const items = await db
    .select()
    .from(menuItems)
    .where(
      includeArchived
        ? eq(menuItems.branchId, branchId)
        : and(eq(menuItems.branchId, branchId), eq(menuItems.isArchived, false)),
    )
    .orderBy(asc(menuItems.sortOrder), asc(menuItems.createdAt));
  return {
    categories: categories.map((c) => ({
      id: c.id,
      name: c.name,
      sortOrder: c.sortOrder,
      isActive: c.isActive,
      items: items.filter((i) => i.categoryId === c.id).map((i) => toMenuItem(config, i)),
    })),
  };
}

export async function requireCategory(db: Db, branchId: string, categoryId: string) {
  const [category] = await db
    .select()
    .from(menuCategories)
    .where(and(eq(menuCategories.id, categoryId), eq(menuCategories.branchId, branchId)))
    .limit(1);
  if (!category)
    throw unprocessable('validation', 'Choose a category from this branch.', {
      categoryId: ['Unknown category'],
    });
  return category;
}

export async function requireItem(db: Db, branchId: string, itemId: string): Promise<ItemRow> {
  const [item] = await db
    .select()
    .from(menuItems)
    .where(and(eq(menuItems.id, itemId), eq(menuItems.branchId, branchId)))
    .limit(1);
  if (!item) throw notFound('Menu item not found.');
  return item;
}

export async function nextSortOrder(
  db: Db,
  branchId: string,
  table: 'categories' | 'items',
): Promise<number> {
  const t = table === 'categories' ? menuCategories : menuItems;
  const [row] = await db
    .select({ max: sql<number | null>`max(${t.sortOrder})` })
    .from(t)
    .where(eq(t.branchId, branchId));
  return (row?.max ?? -1) + 1;
}

export async function createItem(db: Db, branchId: string, input: MenuItemInput): Promise<ItemRow> {
  await requireCategory(db, branchId, input.categoryId);
  const [row] = await db
    .insert(menuItems)
    .values({
      branchId,
      categoryId: input.categoryId,
      name: input.name,
      description: input.description,
      priceMinor: input.priceMinor,
      foodType: input.foodType,
      isAvailable: input.isAvailable,
      isBestseller: input.isBestseller,
      prepMinutes: input.prepMinutes,
      sortOrder: await nextSortOrder(db, branchId, 'items'),
    })
    .returning();
  return row!;
}
