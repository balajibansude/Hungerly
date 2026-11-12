export const CUISINE_COLUMNS = 4;
/** Images never grow past this on large phones, so the grid keeps its rhythm. */
const MAX_IMAGE_SIZE = 84;

/**
 * Sizes for the All Cuisines grid: equal columns inside the screen gutters, with a
 * circular image that leaves breathing room on narrow phones (≥ 320 pt). Framework-free
 * (spacing tokens are passed in) so it can be unit-tested.
 */
export function cuisineGridMetrics({
  screenWidth,
  gutter,
  columnGap,
  columns = CUISINE_COLUMNS,
}: {
  screenWidth: number;
  gutter: number;
  columnGap: number;
  columns?: number;
}) {
  const available = Math.max(0, screenWidth - gutter * 2 - columnGap * (columns - 1));
  const itemWidth = Math.floor(available / columns);
  // Keep a little air between neighbouring circles.
  const imageSize = Math.min(MAX_IMAGE_SIZE, Math.max(0, itemWidth - columnGap));
  return { itemWidth, imageSize };
}
