import type { Address, GeoPoint } from '@hungerly/types';

export const defaultAddress: Address = {
  id: 'a-home',
  label: 'home',
  line1: 'Flat 402, Amar Residency',
  line2: 'Lane 6',
  landmark: 'Near Osho Garden',
  locality: 'Koregaon Park',
  city: 'Pune',
  postalCode: '411001',
  location: { lat: 18.5362, lng: 73.8939 },
};

export const workAddress: Address = {
  id: 'a-work',
  label: 'work',
  line1: 'Office 7B, Panchshil Tech Park',
  line2: 'Yerwada',
  landmark: 'Opposite Don Bosco School',
  locality: 'Yerawada',
  city: 'Pune',
  postalCode: '411006',
  location: { lat: 18.5513, lng: 73.8889 },
};

/** The starting saved addresses: Home (selected) and Work. */
export const sampleAddresses: Address[] = [defaultAddress, workAddress];

/**
 * PROTOTYPE ONLY. Location given to addresses typed in by hand (Pune city centre) until a
 * map picker or device location exists. Not suitable for real delivery-area checks.
 */
export const placeholderLocation: GeoPoint = { lat: 18.5204, lng: 73.8567 };
