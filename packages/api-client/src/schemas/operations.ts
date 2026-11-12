import { z } from 'zod';

import {
  IdSchema,
  IsoDateTimeSchema,
  LocalDateSchema,
  MoneySchema,
  pageSchema,
} from './common';

// --- Menu ---------------------------------------------------------------------------

/**
 * Explicit classification set by the owner; never inferred from the dish name.
 * Jain implies vegetarian, but plain veg is never treated as Jain.
 */
export const FoodTypeSchema = z.enum(['veg', 'non_veg', 'egg', 'jain']);
export type FoodType = z.infer<typeof FoodTypeSchema>;

export const MenuItemSchema = z.object({
  id: IdSchema,
  categoryId: IdSchema,
  name: z.string(),
  description: z.string(),
  price: MoneySchema,
  foodType: FoodTypeSchema,
  /** Public URL of the item photo, or null. */
  imageUrl: z.string().nullable(),
  isAvailable: z.boolean(),
  isArchived: z.boolean(),
  isBestseller: z.boolean(),
  prepMinutes: z.number().int().nullable(),
  sortOrder: z.number().int(),
  updatedAt: IsoDateTimeSchema,
});
export type MenuItem = z.infer<typeof MenuItemSchema>;

export const MenuCategorySchema = z.object({
  id: IdSchema,
  name: z.string(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
  items: z.array(MenuItemSchema),
});
export type MenuCategory = z.infer<typeof MenuCategorySchema>;

export const MenuSchema = z.object({ categories: z.array(MenuCategorySchema) });
export type Menu = z.infer<typeof MenuSchema>;

export const CreateCategorySchema = z.object({ name: z.string().trim().min(2).max(60) });
export const UpdateCategorySchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
});

export const MenuItemInputSchema = z.object({
  categoryId: IdSchema,
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(400).default(''),
  /** ₹1 – ₹50,000. */
  priceMinor: z.number().int().min(100).max(5_000_000),
  foodType: FoodTypeSchema,
  isAvailable: z.boolean().default(true),
  isBestseller: z.boolean().default(false),
  prepMinutes: z.number().int().min(1).max(120).nullable().default(null),
});
export type MenuItemInput = z.infer<typeof MenuItemInputSchema>;

export const UpdateMenuItemSchema = MenuItemInputSchema.partial();
export const SetAvailabilitySchema = z.object({ isAvailable: z.boolean() });

export const MENU_IMAGE_LIMITS = {
  maxBytes: 5 * 1024 * 1024,
  mimeTypes: ['image/jpeg', 'image/png', 'image/webp'] as const,
};

// --- Orders -------------------------------------------------------------------------

export const OrderStatusSchema = z.enum([
  'pending_payment',
  'placed',
  'preparing',
  'ready_for_pickup',
  'picked_up',
  'delivered',
  'cancelled',
]);
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

export const OrderRejectReasonSchema = z.enum(['item_out_of_stock', 'too_busy', 'closing', 'other']);

export const OrderItemSchema = z.object({
  id: IdSchema,
  menuItemId: IdSchema.nullable(),
  name: z.string(),
  foodType: FoodTypeSchema,
  quantity: z.number().int().positive(),
  unitPrice: MoneySchema,
  lineTotal: MoneySchema,
  options: z.array(z.object({ group: z.string(), name: z.string(), priceDelta: MoneySchema })),
  notes: z.string().nullable(),
});

export const OrderBillSchema = z.object({
  subtotal: MoneySchema,
  packagingFee: MoneySchema,
  deliveryFee: MoneySchema,
  platformFee: MoneySchema,
  tax: MoneySchema,
  tip: MoneySchema,
  discount: MoneySchema,
  /** Part of `discount` funded by the restaurant's own coupon (deducted from earnings). */
  restaurantFundedDiscount: MoneySchema,
  total: MoneySchema,
});

