export interface Money {
  amount_minor: number;
  currency: string;
}

export interface Page<T> {
  items: T[];
  next_cursor: string | null;
}

export type OrderStatus =
  | 'pending_payment'
  | 'placed'
  | 'preparing'
  | 'ready_for_pickup'
  | 'picked_up'
  | 'delivered'
  | 'cancelled';

export interface Dashboard {
  live_orders: Record<'placed' | 'preparing' | 'ready_for_pickup' | 'picked_up', number>;
  needs_attention: { unassigned: number; delayed: number; awaiting_acceptance: number };
  riders: { online: number; on_delivery: number; idle: number; stale: number; pending_review: number };
  today: { orders: number; delivered: number; cancelled: number; gmv: Money };
  yesterday: { orders: number; gmv: Money };
  top_restaurants: { id: string; name: string; orders: number; gmv: Money }[];
}

export interface Address {
  id: string;
  label: string;
  line1: string | null;
  line2: string | null;
  landmark: string | null;
  locality: string;
  city: string;
  postal_code: string;
  location: { lat: number; lng: number };
  contact_phone: string | null;
  instructions: string | null;
}

export interface CustomerDetail {
  id: string;
  name: string | null;
  masked_phone: string | null;
  masked_email: string | null;
  has_email: boolean;
  phone_verified: boolean;
  roles: string[];
  status: 'active' | 'suspended' | 'deleted';
  created_at: string;
  last_login_at: string | null;
  stats: {
    orders: number;
    delivered: number;
    cancelled: number;
    total_spent: Money;
    average_order: Money;
    first_order_at: string | null;
    last_order_at: string | null;
    favourite_restaurant: string | null;
  };
  addresses: Address[];
  recent_orders: { id: string; order_number: string; restaurant_name: string; status: OrderStatus; total: Money; placed_at: string }[];
  sessions: { id: string; client_app: string; device_name: string | null; last_used_at: string; created_at: string }[];
  delivery_partner: { id: string; status: string } | null;
}

export interface UserReveal {
  phone_e164: string | null;
  email: string | null;
  addresses: Address[];
}

export interface OrderReveal {
  customer_phone_e164: string | null;
  customer_email: string | null;
  delivery_contact_phone_e164: string | null;
  delivery_contact_name: string | null;
}

export interface PartnerReveal {
  phone_e164: string | null;
  email: string | null;
  vehicle_registration: string | null;
  driving_license_number: string | null;
  documents_visible: boolean;
}

export interface RestaurantDetail {
  id: string;
  name: string;
  description: string | null;
  status: string;
  status_reason: string | null;
  is_accepting_orders: boolean;
  phone_e164: string;
  address: string;
  location: { lat: number; lng: number };
  cuisines: string[];
  image_url: string | null;
  rating: { average: number; count: number };
  commission_bps: number;
  avg_prep_minutes: number;
  min_order: Money;
  packaging_fee: Money;
  is_pure_veg: boolean;
  stats: { orders_today: number; gmv_today: Money; live_orders: number; rejected_by_restaurant: number; orders_all_time: number };
  menu: { id: string; name: string; items: { id: string; name: string; price: Money; food_type: 'veg' | 'non_veg' | 'egg'; is_available: boolean; is_bestseller: boolean }[] }[];
  recent_orders: { id: string; order_number: string; status: OrderStatus; total: Money; placed_at: string }[];
}

export interface SearchResults {
  orders: { id: string; order_number: string; status: OrderStatus; total: Money }[];
  people: { id: string; name: string | null; masked_phone: string | null; roles: string[]; delivery_partner_id: string | null }[];
  restaurants: { id: string; name: string; locality: string; status: string }[];
}

export interface DayPoint {
  date: string;
  orders: number;
  gmv: Money;
}

