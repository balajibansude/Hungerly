import type { Food, FoodOptionGroup } from '@hungerly/types';
import { money } from '@hungerly/utils';

import {
  describeGroupRule,
  initialSelection,
  toSelectedOptions,
  toggleOption,
  validateSelection,
} from './selection';

const option = (id: string, available = true) => ({
  id,
  name: id,
  priceDelta: money(1000),
  isAvailable: available,
});

const size: FoodOptionGroup = {
  id: 'size',
  name: 'Size',
  minSelect: 1,
  maxSelect: 1,
  options: [option('s'), option('l')],
};
const extras: FoodOptionGroup = {
  id: 'extras',
  name: 'Extras',
  minSelect: 0,
  maxSelect: 2,
  options: [option('a'), option('b'), option('c')],
};

const food: Food = {
  id: 'f',
  restaurantId: 'r',
  categoryId: 'c',
  name: 'Pizza',
  description: '',
  price: money(40000),
  foodType: 'veg',
  isAvailable: true,
  isBestseller: false,
  optionGroups: [size, extras],
};

describe('option selection', () => {
  it('preselects the first available option of required single-choice groups', () => {
    expect(initialSelection(food)).toEqual({ size: ['s'], extras: [] });
    const firstUnavailable = {
      ...food,
      optionGroups: [{ ...size, options: [option('s', false), option('l')] }],
    };
    expect(initialSelection(firstUnavailable)).toEqual({ size: ['l'] });
  });

  it('behaves like radio buttons for single-choice groups', () => {
    const selection = toggleOption(initialSelection(food), size, 'l');
    expect(selection.size).toEqual(['l']);
    // A required single choice cannot be deselected.
    expect(toggleOption(selection, size, 'l').size).toEqual(['l']);
  });

  it('respects maxSelect for multi-choice groups', () => {
    let selection = initialSelection(food);
    selection = toggleOption(selection, extras, 'a');
    selection = toggleOption(selection, extras, 'b');
    selection = toggleOption(selection, extras, 'c');
    expect(selection.extras).toEqual(['a', 'b']);
    expect(toggleOption(selection, extras, 'a').extras).toEqual(['b']);
  });

  it('reports missing required choices', () => {
    expect(validateSelection(food, { size: [], extras: [] })).toEqual([
      { groupId: 'size', message: 'Choose one size' },
    ]);
    expect(validateSelection(food, initialSelection(food))).toEqual([]);
  });

  it('converts a selection to cart options in menu order', () => {
    const selected = toSelectedOptions(food, { size: ['l'], extras: ['b', 'a'] });
    expect(selected.map((o) => o.optionId)).toEqual(['l', 'a', 'b']);
  });

  it('describes group rules', () => {
    expect(describeGroupRule(size)).toBe('Required · choose 1');
    expect(describeGroupRule(extras)).toBe('Optional · up to 2');
  });
});
