import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { api, hasAccessToken } from './api';
import { APP_ENV } from './config';
import type { LatLng } from './types';

/**
 * Rider location sharing.
 *
 * Collected ONLY while the rider is online, sent in small batches, never stored on the phone. On Android
 * a persistent "you're online" notification (foreground service) keeps tracking visible. GPS-spoofed
 * (mock) points are dropped in production.
 *
 * Movement-based updates stop when a rider stands still (waiting at a restaurant), which made them look
 * offline to dispatch. A 30 s heartbeat now re-sends the current position regardless of movement.
 */

export const LOCATION_TASK = 'hungerly-rider-location';
const HEARTBEAT_MS = 30_000;

interface Ping extends LatLng {
  accuracy_m: number | null;
  recorded_at: string;
}

let buffer: Ping[] = [];
let lastFlush = 0;
let lastKnown: (LatLng & { at: number }) | null = null;
let watcher: Location.LocationSubscription | null = null;
let heartbeat: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<(p: LatLng) => void>();

function accept(loc: Location.LocationObject): void {
  if (APP_ENV === 'production' && loc.mocked) return;
  const p: Ping = {
    lat: loc.coords.latitude,
    lng: loc.coords.longitude,
    accuracy_m: loc.coords.accuracy ?? null,
    recorded_at: new Date(loc.timestamp).toISOString(),
  };
  lastKnown = { lat: p.lat, lng: p.lng, at: Date.now() };
  listeners.forEach((fn) => fn(p));
  buffer.push(p);
  if (buffer.length > 20) buffer = buffer.slice(-20);
}

async function flush(force = false): Promise<void> {
  if (!buffer.length || !hasAccessToken()) return;
  if (!force && Date.now() - lastFlush < 8_000) return;
  const points = buffer;
  buffer = [];
  lastFlush = Date.now();
  try {
    await api('/delivery/location', { method: 'POST', body: { points } });
  } catch {
    buffer = [...points.slice(-5), ...buffer].slice(-20); // keep the freshest points for the next try
  }
}

if (Platform.OS !== 'web') {
  // Background updates arrive here even when the app is not in the foreground.
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(LOCATION_TASK, async ({ data, error }) => {
    if (error || !data) return;
    data.locations.forEach(accept);
    await flush();
  });
}

export type PermissionResult = 'granted' | 'foreground_only' | 'denied' | 'services_off';

export async function foregroundPermission(): Promise<'granted' | 'denied' | 'services_off'> {
  if (!(await Location.hasServicesEnabledAsync())) return 'services_off';
  const fg = await Location.requestForegroundPermissionsAsync();
  return fg.status === 'granted' ? 'granted' : 'denied';
}

/** Background ("Allow all the time") is optional; asked separately with an explanation first. */
export async function backgroundPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const existing = await Location.getBackgroundPermissionsAsync();
    if (existing.status === 'granted') return true;
    if (!existing.canAskAgain) return false;
    return (await Location.requestBackgroundPermissionsAsync()).status === 'granted';
  } catch {
    return false; // Expo Go cannot run background location
  }
}

export async function hasBackgroundPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    return (await Location.getBackgroundPermissionsAsync()).status === 'granted';
  } catch {
    return false;
  }
}

export async function currentPosition(): Promise<LatLng> {
  if (lastKnown && Date.now() - lastKnown.at < 15_000) return { lat: lastKnown.lat, lng: lastKnown.lng };
  const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  if (APP_ENV === 'production' && loc.mocked) throw new Error('Mock locations are not allowed. Turn off any GPS spoofing apps.');
  accept(loc);
  return { lat: loc.coords.latitude, lng: loc.coords.longitude };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);
}

/**
 * Position for a delivery step / going online. Never hangs and never fails just because a precise fix
 * isn't available indoors: recent tracked point → quick fix (8 s) → last known position (≤10 min old).
 * Throws a clear, user-facing message only when location is genuinely unavailable.
 */
