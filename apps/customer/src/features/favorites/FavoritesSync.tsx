import { useEffect } from 'react';

import { useSessionStore } from '@/features/auth/session';
import { useServices } from '@/services';

import { useFavoritesStore } from './store';

/**
 * Loads the customer's favourites when they sign in and forgets them on sign-out, so a
 * shared phone never shows the previous customer's saved restaurants. Renders nothing.
 */
export function FavoritesSync() {
  const { favorites } = useServices();
  const userId = useSessionStore((s) => s.session?.user.id);
  const setAll = useFavoritesStore((s) => s.setAll);
  const clear = useFavoritesStore((s) => s.clear);

  useEffect(() => {
    if (!userId) {
      clear();
      return;
    }
    let cancelled = false;
    favorites
      .list()
      .then((list) => {
        if (!cancelled) setAll(list.map((r) => r.id));
      })
      // Bookmarks simply show as unsaved; the Favourites screen has its own retry.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [favorites, userId, setAll, clear]);

  return null;
}
