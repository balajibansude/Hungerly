export interface Money {
  amount_minor: number;
  currency: string;
}

export type PartnerStatus = 'onboarding' | 'pending_review' | 'active' | 'suspended' | 'rejected' | 'offboarded';
export type VehicleType = 'bicycle' | 'motorcycle' | 'scooter' | 'ev_scooter';

export interface Partner {
  id: string;
  status: PartnerStatus;
  status_reason: string | null;
  full_name: string | null;
  phone_e164: string | null;
  zone_id: string | null;
  vehicle_type: VehicleType | null;
  vehicle_registration: string | null;
  is_online: boolean;
  rating: { average: number; count: number };
  onboarding: { profile: boolean; vehicle: boolean; zone: boolean; submitted: boolean };
}

export type AssignmentStatus =
  | 'offered'
  | 'accepted'
  | 'arrived_at_restaurant'
  | 'picked_up'
  | 'arrived_at_customer'
  | 'delivered'
  | 'cancelled'
  | 'rejected'
  | 'expired'
  | 'failed';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Assignment {
  id: string;
  status: AssignmentStatus;
  version: number;
  offer_expires_at: string | null;
  order: {
    id: string;
    order_number: string;
    status: string;
    item_count: number;
    payment_method: 'cod' | 'online';
    cash_to_collect: Money;
    estimated_ready_at: string | null;
  };
  pickup: { name: string; address: string; location: LatLng; phone_e164: string | null };
  drop: {
    locality: string | null;
    location: LatLng | null;
    line1?: string | null;
    line2?: string | null;
    landmark?: string | null;
    contact_name?: string | null;
    contact_phone_e164?: string | null;
    masked_phone?: string | null;
    instructions?: string | null;
  };
  pickup_distance_m: number | null;
  drop_distance_m: number | null;
  estimated_payout: Money;
  items?: { name: string; quantity: number }[];
}

export interface Earnings {
  from: string;
  to: string;
  total_earned: Money;
  total_deliveries: number;
  cash_in_hand: Money;
  days: { date: string; deliveries: number; earned: Money; cash_collected: Money }[];
}

export interface HistoryItem {
  id: string;
  order_number: string;
  restaurant_name: string;
  status: 'delivered' | 'cancelled' | 'failed';
  earned: Money;
  distance_m: number;
  delivered_at: string | null;
  created_at: string;
}

export interface Page<T> {
  items: T[];
  next_cursor: string | null;
}

export interface Zone {
  id: string;
  name: string;
}
