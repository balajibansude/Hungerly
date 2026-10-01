/**
 * Client-side domain types.
 *
 * These mirror the entities in docs/DATABASE_SCHEMA.md and docs/API_BLUEPRINT.md using
 * camelCase field names. When the backend contract exists, the API client maps its
 * responses into these types, so screens never depend on wire formats.
 */

export type Id = string;

/** ISO 4217 code. The MVP operates in INR only. */
export type CurrencyCode = 'INR';

/** Money is always an integer amount in minor units (paise). Never use floats for money. */
export interface Money {
  amountMinor: number;
  currency: CurrencyCode;
}

/** Matches `menu_items.food_type`. */
export type FoodType = 'veg' | 'non_veg' | 'egg';

export interface ImageRef {
  uri: string;
  /** Short description for screen readers. */
  alt: string;
}

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface Range {
  min: number;
  max: number;
}

export interface RatingSummary {
  average: number;
  count: number;
}

export interface Category {
  id: Id;
  slug: string;
  name: string;
  image: ImageRef;
}

/** 1 = budget, 2 = moderate, 3 = premium. Shown as ₹, ₹₹, ₹₹₹. */
export type PriceLevel = 1 | 2 | 3;

/** Mirrors `coupons.discount_type`. The server applies discounts; clients only estimate. */
export type DiscountRule =
  | { kind: 'percent'; percentBps: number; maxDiscount: Money; minimumOrder: Money }
  | { kind: 'flat'; amount: Money; minimumOrder: Money };

export interface Offer {
  id: Id;
  /** Short label shown on cards, e.g. "20% off up to ₹100". */
  label: string;
  description: string;
  code?: string;
  restaurantId?: Id;
  rule: DiscountRule;
}

export interface RestaurantSummary {
  id: Id;
  slug: string;
  name: string;
  cuisines: string[];
  image: ImageRef;
  rating: RatingSummary;
  deliveryTimeMinutes: Range;
  distanceMeters: number;
  priceLevel: PriceLevel;
  costForTwo: Money;
  isOpen: boolean;
  isPureVeg: boolean;
  offer?: Offer;
}

export interface Restaurant extends RestaurantSummary {
  description: string;
  locality: string;
  deliveryFee: Money;
  minimumOrder: Money;
}

export interface FoodOption {
  id: Id;
  name: string;
  priceDelta: Money;
  isAvailable: boolean;
}

export interface FoodOptionGroup {
  id: Id;
  name: string;
  minSelect: number;
  maxSelect: number;
  options: FoodOption[];
}

export interface Food {
  id: Id;
  restaurantId: Id;
  categoryId: Id;
  name: string;
  description: string;
  price: Money;
  foodType: FoodType;
  image?: ImageRef;
  rating?: RatingSummary;
  isAvailable: boolean;
  isBestseller: boolean;
  optionGroups: FoodOptionGroup[];
}

export interface MenuCategory {
  id: Id;
  name: string;
  foods: Food[];
}

export interface Menu {
  restaurantId: Id;
  categories: MenuCategory[];
}

export interface SelectedOption {
  groupId: Id;
  groupName: string;
  optionId: Id;
  optionName: string;
  priceDelta: Money;
}

export interface CartItem {
  /** Stable key: food id + selected option ids. Identical selections merge. */
  lineId: string;
  foodId: Id;
  restaurantId: Id;
  name: string;
  foodType: FoodType;
  image?: ImageRef;
  basePrice: Money;
  selectedOptions: SelectedOption[];
  quantity: number;
  notes?: string;
}

export type AddressLabel = 'home' | 'work' | 'other';

export interface Address {
  id: Id;
  label: AddressLabel;
  line1: string;
  line2?: string;
  landmark?: string;
  locality: string;
  city: string;
  postalCode: string;
  location: GeoPoint;
}

