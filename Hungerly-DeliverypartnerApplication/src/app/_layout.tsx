// Import only the weights in the type scale.
import { PlusJakartaSans_400Regular } from '@expo-google-fonts/plus-jakarta-sans/400Regular';
import { PlusJakartaSans_500Medium } from '@expo-google-fonts/plus-jakarta-sans/500Medium';
import { PlusJakartaSans_600SemiBold } from '@expo-google-fonts/plus-jakarta-sans/600SemiBold';
import { PlusJakartaSans_700Bold } from '@expo-google-fonts/plus-jakarta-sans/700Bold';
import { PlusJakartaSans_800ExtraBold } from '@expo-google-fonts/plus-jakarta-sans/800ExtraBold';
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppLock } from '@/components/AppLock';
import { BootScreen } from '@/components/BootScreen';
import { ApiError } from '@/lib/api';
import '@/lib/location'; // registers the background location task at startup
import { useSession } from '@/lib/session';
import { colors } from '@/ui';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

// Refetch live data the moment the rider returns to the app (e.g. from Google Maps navigation).
focusManager.setEventListener((handleFocus) => {
  const sub = AppState.addEventListener('change', (s) => handleFocus(s === 'active'));
  return () => sub.remove();
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 3_000,
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    },
  },
});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });
  const phase = useSession((s) => s.phase);
  const partner = useSession((s) => s.partner);
  const restore = useSession((s) => s.restore);
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    void restore();
  }, [restore]);

  useEffect(() => {
    // Hand over from the native splash to the animated boot screen as soon as fonts are in.
    if (fontsLoaded || fontError) SplashScreen.hideAsync().catch(() => undefined);
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    if (phase === 'signedOut') queryClient.clear(); // never keep a previous rider's data in memory
  }, [phase]);

  const onBootDone = useCallback(() => setBooted(true), []);
  const fontsReady = fontsLoaded || !!fontError;
  const signedIn = phase === 'signedIn';
  const status = partner?.status;
  const needsOnboarding = signedIn && (status === 'onboarding' || status === 'rejected');
  const underReview = signedIn && (status === 'pending_review' || status === 'suspended' || status === 'offboarded');
  const active = signedIn && !needsOnboarding && !underReview;

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="dark" />
          {fontsReady && phase !== 'booting' && (
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: 'fade' }}>
              {/* Unguarded entry: when a guard flips (sign-in, approval), the router falls back here and it redirects. */}
              <Stack.Screen name="index" />
              <Stack.Protected guard={!signedIn}>
                <Stack.Screen name="(auth)" />
              </Stack.Protected>
              <Stack.Protected guard={needsOnboarding}>
                <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
              </Stack.Protected>
              <Stack.Protected guard={underReview}>
                <Stack.Screen name="review" options={{ gestureEnabled: false }} />
              </Stack.Protected>
              <Stack.Protected guard={active}>
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="delivery" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
              </Stack.Protected>
            </Stack>
          )}
          {fontsReady && <AppLock />}
          {!booted && (fontsReady ? <BootScreen ready={phase !== 'booting'} onDone={onBootDone} /> : <View style={[StyleSheet.absoluteFill, styles.splash]} />)}
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  splash: { backgroundColor: colors.secondary },
});
