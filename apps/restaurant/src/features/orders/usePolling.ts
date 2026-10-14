import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

/**
 * Calls `refresh` every `intervalMs` while the screen is focused and the app is in the
 * foreground, and once whenever the app returns to the foreground.
 *
 * Polling stands in for real-time delivery: the API has no push/WebSocket channel for
 * new-order alerts yet (planned: `partner.order_created`, API_BLUEPRINT §2.6).
 */
export function usePolling(refresh: () => void, intervalMs = 20_000) {
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  });

  useFocusEffect(
    useCallback(() => {
      let active = AppState.currentState === 'active';
      const timer = setInterval(() => {
        if (active) refreshRef.current();
      }, intervalMs);
      const subscription = AppState.addEventListener('change', (state) => {
        const wasActive = active;
        active = state === 'active';
        if (active && !wasActive) refreshRef.current();
      });
      return () => {
        clearInterval(timer);
        subscription.remove();
      };
    }, [intervalMs]),
  );
}

/** The current time, updated every `intervalMs` so countdowns and timers stay current. */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
