import type { Food, FoodOptionGroup, Id, SelectedOption } from '@hungerly/types';

/** Selected option ids per option group. */
export type Selection = Record<Id, Id[]>;

/** Single-choice required groups (e.g. "Size") start with the first available option. */
export function initialSelection(food: Food): Selection {
  const selection: Selection = {};
  for (const group of food.optionGroups) {
    const first = group.options.find((option) => option.isAvailable);
    selection[group.id] = group.minSelect >= 1 && group.maxSelect === 1 && first ? [first.id] : [];
  }
  return selection;
}

/**
 * Toggles an option respecting the group's limits: single-choice groups behave like
 * radio buttons; multi-choice groups ignore selections beyond `maxSelect`.
 */
export function toggleOption(
  selection: Selection,
  group: FoodOptionGroup,
  optionId: Id,
): Selection {
  const current = selection[group.id] ?? [];
  const isSelected = current.includes(optionId);
  let next: Id[];

  if (group.maxSelect === 1) {
    next = isSelected && group.minSelect === 0 ? [] : [optionId];
  } else if (isSelected) {
    next = current.filter((id) => id !== optionId);
  } else if (current.length < group.maxSelect) {
    next = [...current, optionId];
  } else {
    next = current;
  }
  return { ...selection, [group.id]: next };
}

export interface SelectionIssue {
  groupId: Id;
  message: string;
}

export function validateSelection(food: Food, selection: Selection): SelectionIssue[] {
  return food.optionGroups.flatMap((group) => {
    const count = selection[group.id]?.length ?? 0;
    if (count < group.minSelect) {
      return [
        {
          groupId: group.id,
          message: `Choose ${group.minSelect === 1 ? 'one' : group.minSelect} ${group.name.toLowerCase()}`,
        },
      ];
    }
    if (count > group.maxSelect) {
      return [{ groupId: group.id, message: `Choose up to ${group.maxSelect}` }];
    }
    return [];
  });
}

export function toSelectedOptions(food: Food, selection: Selection): SelectedOption[] {
  return food.optionGroups.flatMap((group) =>
    group.options
      .filter((option) => selection[group.id]?.includes(option.id))
      .map((option) => ({
        groupId: group.id,
        groupName: group.name,
        optionId: option.id,
        optionName: option.name,
        priceDelta: option.priceDelta,
      })),
  );
}

/** Human description of a group's rule, e.g. "Required · choose 1" or "Optional · up to 3". */
export function describeGroupRule(group: FoodOptionGroup): string {
  if (group.minSelect === 0)
    return group.maxSelect === 1 ? 'Optional' : `Optional · up to ${group.maxSelect}`;
  return group.minSelect === group.maxSelect
    ? `Required · choose ${group.minSelect}`
    : `Required · ${group.minSelect}–${group.maxSelect}`;
}
