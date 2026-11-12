import type { Money } from '@hungerly/api-client';

export const inr = (amountMinor: number): Money => ({ amountMinor, currency: 'INR' });
