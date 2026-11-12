import type { Food, FoodOptionGroup, FoodType, Menu } from '@hungerly/types';
import { money } from '@hungerly/utils';

import { photo, type PhotoKey } from './media';

interface FoodSeed {
  id: string;
  name: string;
  description: string;
  pricePaise: number;
  /** Price before a dish-level deal (sample data); must be above `pricePaise`. */
  originalPricePaise?: number;
  foodType: FoodType;
  photo?: PhotoKey;
  bestseller?: boolean;
  rating?: [average: number, count: number];
  available?: boolean;
  options?: FoodOptionGroup[];
}

function group(
  id: string,
  name: string,
  select: [min: number, max: number],
  options: [id: string, name: string, deltaPaise: number][],
): FoodOptionGroup {
  return {
    id,
    name,
    minSelect: select[0],
    maxSelect: select[1],
    options: options.map(([optionId, optionName, delta]) => ({
      id: optionId,
      name: optionName,
      priceDelta: money(delta),
      isAvailable: true,
    })),
  };
}

function menu(
  restaurantId: string,
  sections: [id: string, name: string, foods: FoodSeed[]][],
): Menu {
  return {
    restaurantId,
    categories: sections.map(([categoryId, name, foods]) => ({
      id: categoryId,
      name,
      foods: foods.map((seed): Food => ({
        id: seed.id,
        restaurantId,
        categoryId,
        name: seed.name,
        description: seed.description,
        price: money(seed.pricePaise),
        ...(seed.originalPricePaise ? { originalPrice: money(seed.originalPricePaise) } : {}),
        foodType: seed.foodType,
        image: seed.photo ? photo(seed.photo, seed.name, 600) : undefined,
        rating: seed.rating ? { average: seed.rating[0], count: seed.rating[1] } : undefined,
        isAvailable: seed.available ?? true,
        isBestseller: seed.bestseller ?? false,
        optionGroups: seed.options ?? [],
      })),
    })),
  };
}

const spiceLevel = (prefix: string) =>
  group(
    `${prefix}-spice`,
    'Spice level',
    [1, 1],
    [
      [`${prefix}-mild`, 'Mild', 0],
      [`${prefix}-medium`, 'Medium', 0],
      [`${prefix}-hot`, 'Hot', 0],
    ],
  );