export interface OrderRow {
  id: string;
  order_number: string;
  status: OrderStatus;
  restaurant_name: string;
  customer_name: string;
  rider_name: string | null;
  item_count: number;
  total: Money;
  payment_method: 'cod' | 'online';
  payment_status: string;
  locality: string | null;
  placed_at: string;
  estimated_delivery_at: string | null;
  is_delayed: boolean;
  version: number;
}

export interface Assignment {
  id: string;
  status: string;
  rider_name: string | null;
  vehicle_type: string | null;
  delivery_partner_id: string;
  manual: boolean;
  offered_at: string;
  responded_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  payout: Money;
  cancel_reason: string | null;
}

export interface OrderDetail {
  id: string;
  order_number: string;
  status: OrderStatus;
  version: number;
  payment_method: 'cod' | 'online';
  payment_status: string;
  restaurant: { id: string; name: string; phone_e164: string; locality: string } | null;
  customer: { id: string; name: string | null; masked_phone: string | null };
  delivery_location: { lat: number; lng: number };
  delivery_address: Record<string, string | null>;
  delivery_distance_m: number;
  items: {
    name: string;
    food_type: 'veg' | 'non_veg' | 'egg';
    quantity: number;
    options: { group_name: string; option_name: string; price_delta_minor: number }[];
    line_total: Money;
    notes: string | null;
  }[];
  bill: Record<string, number>;
  special_instructions: string | null;
  timeline: { status: OrderStatus; from: string | null; at: string; actor: string; reason: string | null }[];
  assignments: Assignment[];
  placed_at: string | null;
  estimated_ready_at: string | null;
  estimated_delivery_at: string | null;
  cancellation_reason: string | null;
  cancelled_by: string | null;
  issues: { kind: string; note: string | null; at: string; reported_by: string | null }[];
}

export interface AvailableRider {
  id: string;
  name: string | null;
  vehicle_type: string | null;
  rating: number;
  distance_m: number | null;
  location_fresh: boolean;
}

export type PartnerStatus = 'onboarding' | 'pending_review' | 'active' | 'suspended' | 'rejected' | 'offboarded';

export interface PartnerRow {
  id: string;
  user_id: string;
  name: string | null;
  masked_phone: string | null;
  status: PartnerStatus;
  status_reason: string | null;
  zone: string | null;
  vehicle_type: string | null;
  is_online: boolean;
  rating: number;
  submitted_at: string | null;
  approved_at: string | null;
  created_at: string;
}

export interface PartnerDetail extends PartnerRow {
  masked_email: string | null;
  vehicle_registration: string | null;
  driving_license_number: string | null;
  last_location: { lat: number; lng: number } | null;
  reachable: boolean;
  last_online_at: string | null;
  stats: { delivered: number; earned: Money; declined_or_missed: number; offers: number; acceptance_rate: number | null };
  recent_deliveries: { id: string; order_id: string; order_number: string; restaurant_name: string; status: string; payout: Money; at: string }[];
}

export interface RestaurantRow {
  id: string;
  name: string;
  locality: string;
  status: string;
  is_accepting_orders: boolean;
  cuisines: string[];
  rating: number;
  commission_bps: number;
  live_orders: number;
  image_url: string | null;
}

export interface UserRow {
  id: string;
  name: string | null;
  masked_phone: string | null;
  masked_email: string | null;
  roles: string[];
  status: 'active' | 'suspended' | 'deleted';
  orders: number;
  total_spent: Money;
  created_at: string;
  last_login_at: string | null;
}

export interface AdminRow {
  id: string;
  email: string;
  name: string | null;
  admin_role: 'super_admin' | 'operations' | 'support' | 'finance';
  is_active: boolean;
  mfa_enrolled: boolean;
  last_login_at: string | null;
}

export interface AuditRow {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  actor: string;
  actor_role: string | null;
  changes: Record<string, unknown> | null;
  ip_address: string | null;
  request_id: string | null;
  created_at: string;
}

export interface LiveRider {
  id: string;
  name: string | null;
  vehicle_type: string | null;
  assignment_status: string | null;
  location: { lat: number; lng: number } | null;
  reachable: boolean;
}
