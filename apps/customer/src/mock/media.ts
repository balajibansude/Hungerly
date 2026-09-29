import type { ImageRef } from '@hungerly/types';

/**
 * Prototype imagery from the Unsplash CDN (free to use under the Unsplash License).
 * Each photo id was checked to match its description. Real menu images will come
 * from restaurant uploads via the backend (see docs/BLUEPRINT.md §45).
 */
const photos = {
  burgerAndFries: '1561758033-d89a9ad46330',
  butterChickenNaan: '1565557623262-b51c2513a641',
  biryaniPlate: '1589302168068-964664d93dc0',
  biryaniBowl: '1563379091339-03b21ab4a4f8',
  chaiWithSpices: '1571934811356-5cc061b6821f',
  chickenBowl: '1546069901-ba9599a7e63c',
  chocolateCake: '1578985545062-69928b1d9587',
  chocolateShake: '1563805042-7684c019e1cb',
  classicBurger: '1568901346375-23c9450c58cd',
  curryPlatter: '1585937421612-70a008356fbe',
  doubleBurger: '1571091718767-18b5b1457add',
  dosaPlatter: '1668236543090-82eba5ee5976',
  donuts: '1551024601-bec78aea704b',
  friedChicken: '1626082927389-6cd097cdc6ec',
  friedRice: '1603133872878-684f208fb84b',
  greensSalad: '1540189549336-e6e99c3679fe',
  hakkaNoodles: '1585032226651-759b368d7246',
  idliVada: '1630383249896-424e482df921',
  kadaiCurry: '1596797038530-2c107229654b',
  kebabsGrill: '1599487488170-d11ec9c172f0',
  lemonRice: '1512058564366-18510be2db19',
  margherita: '1574071318508-1cdbab80d002',
  pannaCotta: '1488477181946-6428a0291777',
  paneerMakhani: '1631452180519-c014fe946bc7',
  pavBhaji: '1606491956689-2ea866880c84',
  pepperoniPizza: '1513104890138-7c749659a591',
  pizzaSlices: '1565299624946-b28f40a0ae38',
  prawnCurry: '1559847844-5315695dadae',
  samosa: '1601050690597-df0568f70950',
  spread: '1504674900247-0877df9cc836',
  vegBowl: '1512621776951-a57141f2eefd',
} as const;

export type PhotoKey = keyof typeof photos;

/** Builds a sized, cropped CDN URL. Width is in CSS pixels; the CDN serves 2x for sharpness. */
export function photo(key: PhotoKey, alt: string, width = 800): ImageRef {
  return {
    uri: `https://images.unsplash.com/photo-${photos[key]}?auto=format&fit=crop&w=${width}&q=70`,
    alt,
  };
}