export const OrderEventSchema = z.object({
  status: OrderStatusSchema,
  at: IsoDateTimeSchema,
  actor: z.enum(['customer', 'restaurant', 'delivery_partner', 'system', 'admin']),
  note: z.string().nullable(),
});

export const OrderSchema = z.object({
  id: IdSchema,
  orderNumber: z.string(),
  branchId: IdSchema,
  status: OrderStatusSchema,
  paymentMethod: z.enum(['online', 'cod']),
  paymentStatus: z.enum([
    'pending',
    'paid',
    'failed',
    'refund_pending',
    'partially_refunded',
    'refunded',
    'not_applicable',
  ]),
  /** Restaurants see a first name and masked phone only (docs/SECURITY.md, Privacy). */
  customer: z.object({ firstName: z.string(), phoneMasked: z.string().nullable() }),
  delivery: z.object({
    locality: z.string().nullable(),
    distanceMeters: z.number().int().nullable(),
    rider: z.object({ firstName: z.string() }).nullable(),
  }),
  instructions: z.string().nullable(),
  items: z.array(OrderItemSchema),
  bill: OrderBillSchema,
  prepMinutes: z.number().int().nullable(),
  placedAt: IsoDateTimeSchema,
  acceptBy: IsoDateTimeSchema.nullable(),
  acceptedAt: IsoDateTimeSchema.nullable(),
  readyAt: IsoDateTimeSchema.nullable(),
  deliveredAt: IsoDateTimeSchema.nullable(),
  cancelledAt: IsoDateTimeSchema.nullable(),
  cancelledBy: z.enum(['customer', 'restaurant', 'system', 'admin']).nullable(),
  cancelReason: z.string().nullable(),
  timeline: z.array(OrderEventSchema),
  /** Optimistic-lock version: actions send it back and fail on mismatch. */
  version: z.number().int(),
  /** True for rows created by the development seed script. Never set in production. */
  isDevFixture: z.boolean(),
});
export type Order = z.infer<typeof OrderSchema>;

export const OrderListQuerySchema = z.object({
  status: z
    .union([OrderStatusSchema, z.enum(['active', 'history'])])
    .optional()
    .describe('active = placed|preparing|ready_for_pickup; history = everything else'),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const OrderPageSchema = pageSchema(OrderSchema);

export const AcceptOrderSchema = z.object({
  prepMinutes: z.number().int().min(5).max(90),
  expectedVersion: z.number().int(),
});
export const RejectOrderSchema = z.object({
  reason: OrderRejectReasonSchema,
  expectedVersion: z.number().int(),
});
export const MarkReadySchema = z.object({ expectedVersion: z.number().int() });

// --- Dashboard ----------------------------------------------------------------------

export const DashboardSchema = z.object({
  branchId: IdSchema,
  date: LocalDateSchema,
  orderCounts: z.object({
    placed: z.number().int(),
    preparing: z.number().int(),
    ready_for_pickup: z.number().int(),
    picked_up: z.number().int(),
    delivered: z.number().int(),
    cancelled: z.number().int(),
  }),
  /** Sum of item subtotals for today's non-cancelled orders (gross, before deductions). */
  grossSalesToday: MoneySchema,
  /** Last 7 local days, oldest first. */
  trend: z.array(z.object({ date: LocalDateSchema, orders: z.number().int(), grossSales: MoneySchema })),
  pendingActions: z.array(
    z.object({
      kind: z.enum([
        'onboarding_incomplete',
        'document_rejected',
        'document_pending',
        'document_expiring',
        'payout_account_missing',
        'payout_account_unverified',
        'payout_failed',
        'orders_waiting',
        'reviews_unanswered',
        'coupon_rejected',
      ]),
      message: z.string(),
    }),
  ),
  /** True if any figure above includes development seed data. */
  includesDevFixtures: z.boolean(),
});
export type Dashboard = z.infer<typeof DashboardSchema>;

export const DashboardQuerySchema = z.object({ date: LocalDateSchema.optional() });
