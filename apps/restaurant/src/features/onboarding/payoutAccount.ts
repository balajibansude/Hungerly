import type { SetPayoutAccount } from '@hungerly/api-client';

export interface PayoutAccountForm {
  accountHolderName: string;
  bankAccountNumber: string;
  confirmAccountNumber: string;
  ifscCode: string;
}

/**
 * Turns the registration bank-details form into the `PUT payout-account` body. The API
 * re-checks that both account numbers match, so the confirmation is sent as typed.
 */
export function buildPayoutAccountBody(form: PayoutAccountForm): SetPayoutAccount {
  return {
    accountHolderName: form.accountHolderName.trim(),
    accountNumber: form.bankAccountNumber.trim(),
    confirmAccountNumber: form.confirmAccountNumber.trim(),
    ifsc: form.ifscCode.trim().toUpperCase(),
  };
}
