import { emptyDraft, type RegistrationDraft } from './draft';

/** A complete, valid registration draft for tests. Each call returns a fresh copy. */
export function validDraft(): RegistrationDraft {
  const draft = emptyDraft();
  return {
    ...draft,
    restaurant: { name: 'Spice Garden', cuisines: ['North Indian', 'Biryani'], foodType: 'mixed' },
    owner: { fullName: 'Rohan Mehta', role: 'owner' },
    address: {
      line1: '12 MG Road',
      locality: 'Camp',
      city: 'Pune',
      state: 'Maharashtra',
      postalCode: '411001',
    },
    contact: { phone: '98123 45678', email: 'hello@spicegarden.example' },
    operations: { ...draft.operations, avgPrepMinutes: 20, minimumOrder: '199' },
  };
}
