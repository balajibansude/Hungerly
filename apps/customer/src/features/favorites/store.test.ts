import { useFavoritesStore } from './store';

describe('favourites store', () => {
  beforeEach(() => useFavoritesStore.getState().clear());

  it('adds and removes ids without duplicates', () => {
    const { set } = useFavoritesStore.getState();
    set('r-1', true);
    set('r-1', true);
    set('r-2', true);
    expect(useFavoritesStore.getState().ids).toEqual(['r-1', 'r-2']);

    set('r-1', false);
    expect(useFavoritesStore.getState().ids).toEqual(['r-2']);
  });

  it('replaces the list from the server, de-duplicated', () => {
    useFavoritesStore.getState().setAll(['r-3', 'r-3', 'r-4']);
    expect(useFavoritesStore.getState().ids).toEqual(['r-3', 'r-4']);
  });
});
