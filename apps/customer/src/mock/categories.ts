import type { Category } from '@hungerly/types';

import { photo } from './media';

/** Shown in the Home rail, in this order. */
export const homeCategories: Category[] = [
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

/**
 * Every other cuisine the prototype restaurants serve, so "All cuisines" covers the whole
 * catalogue and each entry has at least one restaurant (checked in mock.test.ts).
 * Coastal has no artwork on purpose: cuisines without an image show the fallback tile.
 */
const moreCategories: Category[] = [
  {
    id: 'c-breakfast',
    slug: 'breakfast',
    name: 'Breakfast',
    image: photo('idliVada', 'Idli and vada', 200),
  },
  {
    id: 'c-italian',
    slug: 'italian',
    name: 'Italian',
    image: photo('pepperoniPizza', 'Pepperoni pizza', 200),
  },
  {
    id: 'c-fast-food',
    slug: 'fast-food',
    name: 'Fast Food',
    image: photo('burgerAndFries', 'Burger and fries', 200),
  },
  {
    id: 'c-mughlai',
    slug: 'mughlai',
    name: 'Mughlai',
    image: photo('kadaiCurry', 'Kadai curry', 200),
  },
  {
    id: 'c-kebabs',
    slug: 'kebabs',
    name: 'Kebabs',
    image: photo('kebabsGrill', 'Kebabs on the grill', 200),
  },
  {
    id: 'c-salads',
    slug: 'salads',
    name: 'Salads',
    image: photo('greensSalad', 'Green salad', 200),
  },
  {
    id: 'c-bowls',
    slug: 'bowls',
    name: 'Bowls',
    image: photo('chickenBowl', 'Chicken rice bowl', 200),
  },
  {
    id: 'c-american',
    slug: 'american',
    name: 'American',
    image: photo('doubleBurger', 'Double burger', 200),
  },
  { id: 'c-asian', slug: 'asian', name: 'Asian', image: photo('friedRice', 'Fried rice', 200) },
  { id: 'c-snacks', slug: 'snacks', name: 'Snacks', image: photo('pavBhaji', 'Pav bhaji', 200) },
  {
    id: 'c-beverages',
    slug: 'beverages',
    name: 'Beverages',
    image: photo('chaiWithSpices', 'Masala chai', 200),
  },
  { id: 'c-bakery', slug: 'bakery', name: 'Bakery', image: photo('donuts', 'Doughnuts', 200) },
  {
    id: 'c-seafood',
    slug: 'seafood',
    name: 'Seafood',
    image: photo('prawnCurry', 'Prawn curry', 200),
  },
  { id: 'c-coastal', slug: 'coastal', name: 'Coastal' },
];

/** The full cuisine list (`GET /catalog/cuisines`). */
export const categories: Category[] = [...homeCategories, ...moreCategories];
