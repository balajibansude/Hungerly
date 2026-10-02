import type { ImageRef } from '@hungerly/types';

// Prototype imagery; to be replaced by bundled brand illustrations before release.
import { photo } from '@/mock/media';

export interface OnboardingSlide {
  key: string;
  title: string;
  body: string;
  image: ImageRef;
}

export const onboardingSlides: OnboardingSlide[] = [
  {
    key: 'discover',
    title: 'Local favourites, delivered',
    body: 'From street-side chaat to slow-cooked biryani — discover kitchens your neighbourhood loves.',
    image: photo('spread', 'A table of Indian dishes', 1000),
  },
  {
    key: 'pricing',
    title: 'Clear prices, no surprises',
    body: 'Every fee is shown before you order. What you see in your cart is what you pay.',
    image: photo('kebabsGrill', 'Kebabs on the grill', 1000),
  },
  {
    key: 'tracking',
    title: 'Fresh from the kitchen to your door',
    body: 'Follow your order as it is prepared, picked up and brought to you.',
    image: photo('pavBhaji', 'Pav bhaji being served', 1000),
  },
];
