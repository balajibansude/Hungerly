import type { Id } from '@hungerly/types';
import { ConfirmDialog } from '@hungerly/ui';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';

import { useSessionStore } from '@/features/auth/session';
import { useServices, userMessage } from '@/services';

import { useFavoritesStore } from './store';

/**
 * Bookmark behaviour for restaurant cards. Signed-in customers toggle instantly (the
 * change is rolled back if the server rejects it); guests are offered the login flow,
 * since favourites belong to an account. Render the returned `dialog` once per screen.
 */
export function useFavoriteToggle() {
  const { favorites } = useServices();
  const isSignedIn = useSessionStore((s) => s.session !== null);
  const ids = useFavoritesStore((s) => s.ids);
  const setFavorite = useFavoritesStore((s) => s.set);
  const [loginPrompt, setLoginPrompt] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isFavorite = useCallback((id: Id) => ids.includes(id), [ids]);

  const toggle = useCallback(
    (id: Id) => {
      if (!isSignedIn) {
        setLoginPrompt(true);
        return;
      }
      const next = !ids.includes(id);
      setFavorite(id, next);
      (next ? favorites.add(id) : favorites.remove(id)).catch((e: unknown) => {
        setFavorite(id, !next);
        setError(userMessage(e));
      });
    },
    [favorites, ids, isSignedIn, setFavorite],
  );

  const dialog = (
    <>
      <ConfirmDialog
        visible={loginPrompt}
        title="Log in to save favourites"
        message="Favourites are kept in your Swaadone account. Browsing and ordering as a guest still work without one."
        confirmLabel="Log in or sign up"
        cancelLabel="Not now"
        onCancel={() => setLoginPrompt(false)}
        onConfirm={() => {
          setLoginPrompt(false);
          router.push({ pathname: '/login', params: { reason: 'favorites' } });
        }}
      />
      <ConfirmDialog
        visible={error !== null}
        title="Couldn't update favourites"
        message={error ?? ''}
        confirmLabel="OK"
        cancelLabel={null}
        onCancel={() => setError(null)}
        onConfirm={() => setError(null)}
      />
    </>
  );

  return { isFavorite, toggle, dialog };
}
