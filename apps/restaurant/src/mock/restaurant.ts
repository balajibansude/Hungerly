import type { OpeningHoursSlot, PartnerRestaurant, StaffUser } from '@hungerly/types';
import { money } from '@hungerly/utils';

/**
 * PROTOTYPE DATA. Masala Junction is a fictional restaurant; the people, phone numbers
 * and addresses here are invented. Emails use the reserved `.example` domain.
 * Imported only by src/services/mock.
 */

export const MASALA_JUNCTION_ID = 'rst-masala-junction';

/** Lunch and dinner every day; dinner runs past midnight on Friday and Saturday. */
const hours: OpeningHoursSlot[] = ([0, 1, 2, 3, 4, 5, 6] as const).flatMap((dayOfWeek) => [
  { dayOfWeek, opensAt: '11:30', closesAt: '15:30' },
  {
    dayOfWeek,
    opensAt: '18:30',
    closesAt: dayOfWeek === 4 || dayOfWeek === 5 ? '00:30' : '23:30',
  },
]);

export const masalaJunction: PartnerRestaurant = {
  id: MASALA_JUNCTION_ID,
  slug: 'masala-junction-koregaon-park',
  name: 'Masala Junction',
  legalName: 'Masala Junction Foods LLP',
  description:
    'North Indian and Mughlai kitchen known for slow-cooked dal makhani, tandoor breads and biryani.',
  phoneE164: '+919800000101',
  email: 'hello@masalajunction.example',
  address: {
    line1: 'Shop 4, Lane 6, North Main Road',
    locality: 'Koregaon Park',
    city: 'Pune',
    state: 'Maharashtra',
    postalCode: '411001',
    location: { lat: 18.5362, lng: 73.8939 },
  },
  cuisines: ['North Indian', 'Mughlai', 'Biryani'],
  foodType: 'mixed',
  status: 'active',
  isAcceptingOrders: true,
  avgPrepMinutes: 20,
  minimumOrder: money(14900),
  packagingFee: money(2000),
  hours,
  rating: { average: 4.4, count: 2310 },
};

/** The demo login: owner of Masala Junction. */
export const DEMO_OWNER_PHONE_E164 = '+919876543210';

export const demoOwner: StaffUser = {
  id: 'usr-aditi-kulkarni',
  fullName: 'Aditi Kulkarni',
  phoneE164: DEMO_OWNER_PHONE_E164,
  email: 'aditi@masalajunction.example',
};
