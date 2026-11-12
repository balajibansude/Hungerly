import { money } from '@hungerly/utils';

import { defaultAddress, workAddress } from '@/mock';

import { checkoutSummaryText } from './summary';

describe('checkoutSummaryText', () => {
  it('names the address, cash on delivery and the payable amount', () => {
    const text = checkoutSummaryText({
      address: defaultAddress,
      paymentMethod: 'cod',
      total: money(42500),
    });
    expect(text).toEqual({
      address: 'Home · Koregaon Park',
      payment: 'Cash on delivery',
      payable: '₹425',
      placeOrderLabel: 'Place order · ₹425',
      placeOrderAccessibilityLabel:
        'Place order, pay ₹425 cash on delivery, to Home, Koregaon Park',
    });
  });

  it('follows the chosen address', () => {
    expect(
      checkoutSummaryText({ address: workAddress, paymentMethod: 'cod', total: money(10000) })
        .address,
    ).toBe('Work · Yerawada');
  });

  it('has no address line until one is chosen', () => {
    const text = checkoutSummaryText({ address: null, paymentMethod: 'cod', total: money(10000) });
    expect(text.address).toBeNull();
    expect(text.placeOrderAccessibilityLabel).toBe('Place order, pay ₹100 cash on delivery');
  });
});