export async function positionForAction(): Promise<LatLng> {
  if (lastKnown && Date.now() - lastKnown.at < 60_000) return { lat: lastKnown.lat, lng: lastKnown.lng };
  let perm = await Location.getForegroundPermissionsAsync();
  if (perm.status !== 'granted' && perm.canAskAgain) perm = await Location.requestForegroundPermissionsAsync();
  if (perm.status !== 'granted') throw new Error('Location permission is off. Allow location for Hungerly Partner in Settings.');
  if (!(await Location.hasServicesEnabledAsync().catch(() => true))) throw new Error('Turn on location (GPS) and try again.');

  let loc: Location.LocationObject | null = null;
  try {
    loc = await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), 8_000);
  } catch {
    loc = null;
  }
  if (!loc) {
    try {
      loc = await Location.getLastKnownPositionAsync({ maxAge: 10 * 60_000 });
    } catch {
      loc = null;
    }
  }
  if (!loc) throw new Error("Couldn't get your location. Move near a window or open sky and try again.");
  if (APP_ENV === 'production' && loc.mocked) throw new Error('Mock locations are not allowed. Turn off any GPS spoofing apps.');
  accept(loc);
  return { lat: loc.coords.latitude, lng: loc.coords.longitude };
}

/** Last position without prompting (for showing the map before going online). */
export async function lastPosition(): Promise<LatLng | null> {
  if (lastKnown) return { lat: lastKnown.lat, lng: lastKnown.lng };
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (perm.status !== 'granted') return null;
    const loc = (await Location.getLastKnownPositionAsync()) ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    if (!loc) return null;
    lastKnown = { lat: loc.coords.latitude, lng: loc.coords.longitude, at: loc.timestamp };
    return { lat: lastKnown.lat, lng: lastKnown.lng };
  } catch {
    return null;
  }
}

export async function startTracking(): Promise<void> {
  await stopTracking();
  let background = false;
  if (await hasBackgroundPermission()) {
    try {
      await Location.startLocationUpdatesAsync(LOCATION_TASK, {
        accuracy: Location.Accuracy.High,
        timeInterval: 10_000,
        distanceInterval: 20,
        pausesUpdatesAutomatically: false,
        activityType: Location.ActivityType.AutomotiveNavigation,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: "You're online",
          notificationBody: 'Hungerly is sharing your location for deliveries.',
          notificationColor: '#C2410C',
        },
      });
      background = true;
    } catch {
      background = false;
    }
  }
  if (!background) {
    watcher = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, timeInterval: 10_000, distanceInterval: 20 }, (loc) => {
      accept(loc);
      void flush();
    });
  }
  heartbeat = setInterval(() => {
    void Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      .then((loc) => {
        accept(loc);
        return flush(true);
      })
      .catch(() => undefined);
  }, HEARTBEAT_MS);
}

export async function stopTracking(): Promise<void> {
  watcher?.remove();
  watcher = null;
  if (heartbeat) clearInterval(heartbeat);
  heartbeat = null;
  if (Platform.OS !== 'web') {
    try {
      if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
    } catch {
      /* task was not registered */
    }
  }
  buffer = [];
}

export function isTracking(): boolean {
  return heartbeat !== null;
}

export function onLocation(fn: (p: LatLng) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Live rider position for the map (null until known). */
export function useRiderPosition(): LatLng | null {
  const [pos, setPos] = useState<LatLng | null>(lastKnown ? { lat: lastKnown.lat, lng: lastKnown.lng } : null);
  useEffect(() => {
    let alive = true;
    void lastPosition().then((p) => alive && p && setPos(p));
    const off = onLocation((p) => setPos({ lat: p.lat, lng: p.lng }));
    return () => {
      alive = false;
      off();
    };
  }, []);
  return pos;
}

export function distanceM(a: LatLng, b: LatLng): number {
  const r = 6_371_000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * r * Math.asin(Math.sqrt(h)));
}
