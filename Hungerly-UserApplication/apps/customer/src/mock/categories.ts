import type { Category } from '@hungerly/types';

import { photo } from './media';

export const categories: Category[] = [
  {
    id: 'c-biryani',
    slug: 'biryani',
    name: 'Biryani',
    image: photo('biryaniPlate', 'Biryani', 200),
  },
  {
    id: 'c-north-indian',
    slug: 'north-indian',
    name: 'North Indian',
    image: photo('butterChickenNaan', 'North Indian curry with naan', 200),
  },
  {
    id: 'c-south-indian',
    slug: 'south-indian',
    name: 'South Indian',
    image: photo('dosaPlatter', 'Masala dosa', 200),
  },
  { id: 'c-pizza', slug: 'pizza', name: 'Pizza', image: photo('margherita', 'Pizza', 200) },
  {
    id: 'c-burgers',
    slug: 'burgers',
    name: 'Burgers',
    image: photo('classicBurger', 'Burger', 200),
  },
  {
    id: 'c-chinese',
    slug: 'chinese',
    name: 'Chinese',
    image: photo('hakkaNoodles', 'Noodles', 200),
  },
  {
    id: 'c-street-food',
    slug: 'street-food',
    name: 'Street Food',
    image: photo('samosa', 'Samosas', 200),
  },
  { id: 'c-healthy', slug: 'healthy', name: 'Healthy', image: photo('vegBowl', 'Salad bowl', 200) },
  {
    id: 'c-desserts',
    slug: 'desserts',
    name: 'Desserts',
    image: photo('chocolateCake', 'Chocolate cake', 200),
  },
];
