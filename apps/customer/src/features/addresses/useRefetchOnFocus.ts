import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';

/**
 * Re-runs a query whenever the screen comes back into focus (not on the first focus, which
 * already loaded). `useQuery` has no shared cache, so screens that show the delivery address
 * use this to pick up changes made on the addresses screen.
 */
export function useRefetchOnFocus(refetch: () => void): void {
  const refetchRef = useRef(refetch);
  useEffect(() => {
    refetchRef.current = refetch;
  });
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      refetchRef.current();
    }, []),
  );
}
