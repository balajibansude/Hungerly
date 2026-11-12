import { CUISINE_COLUMNS, cuisineGridMetrics } from './grid';

// Mirrors the design tokens used by the screen (screenGutter = 20, spacing.sm = 8).
const gutter = 20;
const columnGap = 8;

describe('cuisineGridMetrics', () => {
  it.each([320, 360, 390, 430])('fits four columns inside the gutters at %ipt', (screenWidth) => {
    const { itemWidth, imageSize } = cuisineGridMetrics({ screenWidth, gutter, columnGap });
    const used = itemWidth * CUISINE_COLUMNS + columnGap * (CUISINE_COLUMNS - 1);
    expect(used).toBeLessThanOrEqual(screenWidth - gutter * 2);
    expect(imageSize).toBeLessThan(itemWidth);
    expect(imageSize).toBeGreaterThan(50);
  });

  it('caps the image size on large screens', () => {
    expect(cuisineGridMetrics({ screenWidth: 1024, gutter, columnGap }).imageSize).toBe(84);
  });

  it('never returns negative sizes', () => {
    const metrics = cuisineGridMetrics({ screenWidth: 0, gutter, columnGap });
    expect(metrics.itemWidth).toBeGreaterThanOrEqual(0);
    expect(metrics.imageSize).toBeGreaterThanOrEqual(0);
  });
});
