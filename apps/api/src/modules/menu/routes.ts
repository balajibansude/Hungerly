import { randomUUID } from 'node:crypto';

import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import {
  CreateCategorySchema,
  MENU_IMAGE_LIMITS,
  MenuCategorySchema,
  MenuItemInputSchema,
  MenuItemSchema,
  MenuSchema,
  paths,
  SetAvailabilitySchema,
  UpdateCategorySchema,
  UpdateMenuItemSchema,
} from '@hungerly/api-client';

import { requireOwnedBranch } from '../../auth/guard';
import { menuCategories, menuItems } from '../../db/schema';
import { audit } from '../../lib/audit';
import { AppError, notFound } from '../../lib/errors';
import { sniffMime } from '../../lib/storage';
import {
  createItem,
  loadMenu,
  nextSortOrder,
  requireCategory,
  requireItem,
  toMenuItem,
} from './service';

const BranchParams = z.object({ branchId: z.uuid() });
const CategoryParams = BranchParams.extend({ categoryId: z.uuid() });
const ItemParams = BranchParams.extend({ itemId: z.uuid() });
const MenuQuery = z.object({ includeArchived: z.enum(['true', 'false']).optional() });

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * Menu management (owner only, per branch). Items are archived, never deleted, so past
 * orders keep their references. Food type is stored exactly as the owner chose it.
 */
