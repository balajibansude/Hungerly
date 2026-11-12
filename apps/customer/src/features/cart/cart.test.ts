import type { Food, Offer, SelectedOption } from '@hungerly/types';
import { money } from '@hungerly/utils';

import { computeBill, discountFor, lineTotal, unitPrice } from './pricing';
import { lineIdFor, quantityOfFood, useCartStore, type CartRestaurant } from './store';

const food = (id: string, pricePaise: number, restaurantId = 'r-1'): Food => ({
  id,
  restaurantId,
  categoryId: 'c-1',
  name: `Food ${id}`,
  description: '',
  price: money(pricePaise),
  foodType: 'veg',
  isAvailable: true,
  isBestseller: false,
  optionGroups: [],
});

const restaurant = (id: string, offer?: Offer, isOpen = true): CartRestaurant => ({
  id,
  name: `Restaurant ${id}`,
  deliveryFee: money(3000),
  minimumOrder: money(20000),
  offer,
  isOpen,
});

const cheese: SelectedOption = {
  groupId: 'g',
  groupName: 'Extras',
  optionId: 'cheese',
  optionName: 'Cheese',
  priceDelta: money(3500),
};

const percentOffer: Offer = {
  id: 'o',
  label: '20% off up to ₹80',
  description: '',
  rule: { kind: 'percent', percentBps: 2000, maxDiscount: money(8000), minimumOrder: money(25000) },
};

beforeEach(() => useCartStore.getState().clear());

describe('pricing', () => {
  it('adds option deltas to the unit price and multiplies by quantity', () => {
    expect(unitPrice(money(14900), [cheese])).toEqual(money(18400));
    expect(
      lineTotal({
        lineId: 'x',
        foodId: 'f',
        restaurantId: 'r',
        name: 'Dosa',
        foodType: 'veg',
        basePrice: money(14900),
        selectedOptions: [cheese],
        quantity: 2,
      }),
    ).toEqual(money(36800));
  });

  it('applies percent discounts with a cap and minimum order', () => {
    expect(discountFor(percentOffer.rule, money(24900))).toEqual(money(0));
    expect(discountFor(percentOffer.rule, money(30000))).toEqual(money(6000));
    expect(discountFor(percentOffer.rule, money(90000))).toEqual(money(8000));
  });

  it('rounds percent discounts down to whole paise', () => {
    const rule = { ...percentOffer.rule, percentBps: 1500, maxDiscount: money(100000) };
    expect(discountFor(rule, money(25001))).toEqual(money(3750));
  });

  it('never gives a flat discount larger than the subtotal', () => {
    const rule = { kind: 'flat' as const, amount: money(10000), minimumOrder: money(0) };
    expect(discountFor(rule, money(6000))).toEqual(money(6000));
  });

  it('computes the bill and gaps to minimum order and offer', () => {
    useCartStore
      .getState()
      .addItem({ food: food('a', 12000), restaurant: restaurant('r-1'), options: [], quantity: 1 });
    const bill = computeBill({
      items: useCartStore.getState().items,
      deliveryFee: money(3000),
      minimumOrder: money(20000),
      offer: percentOffer,
    });
    expect(bill).toEqual({
      itemCount: 1,
      subtotal: money(12000),
      deliveryFee: money(3000),
      discount: money(0),
      nightCharge: money(0),
      total: money(15000),
      shortOfMinimum: money(8000),
      shortOfOffer: money(13000),
    });
  });

  it('charges no delivery fee for an empty cart', () => {
    const bill = computeBill({ items: [], deliveryFee: money(3000), minimumOrder: money(0) });
    expect(bill.total).toEqual(money(0));
    expect(bill.shortOfMinimum).toBeNull();
  });
});

