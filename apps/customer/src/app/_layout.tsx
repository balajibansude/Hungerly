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

import { useSessionStore } from '@/features/auth/session';
import { FavoritesSync } from '@/features/favorites/FavoritesSync';
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
  const isSignedIn = useSessionStore((state) => state.session !== null);

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
          <FavoritesSync />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.background },
            }}
          >
            {/* Startup: a short logo splash, then Home. */}
            <Stack.Screen name="index" options={{ animation: 'fade' }} />

            {/* Browsing never requires an account: guests can explore and build a cart. */}
            <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
            <Stack.Screen name="restaurants/index" />
            <Stack.Screen name="restaurants/[id]" />
            <Stack.Screen name="food/[id]" options={{ presentation: 'modal' }} />
            <Stack.Screen name="cuisines" options={{ presentation: 'modal' }} />
            <Stack.Screen name="cart" />
            <Stack.Screen name="leaderboard" />
            {/* Shows first-time setup or profile editing; redirects home with neither. */}
            <Stack.Screen name="profile-setup" />

            {/*
              Signing in removes the (auth) screens from the stack, which reveals the screen
              the customer started from (e.g. the cart at checkout) with its state intact.
            */}
            <Stack.Protected guard={!isSignedIn}>
              <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
            </Stack.Protected>

            {/* Account data. A UX guard only — the backend enforces access (SECURITY.md). */}
            <Stack.Protected guard={isSignedIn}>
              <Stack.Screen name="favorites" />
              <Stack.Screen name="addresses" />
              <Stack.Screen name="address-form" />
              {/* After checkout: Confirmation → Instructions → Tracking, for one placed order. */}
              <Stack.Screen name="order/[id]/confirmation" options={{ gestureEnabled: false }} />
              <Stack.Screen name="order/[id]/instructions" />
              <Stack.Screen name="order/[id]/tracking" />
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
