import { create } from 'zustand';

interface OnboardingDraftState {
  /** The user ID of the owner who started this registration draft. */
  ownerUserId: string | null;
  start: (user: { id: string }) => void;
  reset: () => void;
}

/** Minimal draft state so the welcome screen can detect and resume an in-progress registration. */
export const useOnboardingStore = create<OnboardingDraftState>()((set) => ({
  ownerUserId: null,
  start(user) {
    set({ ownerUserId: user.id });
  },
  reset() {
    set({ ownerUserId: null });
  },
}));