describe('cart store', () => {
  it('merges identical selections into one line and keeps different options separate', () => {
    const cart = useCartStore.getState();
    cart.addItem({
      food: food('a', 10000),
      restaurant: restaurant('r-1'),
      options: [],
      quantity: 1,
    });
    cart.addItem({
      food: food('a', 10000),
      restaurant: restaurant('r-1'),
      options: [],
      quantity: 2,
    });
    cart.addItem({
      food: food('a', 10000),
      restaurant: restaurant('r-1'),
      options: [cheese],
      quantity: 1,
    });

    const { items } = useCartStore.getState();
    expect(items).toHaveLength(2);
    expect(items[0]?.quantity).toBe(3);
    expect(quantityOfFood(items, 'a')).toBe(4);
  });

  it('reports a conflict for another restaurant unless replacing', () => {
    const cart = useCartStore.getState();
    cart.addItem({
      food: food('a', 10000),
      restaurant: restaurant('r-1'),
      options: [],
      quantity: 1,
    });
    expect(
      cart.addItem({
        food: food('b', 5000, 'r-2'),
        restaurant: restaurant('r-2'),
        options: [],
        quantity: 1,
      }),
    ).toBe('conflict');
    expect(useCartStore.getState().items).toHaveLength(1);

    expect(
      cart.addItem({
        food: food('b', 5000, 'r-2'),
        restaurant: restaurant('r-2'),
        options: [],
        quantity: 1,
        replace: true,
      }),
    ).toBe('added');
    const state = useCartStore.getState();
    expect(state.restaurant?.id).toBe('r-2');
    expect(state.items.map((i) => i.foodId)).toEqual(['b']);
  });

  it('removes the line and clears the restaurant when quantity reaches zero', () => {
    const cart = useCartStore.getState();
    cart.addItem({
      food: food('a', 10000),
      restaurant: restaurant('r-1'),
      options: [],
      quantity: 1,
    });
    cart.decrement(lineIdFor('a', []));
    expect(useCartStore.getState()).toMatchObject({ items: [], restaurant: null });
  });

  it('caps quantity per line', () => {
    const cart = useCartStore.getState();
    cart.addItem({
      food: food('a', 10000),
      restaurant: restaurant('r-1'),
      options: [],
      quantity: 99,
    });
    expect(useCartStore.getState().items[0]?.quantity).toBe(20);
  });

  it('builds line ids independent of option order', () => {
    const b = { ...cheese, optionId: 'b' };
    const a = { ...cheese, optionId: 'a' };
    expect(lineIdFor('f', [b, a])).toBe(lineIdFor('f', [a, b]));
  });
});

describe('closed restaurants', () => {
  const add = (open: boolean, f = food('a', 12000)) =>
    useCartStore.getState().addItem({
      food: f,
      restaurant: restaurant('r-1', undefined, open),
      options: [],
      quantity: 1,
    });

  it('refuses new items from a closed restaurant', () => {
    expect(add(false)).toBe('closed');
    expect(useCartStore.getState().items).toHaveLength(0);
  });

  it('refuses unavailable dishes', () => {
    expect(add(true, { ...food('a', 12000), isAvailable: false })).toBe('unavailable');
    expect(useCartStore.getState().items).toHaveLength(0);
  });

  it('does not increase quantities once the restaurant closes, but still allows removal', () => {
    add(true);
    const [line] = useCartStore.getState().items;
    useCartStore.getState().syncAvailability('r-1', { isOpen: false, opensAt: '11:00' });
    expect(useCartStore.getState().restaurant).toMatchObject({ isOpen: false, opensAt: '11:00' });

    useCartStore.getState().increment(line!.lineId);
    expect(useCartStore.getState().items[0]?.quantity).toBe(1);
    expect(add(false)).toBe('closed');

    useCartStore.getState().decrement(line!.lineId);
    expect(useCartStore.getState().items).toHaveLength(0);
  });

  it('resumes normal behaviour when the restaurant reopens', () => {
    add(true);
    const [line] = useCartStore.getState().items;
    useCartStore.getState().syncAvailability('r-1', { isOpen: false });
    useCartStore.getState().syncAvailability('r-1', { isOpen: true });
    useCartStore.getState().increment(line!.lineId);
    expect(useCartStore.getState().items[0]?.quantity).toBe(2);
  });

  it('ignores availability updates for other restaurants', () => {
    add(true);
    useCartStore.getState().syncAvailability('r-2', { isOpen: false });
    expect(useCartStore.getState().restaurant?.isOpen).toBe(true);
  });

  it('never lets a quantity go below zero', () => {
    add(true);
    const [line] = useCartStore.getState().items;
    useCartStore.getState().decrement(line!.lineId);
    useCartStore.getState().decrement(line!.lineId);
    expect(useCartStore.getState().items).toHaveLength(0);
    expect(quantityOfFood(useCartStore.getState().items, 'a')).toBe(0);
  });
});