/** Matches `orders.status` in the database schema. */
export type OrderStatus =
  | 'pending_payment'
  | 'placed'
  | 'preparing'
  | 'ready_for_pickup'
  | 'picked_up'
  | 'delivered'
  | 'cancelled';

export interface OrderLine {
  name: string;
  quantity: number;
  lineTotal: Money;
}

export interface OrderSummary {
  id: Id;
  orderNumber: string;
  restaurantId: Id;
  restaurantName: string;
  status: OrderStatus;
  lines: OrderLine[];
  total: Money;
  placedAt: string;
}

export interface User {
  id: Id;
  phoneE164: string;
  fullName: string | null;
  email: string | null;
}

export interface Session {
  user: User;
  isNewUser: boolean;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

// ---------------------------------------------------------------------------
// Restaurant partner (restaurant app). Mirrors DATABASE_SCHEMA §4.3, §4.4, §4.6, §4.9.
// ---------------------------------------------------------------------------

/** Matches `restaurant_staff.staff_role`. */
export type StaffRole = 'owner' | 'manager' | 'staff';

/** Matches `restaurants.status` (lifecycle in BLUEPRINT §26). */
export type RestaurantLifecycleStatus =
  'draft' | 'pending_review' | 'active' | 'suspended' | 'rejected' | 'closed';

/** Matches `restaurants.food_type`. */
export type RestaurantFoodType = 'veg_only' | 'mixed';

/** ISO weekday as stored in `restaurant_hours.day_of_week`: 0 = Monday … 6 = Sunday. */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** 24-hour wall-clock time "HH:MM" in the restaurant's city timezone. */
export type LocalTime = string;

/**
 * One opening slot (`restaurant_hours`). A day may have several (split shifts).
 * `closesAt <= opensAt` means the slot crosses midnight into the next day.
 */
export interface OpeningHoursSlot {
  dayOfWeek: DayOfWeek;
  opensAt: LocalTime;
  closesAt: LocalTime;
}

export interface RestaurantAddress {
  line1: string;
  line2?: string;
  locality: string;
  city: string;
  state: string;
  postalCode: string;
  location?: GeoPoint;
}

/** The restaurant as its own staff see and edit it (`GET /partner/restaurants/{id}`). */
export interface PartnerRestaurant {
  id: Id;
  slug: string;
  name: string;
  legalName?: string;
  description: string;
  phoneE164: string;
  email: string | null;
  address: RestaurantAddress;
  cuisines: string[];
  foodType: RestaurantFoodType;
  status: RestaurantLifecycleStatus;
  /** The online/offline toggle (`is_accepting_orders`). */
  isAcceptingOrders: boolean;
  avgPrepMinutes: number;
  minimumOrder: Money;
  packagingFee: Money;
  hours: OpeningHoursSlot[];
  logo?: ImageRef;
  coverImage?: ImageRef;
  fssaiLicenseNumber?: string;
  gstin?: string;
  rating: RatingSummary;
}

export interface RestaurantMembership {
  restaurantId: Id;
  restaurantName: string;
  role: StaffRole;
}

/** Restaurant staff can sign in with phone or email, so either may be unknown. */
export interface StaffUser {
  id: Id;
  fullName: string | null;
  phoneE164: string | null;
  email: string | null;
}

export interface PartnerSession {
  user: StaffUser;
  /** Restaurants this user works at. Empty for a new owner who has not onboarded yet. */
  memberships: RestaurantMembership[];
}

/** A dish as managed by the restaurant: the customer-facing `Food` plus management fields. */
export interface PartnerMenuItem extends Food {
  /** `false` hides the item from the menu entirely (`menu_items.is_active`). */
  isActive: boolean;
  /**
   * Typical preparation time. Client-side prototype field: the schema only has
   * `restaurants.avg_prep_minutes` today (see docs/frontend/RESTAURANT_APP.md).
   */
  prepMinutes: number;
}

export interface PartnerMenuCategory {
  id: Id;
  name: string;
  isActive: boolean;
  items: PartnerMenuItem[];
}

export interface PartnerMenu {
  restaurantId: Id;
  categories: PartnerMenuCategory[];
}

/** Matches `orders.payment_method`. */
export type PaymentMethod = 'online' | 'cod';

/** Matches `orders.payment_status`. */
export type PaymentStatus =
  | 'pending'
  | 'paid'
  | 'failed'
  | 'refund_pending'
  | 'partially_refunded'
  | 'refunded'
  | 'not_applicable';

/** Matches `orders.cancelled_by` and `order_status_events.actor_type`. */
export type OrderActor = 'customer' | 'restaurant' | 'delivery_partner' | 'system' | 'admin';

/** Reason codes for `POST .../orders/{id}/reject` (API_BLUEPRINT §4.17). */
export type OrderRejectReason = 'item_out_of_stock' | 'too_busy' | 'closing' | 'other';

/**
 * Server-computed amounts, snapshotted on the order (`orders.*_minor`). Invariant:
 * total = subtotal + packagingFee + deliveryFee + platformFee + tax + tip − discount.
 */
export interface OrderBill {
  subtotal: Money;
  packagingFee: Money;
  deliveryFee: Money;
  platformFee: Money;
  tax: Money;
  tip: Money;
  discount: Money;
  total: Money;
}

/** Snapshot of a chosen option (`order_item_options`). */
export interface OrderItemOption {
  groupName: string;
  optionName: string;
  priceDelta: Money;
}

/** Snapshot of an ordered dish (`order_items`). `lineTotal = (unitPrice + optionsPrice) × quantity`. */
export interface OrderItem {
  id: Id;
  menuItemId: Id | null;
  name: string;
  foodType: FoodType;
  unitPrice: Money;
  /** Sum of selected option price deltas, per unit. */
  optionsPrice: Money;
  quantity: number;
  lineTotal: Money;
  options: OrderItemOption[];
  notes?: string;
}

/** One row of the append-only order history (`order_status_events`). */
export interface OrderStatusEvent {
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  actor: OrderActor;
  at: string;
}

/** An order as the restaurant sees it: customer phone masked, no full address (API_BLUEPRINT §3.7). */
export interface PartnerOrder {
  id: Id;
  orderNumber: string;
  restaurantId: Id;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  customer: { firstName: string; phoneMasked: string };
  items: OrderItem[];
  bill: OrderBill;
  specialInstructions?: string;
  delivery: {
    locality: string;
    distanceMeters: number;
    rider: { name: string; phoneMasked: string } | null;
  };
  /** Minutes promised when accepting (5–90). */
  prepMinutes: number | null;
  placedAt: string;
  acceptedAt: string | null;
  estimatedReadyAt: string | null;
  readyAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  cancelledBy: OrderActor | null;
  cancellationReason: string | null;
  timeline: OrderStatusEvent[];
  /** Optimistic-lock version (`orders.version`). */
  version: number;
}

/** Matches `notifications.category`. */
export type NotificationCategory =
  'order' | 'delivery' | 'payment' | 'account' | 'promotion' | 'system';

/** An in-app inbox entry (`notifications`). */
export interface AppNotification {
  id: Id;
  category: NotificationCategory;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
  /** Deep-link payload. */
  data?: { orderId?: Id };
}

/** Calendar date "YYYY-MM-DD" in the restaurant's timezone. */
export type LocalDate = string;

export interface DailySales {
  date: LocalDate;
  orders: number;
  revenue: Money;
}

export interface TopDish {
  menuItemId: Id;
  name: string;
  foodType: FoodType;
  quantity: number;
  revenue: Money;
}

/** `GET /partner/restaurants/{id}/reports/summary?from&to`. Revenue excludes cancelled orders. */
export interface SalesSummary {
  from: LocalDate;
  to: LocalDate;
  orders: number;
  cancelledOrders: number;
  revenue: Money;
  averageOrderValue: Money;
  daily: DailySales[];
  topDishes: TopDish[];
}
