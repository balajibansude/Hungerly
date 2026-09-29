import type {
  Address,
  Category,
  Food,
  Id,
  Menu,
  Offer,
  OrderSummary,
  Page,
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
}

export type RestaurantSort = 'relevance' | 'rating' | 'delivery_time' | 'distance';

export interface RestaurantQuery {
  cuisine?: string;
  sort?: RestaurantSort;
  pureVeg?: boolean;
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

export interface FoodWithRestaurant {
  food: Food;
  restaurant: Restaurant;
}

export interface FoodService {
  get(foodId: Id): Promise<FoodWithRestaurant>;
}

export interface HomeFeed {
  categories: Category[];
  promotions: Offer[];
  featured: RestaurantSummary[];
  popularFoods: { food: Food; restaurantName: string }[];
  nearby: RestaurantSummary[];
}

export interface SearchResults {
  restaurants: RestaurantSummary[];
  foods: { food: Food; restaurantName: string }[];
}

export interface CatalogService {
  getHomeFeed(): Promise<HomeFeed>;
  search(query: string): Promise<SearchResults>;
}

export interface LocationService {
  /** The address orders are delivered to. Address management arrives in a later phase. */
  getDeliveryAddress(): Promise<Address>;
}

export interface OrderService {
  listOrders(): Promise<Page<OrderSummary>>;
}

export interface Services {
  auth: AuthService;
  catalog: CatalogService;
  restaurants: RestaurantService;
  foods: FoodService;
  location: LocationService;
  orders: OrderService;
}
