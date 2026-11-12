import {
  deliveryOptions,
  describeSection,
  EMPTY_DRAFT,
  formatDuration,
  hasUnsavedInstructions,
  INSTRUCTION_NOTE_MAX_LENGTH,
  restaurantOptions,
  toggleOption,
  toOrderInstructions,
  useInstructionsStore,
} from './store';

const ORDER = 'ord-1';
const OTHER_ORDER = 'ord-2';
const draftOf = (orderId: string) =>
  useInstructionsStore.getState().byOrder[orderId] ?? EMPTY_DRAFT;

afterEach(() => useInstructionsStore.getState().reset());

describe('instruction options', () => {
  it('offers the required restaurant options', () => {
    expect(restaurantOptions.map((o) => o.label)).toEqual([
      'Less spicy',
      'Extra spicy',
      'Less oil',
      'No onion',
      'No garlic',
      'Well cooked',
      'Other special requests',
    ]);
  });

  it('offers the required delivery partner options', () => {
    expect(deliveryOptions.map((o) => o.label)).toEqual([
      'Call before arriving',
      "Don't ring the bell",
      'Leave at the door',
      'Hand it directly to me',
      'Message instead of calling',
      'Handle with care',
    ]);
  });
});

describe('toggleOption', () => {
  it('selects and deselects, allowing several at once', () => {
    expect(toggleOption([], 'a')).toEqual(['a']);
    expect(toggleOption(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleOption(['a', 'b'], 'a')).toEqual(['b']);
  });

  it('clears the contradicting option of an exclusive pair', () => {
    expect(toggleOption(['x', 'a'], 'b', { a: 'b', b: 'a' })).toEqual(['x', 'b']);
  });
});

describe('formatDuration', () => {
  it('formats seconds as m:ss', () => {
    expect(formatDuration(7)).toBe('0:07');
    expect(formatDuration(65.9)).toBe('1:05');
  });
});

describe.each(['restaurant', 'delivery'] as const)('%s section', (section) => {
  // Two options that combine freely in each section.
  const [first, second] = (
    section === 'restaurant' ? ['less_oil', 'no_onion'] : ['no_bell', 'handle_with_care']
  ) as [never, never];

  it('supports multiple selected options', () => {
    const s = useInstructionsStore.getState();
    s.toggleOption(ORDER, section, first);
    s.toggleOption(ORDER, section, second);
    expect(draftOf(ORDER)[section].options).toEqual([first, second]);
    s.toggleOption(ORDER, section, first);
    expect(draftOf(ORDER)[section].options).toEqual([second]);
  });

  it('keeps an optional custom note, capped in length', () => {
    useInstructionsStore
      .getState()
      .setNote(ORDER, section, 'x'.repeat(INSTRUCTION_NOTE_MAX_LENGTH + 10));
    expect(draftOf(ORDER)[section].note).toHaveLength(INSTRUCTION_NOTE_MAX_LENGTH);
  });

  it('records and deletes a voice note with its duration', () => {
    const s = useInstructionsStore.getState();
    s.setVoiceNote(ORDER, section, { durationSeconds: 7 });
    expect(draftOf(ORDER)[section].voiceNote).toEqual({ durationSeconds: 7 });
    expect(describeSection(section, draftOf(ORDER)[section])).toContain('Voice note 0:07');
    s.setVoiceNote(ORDER, section, null);
    expect(draftOf(ORDER)[section].voiceNote).toBeNull();
  });
});

describe('section rules', () => {
  it('keeps less and extra spicy exclusive', () => {
    const s = useInstructionsStore.getState();
    s.toggleOption(ORDER, 'restaurant', 'less_spicy');
    s.toggleOption(ORDER, 'restaurant', 'no_onion');
    s.toggleOption(ORDER, 'restaurant', 'extra_spicy');
    expect(draftOf(ORDER).restaurant.options).toEqual(['no_onion', 'extra_spicy']);
  });

  it('keeps leave-at-door / hand-to-me and call / message exclusive', () => {
    const s = useInstructionsStore.getState();
    s.toggleOption(ORDER, 'delivery', 'leave_at_door');
    s.toggleOption(ORDER, 'delivery', 'call_before_arriving');
    s.toggleOption(ORDER, 'delivery', 'handle_with_care');
    s.toggleOption(ORDER, 'delivery', 'hand_to_me');
    s.toggleOption(ORDER, 'delivery', 'message_instead_of_call');
    expect(draftOf(ORDER).delivery.options).toEqual([
      'handle_with_care',
      'hand_to_me',
      'message_instead_of_call',
    ]);
  });
});

describe('separation and association', () => {
  it('keeps restaurant and delivery instructions separate', () => {
    const s = useInstructionsStore.getState();
    s.toggleOption(ORDER, 'restaurant', 'no_garlic');
    s.setNote(ORDER, 'restaurant', 'Extra crispy');
    s.toggleOption(ORDER, 'delivery', 'no_bell');
    s.setVoiceNote(ORDER, 'delivery', { durationSeconds: 4 });

    expect(toOrderInstructions(draftOf(ORDER))).toEqual({
      restaurant: { options: ['no_garlic'], note: 'Extra crispy', voiceNote: null },
      delivery: { options: ['no_bell'], note: '', voiceNote: { durationSeconds: 4 } },
    });
  });

  it('keys drafts by order, so another order is unaffected', () => {
    useInstructionsStore.getState().toggleOption(ORDER, 'restaurant', 'less_oil');
    expect(draftOf(OTHER_ORDER)).toBe(EMPTY_DRAFT);
  });

  it('trims notes in the saved payload', () => {
    useInstructionsStore.getState().setNote(ORDER, 'delivery', '  Gate 2  ');
    expect(toOrderInstructions(draftOf(ORDER)).delivery.note).toBe('Gate 2');
  });
});

describe('saved state', () => {
  it('treats an untouched or emptied, never-saved draft as nothing to lose', () => {
    expect(hasUnsavedInstructions(EMPTY_DRAFT)).toBe(false);
    const s = useInstructionsStore.getState();
    s.toggleOption(ORDER, 'restaurant', 'less_oil');
    expect(hasUnsavedInstructions(draftOf(ORDER))).toBe(true);
    s.toggleOption(ORDER, 'restaurant', 'less_oil');
    expect(hasUnsavedInstructions(draftOf(ORDER))).toBe(false);
  });

  it('clears unsaved state on save, but not for edits made after the saved revision', () => {
    const s = useInstructionsStore.getState();
    s.toggleOption(ORDER, 'delivery', 'no_bell');
    const savedRevision = draftOf(ORDER).revision;
    s.setNote(ORDER, 'delivery', 'Edited while saving');
    s.markSaved(ORDER, savedRevision, '2026-11-10T10:00:00.000Z');
    expect(draftOf(ORDER)).toMatchObject({ dirty: true, savedAt: '2026-11-10T10:00:00.000Z' });

    s.markSaved(ORDER, draftOf(ORDER).revision, '2026-11-10T10:00:01.000Z');
    expect(hasUnsavedInstructions(draftOf(ORDER))).toBe(false);
  });

  it('counts clearing previously saved instructions as an unsaved change', () => {
    const s = useInstructionsStore.getState();
    s.toggleOption(ORDER, 'delivery', 'no_bell');
    s.markSaved(ORDER, draftOf(ORDER).revision, '2026-11-10T10:00:00.000Z');
    s.toggleOption(ORDER, 'delivery', 'no_bell');
    expect(hasUnsavedInstructions(draftOf(ORDER))).toBe(true);
  });
});
