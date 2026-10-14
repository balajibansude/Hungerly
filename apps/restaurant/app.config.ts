import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Extends app.json with values that must not be committed.
 * - GOOGLE_MAPS_ANDROID_API_KEY: Google Maps SDK for Android key for development/store
 *   builds (Expo Go needs none). Restrict it to the app's package name + SHA-1.
 * - GOOGLE_MAPS_IOS_API_KEY: only if Google Maps is wanted on iOS (Apple Maps otherwise).
 * - EXPO_PUBLIC_API_URL is read directly by the app (src/lib/api.ts).
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const androidKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY;
  const iosKey = process.env.GOOGLE_MAPS_IOS_API_KEY;
  const mapsPlugin: [string, Record<string, string>] | null =
    androidKey || iosKey
      ? [
          'react-native-maps',
          {
            ...(androidKey ? { androidGoogleMapsApiKey: androidKey } : {}),
            ...(iosKey ? { iosGoogleMapsApiKey: iosKey } : {}),
          },
        ]
      : null;
  return {
    ...config,
    name: config.name ?? 'Swaadone Partner',
    slug: config.slug ?? 'hungerly-restaurant',
    plugins: [...(config.plugins ?? []), ...(mapsPlugin ? [mapsPlugin] : [])],
  };
};
