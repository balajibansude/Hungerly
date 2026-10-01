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