export const menus: Menu[] = [
  menu('r-tandoor-tales', [
    [
      'm-tt-recommended',
      'Recommended',
      [
        {
          id: 'f-tt-butter-chicken',
          name: 'Butter Chicken',
          description: 'Tandoori chicken simmered in a velvety tomato, butter and fenugreek gravy.',
          pricePaise: 34900,
          foodType: 'non_veg',
          photo: 'butterChickenNaan',
          bestseller: true,
          rating: [4.6, 1240],
          options: [
            group(
              'g-tt-bc-portion',
              'Portion',
              [1, 1],
              [
                ['o-tt-bc-half', 'Half (serves 1)', 0],
                ['o-tt-bc-full', 'Full (serves 2)', 18000],
              ],
            ),
          ],
        },
        {
          id: 'f-tt-paneer-makhani',
          name: 'Paneer Makhani',
          description: 'Soft cottage cheese in a mildly sweet makhani gravy finished with cream.',
          pricePaise: 29900,
          foodType: 'veg',
          photo: 'paneerMakhani',
          bestseller: true,
          rating: [4.5, 860],
        },
        {
          id: 'f-tt-seekh-kebab',
          name: 'Charcoal Seekh Kebab',
          description:
            'Minced mutton skewers with ginger, green chilli and coriander, grilled over charcoal.',
          pricePaise: 38900,
          foodType: 'non_veg',
          photo: 'kebabsGrill',
          rating: [4.4, 510],
        },
      ],
    ],
    [
      'm-tt-curries',
      'Curries',
      [
        {
          id: 'f-tt-kadai-veg',
          name: 'Kadai Vegetables',
          description:
            'Seasonal vegetables tossed with bell peppers and freshly pounded kadai masala.',
          pricePaise: 25900,
          foodType: 'veg',
          photo: 'kadaiCurry',
          options: [spiceLevel('g-tt-kv')],
        },
        {
          id: 'f-tt-dal-makhani',
          name: 'Dal Makhani',
          description: 'Black lentils slow-cooked overnight with butter and cream.',
          pricePaise: 22900,
          foodType: 'veg',
          rating: [4.7, 1420],
          bestseller: true,
        },
      ],
    ],
    [
      'm-tt-breads',
      'Breads',
      [
        {
          id: 'f-tt-butter-naan',
          name: 'Butter Naan',
          description: 'Leavened bread from the tandoor, brushed with butter.',
          pricePaise: 6900,
          foodType: 'veg',
        },
        {
          id: 'f-tt-garlic-naan',
          name: 'Garlic Naan',
          description: 'Tandoor-baked naan topped with roasted garlic and coriander.',
          pricePaise: 7900,
          foodType: 'veg',
        },
      ],
    ],
  ]),
  menu('r-dosa-republic', [
    [
      'm-dr-dosas',
      'Dosas',
      [
        {
          id: 'f-dr-masala-dosa',
          name: 'Mysore Masala Dosa',
          description:
            'Crisp rice-lentil crepe with red chutney and spiced potato, served with sambar.',
          pricePaise: 14900,
          foodType: 'veg',
          photo: 'dosaPlatter',
          bestseller: true,
          rating: [4.7, 2980],
          options: [
            group(
              'g-dr-md-extras',
              'Add extras',
              [0, 2],
              [
                ['o-dr-md-butter', 'Extra butter', 2000],
                ['o-dr-md-cheese', 'Cheese', 3500],
              ],
            ),
          ],
        },
        {
          id: 'f-dr-jain-dosa',
          name: 'Jain Rava Dosa',
          description:
            'Crisp semolina dosa made the Jain way: no onion, garlic, potato or other root vegetables.',
          pricePaise: 13900,
          foodType: 'jain',
          photo: 'dosaPlatter',
        },
        {
          id: 'f-dr-plain-dosa',
          name: 'Ghee Roast Dosa',
          description: 'Paper-thin dosa roasted in pure ghee until golden.',
          pricePaise: 12900,
          foodType: 'veg',
        },
      ],
    ],
    [
      'm-dr-tiffin',
      'Tiffin',
      [
        {
          id: 'f-dr-idli-vada',
          name: 'Idli Vada Combo',
          description: 'Two steamed idlis and a crisp medu vada with sambar and coconut chutney.',
          pricePaise: 11900,
          originalPricePaise: 14900,
          foodType: 'veg',
          photo: 'idliVada',
          rating: [4.5, 1320],
        },
        {
          id: 'f-dr-lemon-rice',
          name: 'Lemon Rice',
          description: 'Tempered rice with lemon, peanuts, curry leaves and turmeric.',
          pricePaise: 12900,
          foodType: 'veg',
          photo: 'lemonRice',
        },
      ],
    ],
    [
      'm-dr-beverages',
      'Beverages',
      [
        {
          id: 'f-dr-filter-coffee',
          name: 'Filter Coffee',
          description: 'Strong decoction with frothy hot milk, served in a davara.',
          pricePaise: 6900,
          foodType: 'veg',
          bestseller: true,
        },
      ],
    ],
  ]),
  menu('r-biryani-baithak', [
    [
      'm-bb-biryani',
      'Biryani',
      [
        {
          id: 'f-bb-chicken-dum',
          name: 'Hyderabadi Chicken Dum Biryani',
          description:
            'Marinated chicken and long-grain basmati sealed and slow-cooked with saffron.',
          pricePaise: 32900,
          foodType: 'non_veg',
          photo: 'biryaniPlate',
          bestseller: true,
          rating: [4.5, 3890],
          options: [
            group(
              'g-bb-cd-portion',
              'Portion',
              [1, 1],
              [
                ['o-bb-cd-regular', 'Regular (serves 1)', 0],
                ['o-bb-cd-family', 'Family pack (serves 3)', 42000],
              ],
            ),
            group(
              'g-bb-cd-sides',
              'Add sides',
              [0, 2],
              [
                ['o-bb-cd-raita', 'Boondi raita', 4900],
                ['o-bb-cd-salan', 'Mirchi ka salan', 5900],
              ],
            ),
          ],
        },
        {
          id: 'f-bb-veg-dum',
          name: 'Subz Dum Biryani',
          description:
            'Seasonal vegetables and paneer layered with fragrant rice and fried onions.',
          pricePaise: 26900,
          foodType: 'veg',
          photo: 'biryaniBowl',
          rating: [4.2, 740],
        },
        {
          id: 'f-bb-egg',
          name: 'Egg Biryani',
          description: 'Masala-roasted eggs over spiced dum rice.',
          pricePaise: 23900,
          foodType: 'egg',
        },
      ],
    ],
  ]),
  menu('r-bowl-theory', [
    [
      'm-bt-bowls',
      'Bowls',
      [
        {
          id: 'f-bt-grilled-chicken',
          name: 'Grilled Chicken Power Bowl',
          description:
            'Herb chicken, quinoa, charred corn, cherry tomatoes and lime-yoghurt dressing.',
          pricePaise: 34900,
          foodType: 'non_veg',
          photo: 'chickenBowl',
          bestseller: true,
          rating: [4.4, 420],
        },
        {
          id: 'f-bt-rainbow',
          name: 'Rainbow Buddha Bowl',
          description: 'Avocado, roasted beets, chickpeas, greens and tahini.',
          pricePaise: 31900,
          originalPricePaise: 37900,
          foodType: 'veg',
          photo: 'vegBowl',
        },
      ],
    ],
    [
      'm-bt-salads',
      'Salads',
      [
        {
          id: 'f-bt-green-goddess',
          name: 'Green Goddess Salad',
          description: 'Crunchy greens, cucumber, seeds and a herby avocado dressing.',
          pricePaise: 27900,
          foodType: 'veg',
          photo: 'greensSalad',
          options: [
            group(
              'g-bt-gg-protein',
              'Add protein',
              [0, 1],
              [
                ['o-bt-gg-paneer', 'Grilled paneer', 6000],
                ['o-bt-gg-chicken', 'Grilled chicken', 8000],
              ],
            ),
          ],
        },
      ],
    ],
  ]),
  menu('r-smoke-street', [
    [
      'm-ss-burgers',
      'Burgers',
      [
        {
          id: 'f-ss-classic',
          name: 'Classic Smash Burger',
          description: 'Double smashed chicken patty, cheddar, pickles and smoky house sauce.',
          pricePaise: 24900,
          foodType: 'non_veg',
          photo: 'classicBurger',
          bestseller: true,
          rating: [4.3, 980],
          options: [
            group(
              'g-ss-cl-addons',
              'Add-ons',
              [0, 3],
              [
                ['o-ss-cl-cheese', 'Extra cheese slice', 3000],
                ['o-ss-cl-egg', 'Fried egg', 3500],
                ['o-ss-cl-jalapeno', 'Jalapeños', 2000],
              ],
            ),
          ],
        },
        {
          id: 'f-ss-double',
          name: 'Double Trouble Burger',
          description: 'Two patties, caramelised onions, lettuce and chipotle mayo.',
          pricePaise: 32900,
          foodType: 'non_veg',
          photo: 'doubleBurger',
        },
        {
          id: 'f-ss-veg',
          name: 'Crispy Veg Burger',
          description: 'Crumbed potato and pea patty with tangy slaw.',
          pricePaise: 17900,
          foodType: 'veg',
        },
      ],
    ],
    [
      'm-ss-sides',
      'Sides',
      [
        {
          id: 'f-ss-fries',
          name: 'Twice-Cooked Fries',
          description: 'Skin-on fries with peri-peri salt.',
          pricePaise: 12900,
          originalPricePaise: 15900,
          foodType: 'veg',
          photo: 'burgerAndFries',
        },
        {
          id: 'f-ss-chicken',
          name: 'Crispy Fried Chicken (4 pcs)',
          description: 'Buttermilk-brined chicken with a crunchy spiced coating.',
          pricePaise: 29900,
          foodType: 'non_veg',
          photo: 'friedChicken',
          available: false,
        },
      ],
    ],
  ]),
  menu('r-forno-nonna', [
    [
      'm-fn-pizza',
      'Wood-fired pizza',
      [
        {
          id: 'f-fn-margherita',
          name: 'Margherita',
          description: 'San Marzano tomato, fior di latte and fresh basil.',
          pricePaise: 44900,
          foodType: 'veg',
          photo: 'margherita',
          bestseller: true,
          rating: [4.8, 640],
          options: [
            group(
              'g-fn-ma-size',
              'Size',
              [1, 1],
              [
                ['o-fn-ma-10', '10 inch', 0],
                ['o-fn-ma-12', '12 inch', 15000],
              ],
            ),
          ],
        },
        {
          id: 'f-fn-pepperoni',
          name: 'Spicy Pepperoni',
          description: 'Chicken pepperoni, mozzarella, chilli oil and oregano.',
          pricePaise: 54900,
          foodType: 'non_veg',
          photo: 'pepperoniPizza',
          options: [
            group(
              'g-fn-pe-size',
              'Size',
              [1, 1],
              [
                ['o-fn-pe-10', '10 inch', 0],
                ['o-fn-pe-12', '12 inch', 16000],
              ],
            ),
          ],
        },
        {
          id: 'f-fn-garden',
          name: 'Garden Bianca',
          description: 'White base with ricotta, zucchini, olives and rocket.',
          pricePaise: 49900,
          foodType: 'veg',
          photo: 'pizzaSlices',
        },
      ],
    ],
    [
      'm-fn-desserts',
      'Desserts',
      [
        {
          id: 'f-fn-panna-cotta',
          name: 'Strawberry Panna Cotta',
          description: 'Vanilla bean cream set with fresh strawberry compote.',
          pricePaise: 24900,
          foodType: 'veg',
          photo: 'pannaCotta',
        },
      ],
    ],
  ]),
  menu('r-wok-this-way', [
    [
      'm-wt-noodles',
      'Noodles & Rice',
      [
        {
          id: 'f-wt-hakka',
          name: 'Veg Hakka Noodles',
          description: 'Wok-tossed noodles with cabbage, carrots, spring onion and soy.',
          pricePaise: 19900,
          foodType: 'veg',
          photo: 'hakkaNoodles',
          bestseller: true,
          rating: [4.2, 1510],
          options: [spiceLevel('g-wt-hk')],
        },
        {
          id: 'f-wt-fried-rice',
          name: 'Chicken Fried Rice',
          description: 'Smoky wok-fried rice with egg, chicken and vegetables.',
          pricePaise: 22900,
          foodType: 'non_veg',
          photo: 'friedRice',
        },
      ],
    ],
    [
      'm-wt-starters',
      'Starters',
      [
        {
          id: 'f-wt-chilli-paneer',
          name: 'Chilli Paneer Dry',
          description: 'Crisp paneer tossed with peppers, onions and a sweet-hot glaze.',
          pricePaise: 23900,
          foodType: 'veg',
          rating: [4.3, 890],
        },
      ],
    ],
  ]),
  menu('r-chai-chaat', [
    [
      'm-cc-street',
      'Street classics',
      [
        {
          id: 'f-cc-pav-bhaji',
          name: 'Butter Pav Bhaji',
          description: 'Mashed vegetable bhaji with butter-toasted pav, onion and lemon.',
          pricePaise: 14900,
          foodType: 'veg',
          photo: 'pavBhaji',
          bestseller: true,
          rating: [4.6, 2740],
          options: [
            group(
              'g-cc-pb-extras',
              'Extras',
              [0, 2],
              [
                ['o-cc-pb-pav', 'Extra pav (2 pcs)', 3000],
                ['o-cc-pb-cheese', 'Cheese', 3500],
              ],
            ),
          ],
        },
        {
          id: 'f-cc-jain-pav-bhaji',
          name: 'Jain Pav Bhaji',
          description:
            'Raw-banana and capsicum bhaji with butter pav, cooked without onion, garlic or root vegetables.',
          pricePaise: 15900,
          foodType: 'jain',
          photo: 'pavBhaji',
          rating: [4.5, 410],
        },
        {
          id: 'f-cc-samosa',
          name: 'Punjabi Samosa (2 pcs)',
          description: 'Flaky pastry with spiced potato and peas, with mint and tamarind chutneys.',
          pricePaise: 6900,
          originalPricePaise: 8900,
          foodType: 'veg',
          photo: 'samosa',
          rating: [4.4, 1650],
        },
      ],
    ],
    [
      'm-cc-chai',
      'Chai',
      [
        {
          id: 'f-cc-masala-chai',
          name: 'Masala Cutting Chai',
          description: 'Strong tea brewed with ginger, cardamom and a secret spice mix.',
          pricePaise: 3900,
          foodType: 'veg',
          photo: 'chaiWithSpices',
        },
      ],
    ],
  ]),
  menu('r-sugar-loaf', [
    [
      'm-sl-cakes',
      'Cakes & bakes',
      [
        {
          id: 'f-sl-chocolate',
          name: 'Belgian Chocolate Truffle Cake (500 g)',
          description: 'Moist chocolate sponge layered with dark ganache.',
          pricePaise: 64900,
          foodType: 'egg',
          photo: 'chocolateCake',
          bestseller: true,
          rating: [4.7, 520],
        },
        {
          id: 'f-sl-donuts',
          name: 'Glazed Doughnuts (4 pcs)',
          description: 'Pillowy doughnuts with a chocolate glaze and sprinkles.',
          pricePaise: 29900,
          foodType: 'egg',
          photo: 'donuts',
        },
        {
          id: 'f-sl-shake',
          name: 'Chocolate Fudge Shake',
          description: 'Thick chocolate shake with fudge sauce and cookie crumbs.',
          pricePaise: 21900,
          originalPricePaise: 26900,
          foodType: 'veg',
          photo: 'chocolateShake',
        },
      ],
    ],
  ]),
  menu('r-coastal-curry', [
    [
      'm-cu-curries',
      'Coastal curries',
      [
        {
          id: 'f-cu-prawn-gassi',
          name: 'Prawn Gassi with Rice',
          description: 'Mangalorean prawn curry in coconut and byadgi chilli, with steamed rice.',
          pricePaise: 44900,
          foodType: 'non_veg',
          photo: 'prawnCurry',
          bestseller: true,
          rating: [4.5, 610],
        },
        {
          id: 'f-cu-veg-stew',
          name: 'Kerala Vegetable Stew',
          description: 'Mild coconut milk stew with vegetables and whole spices.',
          pricePaise: 27900,
          foodType: 'veg',
          photo: 'curryPlatter',
        },
      ],
    ],
  ]),
];

export const allFoods: Food[] = menus.flatMap((m) => m.categories.flatMap((c) => c.foods));
