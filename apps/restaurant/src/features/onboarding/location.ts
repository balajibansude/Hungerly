import { BranchLocationSchema, type BranchLocation } from '@hungerly/api-client';

export interface MapPoint {
  latitude: number;
  longitude: number;
}

export interface MapRegion extends MapPoint {
  latitudeDelta: number;
  longitudeDelta: number;
}

/** Whole-India view, shown until the owner searches or places the pin. */
export const INDIA_REGION: MapRegion = {
  latitude: 22.5,
  longitude: 79.0,
  latitudeDelta: 24,
  longitudeDelta: 24,
};

/** Street-level zoom around a point, close enough to drag the pin onto the right building. */
export function streetRegion(point: MapPoint): MapRegion {
  return { ...point, latitudeDelta: 0.005, longitudeDelta: 0.005 };
}

/** True for a real, in-range coordinate pair (rejects null, NaN and out-of-range values). */
export function isValidPoint(point: { latitude: number | null; longitude: number | null }): point is MapPoint {
  const { latitude, longitude } = point;
  return (
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

/**
 * The `location` body for `PATCH /partner/branches/:id` from the pin the owner placed,
 * or null when no valid pin is selected yet (the step must not continue then).
 */
export function mapPinLocation(point: { latitude: number | null; longitude: number | null }): BranchLocation | null {
  if (!isValidPoint(point)) return null;
  const parsed = BranchLocationSchema.safeParse({ lat: point.latitude, lng: point.longitude, source: 'map_pin' });
  return parsed.success ? parsed.data : null;
}

/** A search phrase built from the address typed so far, to prefill the map search. */
export function addressSearchText(parts: {
  addressLine1: string;
  locality: string;
  city: string;
  state: string;
  pinCode: string;
}): string {
  return [parts.addressLine1, parts.locality, parts.city, parts.state, parts.pinCode]
    .map((p) => p.trim())
    .filter(Boolean)
    .join(', ');
}