export async function menuRoutes(api: FastifyInstance) {
  const app = api.withTypeProvider<ZodTypeProvider>();
  const { deps } = app;

  app.get(
    paths.partner.menu(':branchId'),
    { schema: { params: BranchParams, querystring: MenuQuery, response: { 200: MenuSchema } } },
    async (req) => {
      const { branch } = await requireOwnedBranch(req, req.params.branchId);
      return loadMenu(deps.db, deps.config, branch.id, req.query.includeArchived === 'true');
    },
  );

  // --- Categories ---
  app.post(
    paths.partner.menuCategories(':branchId'),
    {
      schema: {
        params: BranchParams,
        body: CreateCategorySchema,
        response: { 201: MenuCategorySchema },
      },
    },
    async (req, reply) => {
      const { auth, branch } = await requireOwnedBranch(req, req.params.branchId);
      const [row] = await deps.db
        .insert(menuCategories)
        .values({
          branchId: branch.id,
          name: req.body.name,
          sortOrder: await nextSortOrder(deps.db, branch.id, 'categories'),
        })
        .returning();
      await audit(deps.db, {
        actorUserId: auth.userId,
        actorType: 'owner',
        action: 'menu.category_created',
        entityType: 'menu_category',
        entityId: row!.id,
        branchId: branch.id,
        metadata: { name: row!.name },
        ip: req.ip,
      });
      return reply
        .status(201)
        .send({
          id: row!.id,
          name: row!.name,
          sortOrder: row!.sortOrder,
          isActive: row!.isActive,
          items: [],
        });
    },
  );

  app.patch(
    paths.partner.menuCategory(':branchId', ':categoryId'),
    {
      schema: { params: CategoryParams, body: UpdateCategorySchema, response: { 200: MenuSchema } },
    },
    async (req) => {
      const { auth, branch } = await requireOwnedBranch(req, req.params.branchId);
      await requireCategory(deps.db, branch.id, req.params.categoryId);
      if (Object.keys(req.body).length > 0) {
        await deps.db
          .update(menuCategories)
          .set(req.body)
          .where(eq(menuCategories.id, req.params.categoryId));
        await audit(deps.db, {
          actorUserId: auth.userId,
          actorType: 'owner',
          action: 'menu.category_updated',
          entityType: 'menu_category',
          entityId: req.params.categoryId,
          branchId: branch.id,
          metadata: { fields: Object.keys(req.body) },
          ip: req.ip,
        });
      }
      return loadMenu(deps.db, deps.config, branch.id);
    },
  );

  // --- Items ---
  app.post(
    paths.partner.menuItems(':branchId'),
    {
      schema: {
        params: BranchParams,
        body: MenuItemInputSchema,
        response: { 201: MenuItemSchema },
      },
    },
    async (req, reply) => {
      const { auth, branch } = await requireOwnedBranch(req, req.params.branchId);
      const row = await createItem(deps.db, branch.id, req.body);
      await audit(deps.db, {
        actorUserId: auth.userId,
        actorType: 'owner',
        action: 'menu.item_created',
        entityType: 'menu_item',
        entityId: row.id,
        branchId: branch.id,
        metadata: { name: row.name, priceMinor: row.priceMinor, foodType: row.foodType },
        ip: req.ip,
      });
      return reply.status(201).send(toMenuItem(deps.config, row));
    },
  );

  app.get(
    paths.partner.menuItem(':branchId', ':itemId'),
    { schema: { params: ItemParams, response: { 200: MenuItemSchema } } },
    async (req) => {
      const { branch } = await requireOwnedBranch(req, req.params.branchId);
      return toMenuItem(deps.config, await requireItem(deps.db, branch.id, req.params.itemId));
    },
  );

  app.patch(
    paths.partner.menuItem(':branchId', ':itemId'),
    {
      schema: { params: ItemParams, body: UpdateMenuItemSchema, response: { 200: MenuItemSchema } },
    },
    async (req) => {
      const { auth, branch } = await requireOwnedBranch(req, req.params.branchId);
      const item = await requireItem(deps.db, branch.id, req.params.itemId);
      if (item.isArchived) throw new AppError(409, 'conflict', 'Archived items cannot be edited.');
      if (req.body.categoryId) await requireCategory(deps.db, branch.id, req.body.categoryId);
      const [row] = await deps.db
        .update(menuItems)
        .set({ ...req.body, updatedAt: deps.clock() })
        .where(eq(menuItems.id, item.id))
        .returning();
      const changes: Record<string, unknown> = {};
      for (const key of Object.keys(req.body) as (keyof typeof req.body)[]) {
        changes[key] = { from: item[key as keyof typeof item], to: req.body[key] };
      }
      await audit(deps.db, {
        actorUserId: auth.userId,
        actorType: 'owner',
        action: 'menu.item_updated',
        entityType: 'menu_item',
        entityId: item.id,
        branchId: branch.id,
        metadata: changes,
        ip: req.ip,
      });
      return toMenuItem(deps.config, row!);
    },
  );

  app.post(
    paths.partner.menuItemArchive(':branchId', ':itemId'),
    { schema: { params: ItemParams, response: { 200: MenuItemSchema } } },
    async (req) => {
      const { auth, branch } = await requireOwnedBranch(req, req.params.branchId);
      const item = await requireItem(deps.db, branch.id, req.params.itemId);
      const [row] = await deps.db
        .update(menuItems)
        .set({ isArchived: true, isAvailable: false, updatedAt: deps.clock() })
        .where(eq(menuItems.id, item.id))
        .returning();
      await audit(deps.db, {
        actorUserId: auth.userId,
        actorType: 'owner',
        action: 'menu.item_archived',
        entityType: 'menu_item',
        entityId: item.id,
        branchId: branch.id,
        ip: req.ip,
      });
      return toMenuItem(deps.config, row!);
    },
  );

  // PUT is accepted alongside PATCH: the body is the full availability state either way.
  app.route({
    method: ['PATCH', 'PUT'],
    url: paths.partner.menuItemAvailability(':branchId', ':itemId'),
    schema: {
      params: ItemParams,
      body: SetAvailabilitySchema,
      response: { 200: MenuItemSchema },
    },
    handler: async (req) => {
      const { auth, branch } = await requireOwnedBranch(req, req.params.branchId);
      const item = await requireItem(deps.db, branch.id, req.params.itemId);
      if (item.isArchived && req.body.isAvailable) {
        throw new AppError(409, 'conflict', 'Archived items cannot be made available.');
      }
      const [row] = await deps.db
        .update(menuItems)
        .set({ isAvailable: req.body.isAvailable, updatedAt: deps.clock() })
        .where(eq(menuItems.id, item.id))
        .returning();
      await audit(deps.db, {
        actorUserId: auth.userId,
        actorType: 'owner',
        action: 'menu.item_availability',
        entityType: 'menu_item',
        entityId: item.id,
        branchId: branch.id,
        metadata: { isAvailable: req.body.isAvailable },
        ip: req.ip,
      });
      return toMenuItem(deps.config, row!);
    },
  });

  app.post(
    paths.partner.menuItemImage(':branchId', ':itemId'),
    { schema: { params: ItemParams, response: { 200: MenuItemSchema } } },
    async (req) => {
      const { auth, branch } = await requireOwnedBranch(req, req.params.branchId);
      const item = await requireItem(deps.db, branch.id, req.params.itemId);
      const part = await req.file({ limits: { fileSize: MENU_IMAGE_LIMITS.maxBytes, files: 1 } });
      if (!part) throw new AppError(422, 'document.invalid_file', 'Attach an image file.');
      const data = await part.toBuffer();
      if (part.file.truncated || data.length > MENU_IMAGE_LIMITS.maxBytes) {
        throw new AppError(413, 'document.invalid_file', 'Images must be 5 MB or smaller.');
      }
      const mime = sniffMime(data);
      if (!mime || !(MENU_IMAGE_LIMITS.mimeTypes as readonly string[]).includes(mime)) {
        throw new AppError(422, 'document.invalid_file', 'Use a JPEG, PNG or WebP image.');
      }
      const key = `menu/${branch.id}/${item.id}-${randomUUID()}.${EXT[mime]}`;
      await deps.storage.put('media', key, data);
      const [row] = await deps.db
        .update(menuItems)
        .set({ imageKey: key, updatedAt: deps.clock() })
        .where(and(eq(menuItems.id, item.id), eq(menuItems.branchId, branch.id)))
        .returning();
      await audit(deps.db, {
        actorUserId: auth.userId,
        actorType: 'owner',
        action: 'menu.item_image',
        entityType: 'menu_item',
        entityId: item.id,
        branchId: branch.id,
        metadata: { sizeBytes: data.length, mime },
        ip: req.ip,
      });
      return toMenuItem(deps.config, row!);
    },
  );

  // Public: menu photos are shown to customers. Only keys under menu/ are served.
  app.get('/media/menu/*', async (req, reply) => {
    const rest = (req.params as { '*': string })['*'];
    if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}-[0-9a-f-]{36}\.(jpg|png|webp)$/.test(rest))
      throw notFound();
    const stream = await deps.storage.read('media', `menu/${rest}`);
    if (!stream) throw notFound();
    const ext = rest.split('.').pop()!;
    const type = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
    return reply
      .header('Content-Type', type)
      .header('Cache-Control', 'public, max-age=86400, immutable')
      .header('X-Content-Type-Options', 'nosniff')
      .send(stream);
  });
}
