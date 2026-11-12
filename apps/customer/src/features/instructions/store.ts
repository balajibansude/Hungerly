import type { Id } from '@hungerly/types';
import { create } from 'zustand';

import type { InstructionSet, OrderInstructions } from '@/services';

/**
 * Instructions a customer adds to an order they have just placed. There are two independent
 * sections — one for the restaurant (cooking) and one for the delivery partner (drop-off) —
 * and every draft is keyed by the order it belongs to, so instructions can never leak onto
 * another order or back into the cart.
 */
export type InstructionSectionId = 'restaurant' | 'delivery';

export type RestaurantOption =
  'less_spicy' | 'extra_spicy' | 'less_oil' | 'no_onion' | 'no_garlic' | 'well_cooked' | 'other';

export type DeliveryOption =
  | 'call_before_arriving'
  | 'no_bell'
  | 'leave_at_door'
  | 'hand_to_me'
  | 'message_instead_of_call'
  | 'handle_with_care';

export interface OptionIdBySection {
  restaurant: RestaurantOption;
  delivery: DeliveryOption;
}

export interface InstructionOption<T extends string> {
  id: T;
  label: string;
}

export const restaurantOptions: InstructionOption<RestaurantOption>[] = [
  { id: 'less_spicy', label: 'Less spicy' },
  { id: 'extra_spicy', label: 'Extra spicy' },
  { id: 'less_oil', label: 'Less oil' },
  { id: 'no_onion', label: 'No onion' },
  { id: 'no_garlic', label: 'No garlic' },
  { id: 'well_cooked', label: 'Well cooked' },
  { id: 'other', label: 'Other special requests' },
];

export const deliveryOptions: InstructionOption<DeliveryOption>[] = [
  { id: 'call_before_arriving', label: 'Call before arriving' },
  { id: 'no_bell', label: "Don't ring the bell" },
  { id: 'leave_at_door', label: 'Leave at the door' },
  { id: 'hand_to_me', label: 'Hand it directly to me' },
  { id: 'message_instead_of_call', label: 'Message instead of calling' },
  { id: 'handle_with_care', label: 'Handle with care' },
];

/**
 * Options that contradict each other: choosing one clears the other (same rule the cart's
 * old "guard" / "door" rider choices used). Everything else combines freely.
 */
export const exclusiveOptions: {
  [S in InstructionSectionId]: Partial<Record<OptionIdBySection[S], OptionIdBySection[S]>>;
} = {
  restaurant: { less_spicy: 'extra_spicy', extra_spicy: 'less_spicy' },
  delivery: {
    leave_at_door: 'hand_to_me',
    hand_to_me: 'leave_at_door',
    call_before_arriving: 'message_instead_of_call',
    message_instead_of_call: 'call_before_arriving',
  },
};

/** Longest voice note a customer can record, in seconds. */
export const MAX_VOICE_NOTE_SECONDS = 30;
export const INSTRUCTION_NOTE_MAX_LENGTH = 200;

/** Simulated voice note: the hold-to-record control tracks duration only (no audio yet). */
export interface VoiceNote {
  durationSeconds: number;
}

export interface SectionDraft<T extends string> {
  options: T[];
  note: string;
  voiceNote: VoiceNote | null;
}

export interface OrderInstructionsDraft {
  restaurant: SectionDraft<RestaurantOption>;
  delivery: SectionDraft<DeliveryOption>;
  /** Bumped on every edit, so a save that finishes after a newer edit doesn't clear `dirty`. */
  revision: number;
  /** True while there are edits that have not been saved to the order. */
  dirty: boolean;
  /** When the instructions were last saved to the order (ISO), or null if never. */
  savedAt: string | null;
}

/** Toggles a multi-select option; choosing one side of a contradictory pair clears the other. */
export function toggleOption<T extends string>(
  current: readonly T[],
  id: T,
  exclusive: Partial<Record<T, T>> = {},
): T[] {
  if (current.includes(id)) return current.filter((x) => x !== id);
  const conflict = exclusive[id];
  return [...current.filter((x) => x !== conflict), id];
}

/** "0:07" for 7 seconds. */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** A fresh, empty draft. Shared and frozen so selectors for unknown orders stay stable. */
export const EMPTY_DRAFT: OrderInstructionsDraft = Object.freeze({
  restaurant: Object.freeze({ options: [], note: '', voiceNote: null }),
  delivery: Object.freeze({ options: [], note: '', voiceNote: null }),
  revision: 0,
  dirty: false,
  savedAt: null,
}) as OrderInstructionsDraft;

