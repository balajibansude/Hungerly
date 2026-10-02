import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * APP_ENV=production builds only talk HTTPS (Android cleartext disabled, iOS ATS on) and the app refuses a
 * non-HTTPS API URL at runtime. Development builds allow plain HTTP so a phone can reach a laptop on the LAN.
 */
const isProduction = process.env.APP_ENV === 'production';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Hungerly Partner',
  slug: 'hungerly-partner',
  version: '1.0.0',
  scheme: 'hungerlypartner',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'app.hungerly.partner',
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        'Hungerly shares your location while you are online so we can send you nearby orders and customers can track their delivery.',
      NSLocationAlwaysAndWhenInUseUsageDescription:
        'Allow location while the app is in the background so deliveries keep updating when you switch to navigation.',
      NSFaceIDUsageDescription: 'Use Face ID to unlock Hungerly Partner.',
      UIBackgroundModes: ['location'],
      ...(isProduction ? {} : { NSAppTransportSecurity: { NSAllowsLocalNetworking: true } }),
    },
  },
  android: {
    package: 'app.hungerly.partner',
    adaptiveIcon: {
      backgroundColor: '#1F332C',
      foregroundImage: './assets/android-icon-foreground.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    permissions: [
      'ACCESS_COARSE_LOCATION',
      'ACCESS_FINE_LOCATION',
      'ACCESS_BACKGROUND_LOCATION',
      'FOREGROUND_SERVICE',
      'FOREGROUND_SERVICE_LOCATION',
      'USE_BIOMETRIC',
      'VIBRATE',
    ],
    blockedPermissions: ['android.permission.READ_CONTACTS', 'android.permission.RECORD_AUDIO'],
    allowBackup: false, // keeps tokens out of cloud backups
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    'expo-router',
    'expo-font',
    'expo-secure-store',
    [
      'expo-location',
      {
        locationAlwaysAndWhenInUsePermission:
          'Allow location while the app is in the background so deliveries keep updating when you switch to navigation.',
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
      },
    ],
    ['expo-local-authentication', { faceIDPermission: 'Use Face ID to unlock Hungerly Partner.' }],
    ['expo-build-properties', { android: { usesCleartextTraffic: !isProduction } }],
    ['expo-splash-screen', { backgroundColor: '#1F332C', image: './assets/splash-icon.png', imageWidth: 140 }],
  ],
  experiments: { typedRoutes: false },
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL,
    appEnv: isProduction ? 'production' : 'development',
  },
});
