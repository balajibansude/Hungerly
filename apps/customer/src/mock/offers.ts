import type { Offer } from '@hungerly/types';
import { money } from '@hungerly/utils';

export const offers = {
  welcome: {
    id: 'o-welcome',
    label: '50% off up to ₹120',
    description: 'On your first order above ₹199',
    code: 'HELLOSWAADONE',
    firstOrderOnly: true,
    rule: {
      kind: 'percent',
      percentBps: 5000,
      maxDiscount: money(12000),
      minimumOrder: money(19900),
    },
  },
  tandoorFlat: {
    id: 'o-tandoor-flat',
    label: '₹75 off above ₹449',
    description: 'Flat discount on orders above ₹449',
    restaurantId: 'r-tandoor-tales',
    rule: { kind: 'flat', amount: money(7500), minimumOrder: money(44900) },
  },
  dosaTwenty: {
    id: 'o-dosa-twenty',
    label: '20% off up to ₹80',
    description: 'On orders above ₹249',
    restaurantId: 'r-dosa-republic',
    rule: {
      kind: 'percent',
      percentBps: 2000,
      maxDiscount: money(8000),
      minimumOrder: money(24900),
    },
  },
  burgerFlat: {
    id: 'o-smoke-flat',
    label: '₹100 off above ₹599',
    description: 'Flat discount on orders above ₹599',
    restaurantId: 'r-smoke-street',
    rule: { kind: 'flat', amount: money(10000), minimumOrder: money(59900) },
  },
  wokFifteen: {
    id: 'o-wok-fifteen',
    label: '15% off up to ₹60',
    description: 'On orders above ₹299',
    restaurantId: 'r-wok-this-way',
    rule: {
      kind: 'percent',
      percentBps: 1500,
      maxDiscount: money(6000),
      minimumOrder: money(29900),
    },
  },
} satisfies Record<string, Offer>;