function sectionHasContent(section: SectionDraft<string>): boolean {
  return section.options.length > 0 || section.note.trim() !== '' || section.voiceNote !== null;
}

export function hasInstructions(draft: OrderInstructionsDraft): boolean {
  return sectionHasContent(draft.restaurant) || sectionHasContent(draft.delivery);
}

/**
 * Leaving the screen would lose edits the order doesn't have yet. An untouched or emptied
 * draft for an order that never had instructions has nothing to lose.
 */
export function hasUnsavedInstructions(draft: OrderInstructionsDraft): boolean {
  return draft.dirty && (hasInstructions(draft) || draft.savedAt !== null);
}

const OPTIONS_BY_SECTION: Record<InstructionSectionId, InstructionOption<string>[]> = {
  restaurant: restaurantOptions,
  delivery: deliveryOptions,
};

/** Human-readable lines for one section, e.g. ["Less spicy", "Note: …", "Voice note 0:07"]. */
export function describeSection(
  section: InstructionSectionId,
  draft: SectionDraft<string>,
): string[] {
  const labels = OPTIONS_BY_SECTION[section]
    .filter((option) => draft.options.includes(option.id))
    .map((option) => option.label);
  const note = draft.note.trim();
  return [
    ...labels,
    ...(note ? [`Note: ${note}`] : []),
    ...(draft.voiceNote ? [`Voice note ${formatDuration(draft.voiceNote.durationSeconds)}`] : []),
  ];
}

function toInstructionSet(section: SectionDraft<string>): InstructionSet {
  return {
    options: [...section.options],
    note: section.note.trim(),
    voiceNote: section.voiceNote ? { durationSeconds: section.voiceNote.durationSeconds } : null,
  };
}

/** The payload saved against the order. The two sections are always kept separate. */
export function toOrderInstructions(draft: OrderInstructionsDraft): OrderInstructions {
  return {
    restaurant: toInstructionSet(draft.restaurant),
    delivery: toInstructionSet(draft.delivery),
  };
}

interface InstructionsState {
  byOrder: Record<Id, OrderInstructionsDraft>;
  toggleOption: <S extends InstructionSectionId>(
    orderId: Id,
    section: S,
    id: OptionIdBySection[S],
  ) => void;
  setNote: (orderId: Id, section: InstructionSectionId, text: string) => void;
  setVoiceNote: (orderId: Id, section: InstructionSectionId, note: VoiceNote | null) => void;
  /** Records a successful save of the draft at `revision`; newer edits stay dirty. */
  markSaved: (orderId: Id, revision: number, savedAt: string) => void;
  reset: () => void;
}

/**
 * Drafts live for the app session (in memory), independent of any screen, so leaving the
 * instructions screen and coming back never loses what the customer entered.
 */
export const useInstructionsStore = create<InstructionsState>()((set) => {
  const edit = (
    orderId: Id,
    section: InstructionSectionId,
    change: (s: SectionDraft<string>) => Partial<SectionDraft<string>>,
  ) =>
    set((state) => {
      const draft = state.byOrder[orderId] ?? EMPTY_DRAFT;
      const current = draft[section] as SectionDraft<string>;
      return {
        byOrder: {
          ...state.byOrder,
          [orderId]: {
            ...draft,
            [section]: { ...current, ...change(current) },
            revision: draft.revision + 1,
            dirty: true,
          },
        },
      };
    });

  return {
    byOrder: {},
    toggleOption: (orderId, section, id) =>
      edit(orderId, section, (s) => ({
        options: toggleOption(
          s.options,
          id as string,
          exclusiveOptions[section] as Partial<Record<string, string>>,
        ),
      })),
    setNote: (orderId, section, text) =>
      edit(orderId, section, () => ({ note: text.slice(0, INSTRUCTION_NOTE_MAX_LENGTH) })),
    setVoiceNote: (orderId, section, voiceNote) => edit(orderId, section, () => ({ voiceNote })),
    markSaved: (orderId, revision, savedAt) =>
      set((state) => {
        const draft = state.byOrder[orderId] ?? EMPTY_DRAFT;
        return {
          byOrder: {
            ...state.byOrder,
            [orderId]: { ...draft, savedAt, dirty: draft.revision !== revision },
          },
        };
      }),
    reset: () => set({ byOrder: {} }),
  };
});

/** The draft for an order (a stable empty draft until the customer edits anything). */
export function useOrderInstructions(orderId: Id): OrderInstructionsDraft {
  return useInstructionsStore((s) => s.byOrder[orderId] ?? EMPTY_DRAFT);
}
