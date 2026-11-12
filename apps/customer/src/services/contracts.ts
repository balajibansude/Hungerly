import type {
  Address,
  CartItem,
  Category,
  Food,
  Id,
  ImageRef,
  Menu,
  Money,
  Offer,
  OrderSummary,
  Page,
  PaymentMethod,
  Restaurant,
  RestaurantSummary,
  Session,
  User,
} from '@hungerly/types';

/**
 * Service contracts: the only way UI code talks to data.
 *
 *   UI (screens, hooks) → Service interfaces (this file) → implementation
 *                                                           ├─ mock (now)
 *                                                           └─ API client → backend (later)
 *
 * Contracts are expressed in domain types, not wire formats, so the backend technology
 * (FastAPI REST, Supabase, …) can change without touching screens. Implementations throw
 * `ServiceError` (see errors.ts) for expected failures.
 */

export interface OtpChallenge {
  requestId: string;
  expiresInSeconds: number;
  resendAfterSeconds: number;
}

export interface AuthService {
  /** Restores a previous session, or returns null if the user must sign in. */
  restoreSession(): Promise<Session | null>;
  requestOtp(phoneE164: string): Promise<OtpChallenge>;
  /** Signs in (or signs up on first use). */
  verifyOtp(requestId: string, code: string): Promise<Session>;
  updateProfile(input: { fullName: string; email?: string }): Promise<User>;
  signOut(): Promise<void>;
  /**
   * Requests account deletion (`DELETE /me`): sessions are revoked at once and personal
   * data is erased by a backend job (SECURITY.md → Privacy). Resolves only when the
   * server accepted the request.
   */
  requestAccountDeletion(): Promise<void>;
}

export type RestaurantSort = 'relevance' | 'rating' | 'delivery_time' | 'distance';

export interface RestaurantQuery {
  cuisine?: string;
  sort?: RestaurantSort;
  /** Only restaurants that serve exclusively vegetarian food. */
  pureVeg?: boolean;
  /** Only restaurants that serve non-vegetarian items (not pure-veg). */
  nonVeg?: boolean;
  /** Only restaurants that explicitly carry Jain-marked menu items. */
  jain?: boolean;
  minRating?: number;
  maxDeliveryMinutes?: number;
  hasOffer?: boolean;
  cursor?: string;
  limit?: number;
}

export interface RestaurantService {
  list(query?: RestaurantQuery): Promise<Page<RestaurantSummary>>;
  get(id: Id): Promise<Restaurant>;
  getMenu(id: Id): Promise<Menu>;
}

/**
 * A dish with the restaurant it comes from. Listings carry the restaurant so dish cards
 * can show its open/closed state and add to the cart without another request.
 */
export interface FoodWithRestaurant {
  food: Food;
  restaurant: Restaurant;
}

export interface FoodService {
  get(foodId: Id): Promise<FoodWithRestaurant>;
}

export interface HomeFeed {
  categories: Category[];
  promotions: OfferListing[];
  popularFoods: FoodWithRestaurant[];
  nearby: RestaurantSummary[];
}

export interface SearchResults {
  restaurants: RestaurantSummary[];
  foods: FoodWithRestaurant[];
}

/** Night-time surcharge info returned by the public pricing config endpoint. */
export interface NightChargeInfo {
  enabled: boolean;
  /** True when the server's current IST time falls inside the configured night window. */
  isNightNow: boolean;
  chargeType: 'fixed' | 'percent';
  /** Paise, for chargeType 'fixed'. Zero when not fixed. */
  amountMinor: number;
  /** Basis points (1/100 of a percent), for chargeType 'percent'. Null when not percent. */
  percentBps: number | null;
  /** Night window start in IST, "HH:MM". */
  nightStart: string;
  /** Night window end in IST, "HH:MM" (may be earlier than nightStart — crosses midnight). */
  nightEnd: string;
}

export interface PricingConfig {
  nightCharge: NightChargeInfo;
}

export interface CatalogService {
  getHomeFeed(): Promise<HomeFeed>;
  /** Every cuisine customers can filter by (`GET /catalog/cuisines`). */
  listCuisines(): Promise<Category[]>;
  search(query: string): Promise<SearchResults>;
  /**
   * Dishes with a dish-level deal (`originalPrice` above `price`). Proposed endpoint
   * (`GET /catalog/deals`); not in the API blueprint yet.
   */
  listDeals(): Promise<FoodWithRestaurant[]>;
  /** Platform pricing config: current night-charge status and amount for the cart estimate. */
  getPricingConfig(): Promise<PricingConfig>;
}

/** Fields a customer enters for an address. `location` is optional until a map picker exists. */
export type AddressInput = Omit<Address, 'id' | 'location'> & { location?: Address['location'] };

export interface SavedAddresses {
  addresses: Address[];
  /** The address orders are delivered to; always one of `addresses`. */
  selectedId: Id;
}

export interface LocationService {
  /** The address orders are delivered to (the selected saved address). */
  getDeliveryAddress(): Promise<Address>;
  listAddresses(): Promise<SavedAddresses>;
  /** Adds an address, or edits the one with `id`. Validates the fields. */
  saveAddress(input: AddressInput & { id?: Id }): Promise<Address>;
  /** Removes an address. The last remaining address cannot be removed. */
  deleteAddress(id: Id): Promise<void>;
  /** Makes an address the delivery address. */
  setDeliveryAddress(id: Id): Promise<Address>;
}

export interface PlaceOrderInput {
  restaurantId: Id;
  items: CartItem[];
  deliveryAddressId: Id;
  paymentMethod: PaymentMethod;
  /** The bill total the customer agreed to. The backend will recompute and verify it. */
  total: Money;
}

/** One section of post-order instructions. Voice notes are duration-only until audio exists. */
export interface InstructionSet {
  options: string[];
  note: string;
  voiceNote: { durationSeconds: number } | null;
}

/** Instructions attached to a placed order; the two audiences are always kept separate. */
export interface OrderInstructions {
  restaurant: InstructionSet;
  delivery: InstructionSet;
}

export interface OrderService {
  listOrders(): Promise<Page<OrderSummary>>;
  /**
   * Places an order for the cart. Proposed endpoint (`POST /customer/orders`); mock only
   * for now. Each call creates a new order, so callers must not retry it blindly.
   */
  placeOrder(input: PlaceOrderInput): Promise<OrderSummary>;
  /**
   * Attaches (or replaces) the instructions of an already placed order. Never creates an
   * order or touches payment. Proposed endpoint (`PUT /customer/orders/:id/instructions`).
   */
  saveInstructions(orderId: Id, instructions: OrderInstructions): Promise<void>;
}

export interface OfferListing {
  offer: Offer;
  /** Set for restaurant-specific offers; platform-wide offers have none. */
  restaurant?: { id: Id; name: string; image?: ImageRef };
}

export interface OfferService {
  /**
   * Offers the customer can currently see. Signed in, this maps to
   * `GET /customer/coupons`; the API blueprint has no public listing for guests yet.
   */
  listAvailable(): Promise<OfferListing[]>;
}

/** The signed-in customer's favourite restaurants (`/customer/favorites`). */
export interface FavoritesService {
  list(): Promise<RestaurantSummary[]>;
  /** Idempotent: adding an existing favourite is not an error. */
  add(restaurantId: Id): Promise<void>;
  remove(restaurantId: Id): Promise<void>;
}

export interface Services {
  auth: AuthService;
  catalog: CatalogService;
  restaurants: RestaurantService;
  foods: FoodService;
  location: LocationService;
  orders: OrderService;
  favorites: FavoritesService;
  offers: OfferService;
}
