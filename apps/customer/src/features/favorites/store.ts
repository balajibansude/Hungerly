import type { Id } from '@hungerly/types';
import { create } from 'zustand';

/**
 * Ids of the signed-in customer's favourite restaurants, so every card can show its
 * bookmark state without its own request. Loaded after sign-in (FavoritesSync), emptied
 * on sign-out. In memory only, like the rest of the prototype's state.
 */
interface FavoritesState {
  ids: Id[];
  setAll: (ids: Id[]) => void;
  set: (id: Id, favorite: boolean) => void;
  clear: () => void;
}

export const useFavoritesStore = create<FavoritesState>()((set) => ({
  ids: [],
  setAll: (ids) => set({ ids: [...new Set(ids)] }),
  set: (id, favorite) =>
    set((state) => {
      const has = state.ids.includes(id);
      if (favorite === has) return state;
      return { ids: favorite ? [...state.ids, id] : state.ids.filter((x) => x !== id) };
    }),
  clear: () => set({ ids: [] }),
}));
