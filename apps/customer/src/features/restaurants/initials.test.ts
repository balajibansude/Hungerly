import { restaurantInitials } from './initials';

describe('restaurantInitials', () => {
  it('uses the first letters of the first two meaningful words', () => {
    expect(restaurantInitials('Tandoor & Tales')).toBe('TT');
    expect(restaurantInitials('The Dosa Republic')).toBe('DR');
    expect(restaurantInitials('Bowl Theory')).toBe('BT');
    expect(restaurantInitials('Chai & Chaat Co.')).toBe('CC');
  });

  it('gives different restaurants different monograms', () => {
    const names = ['Forno Nonna', 'Wok This Way', 'Sugar Loaf', 'Biryani Baithak'];
    expect(new Set(names.map(restaurantInitials)).size).toBe(names.length);
  });

  it('handles single words, all-skipped words and empty names', () => {
    expect(restaurantInitials('mango')).toBe('M');
    expect(restaurantInitials('The')).toBe('T');
    expect(restaurantInitials('')).toBe('');
  });
});
