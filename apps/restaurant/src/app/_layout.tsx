// Import only the weights in the type scale; the package index would bundle all 14 files.
import { PlusJakartaSans_400Regular } from '@expo-google-fonts/plus-jakarta-sans/400Regular';
import { PlusJakartaSans_500Medium } from '@expo-google-fonts/plus-jakarta-sans/500Medium';
import { PlusJakartaSans_600SemiBold } from '@expo-google-fonts/plus-jakarta-sans/600SemiBold';
import { PlusJakartaSans_700Bold } from '@expo-google-fonts/plus-jakarta-sans/700Bold';
import { PlusJakartaSans_800ExtraBold } from '@expo-google-fonts/plus-jakarta-sans/800ExtraBold';
import { colors } from '@hungerly/ui';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { routeAccessFor, useSessionStore } from '@/features/auth/session';
import { ServicesProvider } from '@/services';

// Keep the native splash visible until fonts are ready, so text never flashes unstyled.
SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });
  const session = useSessionStore((state) => state.session);
  const access = routeAccessFor(session);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [fontsLoaded, fontError]);

  // On font failure the app continues with system fonts rather than blocking the user.
  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <ServicesProvider>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.background },
            }}
          >
            {/* Startup gate: decides between login, onboarding and the restaurant workspace. */}
            <Stack.Screen name="index" options={{ animation: 'fade' }} />

            <Stack.Protected guard={access.signedOut}>
              <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
            </Stack.Protected>

            <Stack.Protected guard={access.needsOnboarding}>
              <Stack.Screen name="(onboarding)" options={{ animation: 'fade' }} />
            </Stack.Protected>

            <Stack.Protected guard={access.hasRestaurant}>
              {/* Shown once after registering; outside onboarding, so back can't return there. */}
              <Stack.Screen
                name="registration-complete"
                options={{ animation: 'fade', gestureEnabled: false }}
              />
              <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
            </Stack.Protected>
          </Stack>
        </ServicesProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
});
