import { SetPayoutAccountSchema } from '@hungerly/api-client';

import { buildPayoutAccountBody } from './payoutAccount';

const FORM = {
  accountHolderName: '  Asha Rao ',
  bankAccountNumber: '123456789012 ',
  confirmAccountNumber: ' 123456789012',
  ifscCode: ' hdfc0001234 ',
};

describe('buildPayoutAccountBody', () => {
  it('sends the confirmation so the body passes the API contract', () => {
    const body = buildPayoutAccountBody(FORM);
    expect(body).toEqual({
      accountHolderName: 'Asha Rao',
      accountNumber: '123456789012',
      confirmAccountNumber: '123456789012',
      ifsc: 'HDFC0001234',
    });
    expect(SetPayoutAccountSchema.safeParse(body).success).toBe(true);
  });

  it('passes a mismatched confirmation through for the API to reject', () => {
    const body = buildPayoutAccountBody({ ...FORM, confirmAccountNumber: '123456789000' });
    const parsed = SetPayoutAccountSchema.safeParse(body);
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.path).toEqual(['confirmAccountNumber']);
  });
});
