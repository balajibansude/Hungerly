import type {
  DayOfWeek,
  Id,
  LocalTime,
  PartnerRestaurant,
  RestaurantFoodType,
  StaffUser,
} from '@hungerly/types';
import { create } from 'zustand';

import type { RegistrantRole } from '@/services';

/**
 * The registration draft: what the person has typed, kept as entered (strings, nullable
 * choices) so nothing is lost while a field is still invalid. Parsing into a domain
 * `RestaurantRegistration` happens in `validation.ts`.
 *
 * One store for the whole flow; in memory for the current app session only.
 */

export interface DayHoursDraft {
  dayOfWeek: DayOfWeek;
  isOpen: boolean;
  opensAt: LocalTime;
  closesAt: LocalTime;
}

export interface RegistrationDraft {
  restaurant: { name: string; cuisines: string[]; foodType: RestaurantFoodType | null };
  owner: { fullName: string; role: RegistrantRole | null };
  address: { line1: string; locality: string; city: string; state: string; postalCode: string };
  contact: { phone: string; email: string };
  operations: {
    /** One slot per weekday (Monday first); split shifts are edited later in Hours (R14). */
    hours: DayHoursDraft[];
    avgPrepMinutes: number | null;
    /** Rupees as typed, e.g. "149" or "149.50". */
    minimumOrder: string;
  };
}

export type DraftSection = keyof RegistrationDraft;

export type SubmissionState =
  { status: 'idle' } | { status: 'submitting' } | { status: 'failed'; message: string };

export interface CompletedRegistration {
  restaurantId: Id;
  restaurantName: PartnerRestaurant['name'];
}

const DEFAULT_OPENS_AT = '11:00';
const DEFAULT_CLOSES_AT = '23:00';
/** Schema default for `avg_prep_minutes`. */
export const DEFAULT_PREP_MINUTES = 20;

const WEEK: DayOfWeek[] = [0, 1, 2, 3, 4, 5, 6];

export function emptyDraft(): RegistrationDraft {
  return {
    restaurant: { name: '', cuisines: [], foodType: null },
    owner: { fullName: '', role: null },
    address: { line1: '', locality: '', city: '', state: '', postalCode: '' },
    contact: { phone: '', email: '' },
    operations: {
      hours: WEEK.map((dayOfWeek) => ({
        dayOfWeek,
        isOpen: true,
        opensAt: DEFAULT_OPENS_AT,
        closesAt: DEFAULT_CLOSES_AT,
      })),
      avgPrepMinutes: DEFAULT_PREP_MINUTES,
      minimumOrder: '',
    },
  };
}

/**
 * A fresh draft for the signed-in person: their name and sign-in phone/email are offered
 * as starting values (editable). Their identity itself is never changed by the draft.
 */
export function draftFor(user: StaffUser): RegistrationDraft {
  const draft = emptyDraft();
  draft.owner.fullName = user.fullName ?? '';
  // "+919812345678" → "98123 45678", the same format the login field accepts.
  draft.contact.phone = user.phoneE164
    ? `${user.phoneE164.slice(3, 8)} ${user.phoneE164.slice(8)}`
    : '';
  draft.contact.email = user.email ?? '';
  return draft;
}

let keyCounter = 0;
/** Unique per draft: lets the service recognise a retried submission. */
function newSubmissionKey(): string {
  keyCounter += 1;
  return `reg-${Date.now().toString(36)}-${keyCounter}`;
}

interface OnboardingState {
  /** Whose draft this is; a different user always starts clean. */
  ownerUserId: Id | null;
  draft: RegistrationDraft;
  submissionKey: string;
  submission: SubmissionState;
  /** Set after success until the person continues into the workspace. */
  completed: CompletedRegistration | null;

  /** Starts (or resumes, for the same person) a registration. */
  start: (user: StaffUser) => void;
  update: <S extends DraftSection>(section: S, patch: Partial<RegistrationDraft[S]>) => void;
  setDayHours: (dayOfWeek: DayOfWeek, patch: Partial<Omit<DayHoursDraft, 'dayOfWeek'>>) => void;
  /** Copies one day's hours to every day. */
  applyHoursToAllDays: (fromDay: DayOfWeek) => void;
  beginSubmit: () => void;
  submitFailed: (message: string) => void;
  /** Success: the draft is cleared and the completion screen is due. */
  submitSucceeded: (completed: CompletedRegistration) => void;
  acknowledgeCompletion: () => void;
  reset: () => void;
}

function initialState() {
  return {
    ownerUserId: null,
    draft: emptyDraft(),
    submissionKey: newSubmissionKey(),
    submission: { status: 'idle' } as SubmissionState,
    completed: null,
  };
}

export const useOnboardingStore = create<OnboardingState>()((set, get) => ({
  ...initialState(),

  start: (user) => {
    if (get().ownerUserId === user.id) return;
    set({ ...initialState(), ownerUserId: user.id, draft: draftFor(user) });
  },

  update: (section, patch) =>
    set((state) => ({
      draft: { ...state.draft, [section]: { ...state.draft[section], ...patch } },
      // Editing after a failed submission clears the stale error.
      submission: state.submission.status === 'failed' ? { status: 'idle' } : state.submission,
    })),

  setDayHours: (dayOfWeek, patch) =>
    set((state) => ({
      draft: {
        ...state.draft,
        operations: {
          ...state.draft.operations,
          hours: state.draft.operations.hours.map((day) =>
            day.dayOfWeek === dayOfWeek ? { ...day, ...patch } : day,
          ),
        },
      },
    })),

  applyHoursToAllDays: (fromDay) =>
    set((state) => {
      const source = state.draft.operations.hours.find((d) => d.dayOfWeek === fromDay);
      if (!source) return state;
      const { isOpen, opensAt, closesAt } = source;
      return {
        draft: {
          ...state.draft,
          operations: {
            ...state.draft.operations,
            hours: state.draft.operations.hours.map((day) => ({
              ...day,
              isOpen,
              opensAt,
              closesAt,
            })),
          },
        },
      };
    }),

  beginSubmit: () => set({ submission: { status: 'submitting' } }),
  submitFailed: (message) => set({ submission: { status: 'failed', message } }),
  submitSucceeded: (completed) => set({ ...initialState(), completed }),
  acknowledgeCompletion: () => set({ completed: null }),
  reset: () => set(initialState()),
}));
