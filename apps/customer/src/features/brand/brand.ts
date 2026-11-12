import logo from '../../../assets/brand/swaadone-logo.png';

/**
 * Customer-facing brand. Every screen reads the name and logo from here, so the
 * temporary logo is replaced by swapping one file:
 *   apps/customer/assets/brand/swaadone-logo.png  (square artwork, any resolution)
 * The native icon and splash (app.json) point at the same file; the Android adaptive
 * icon uses a padded copy, swaadone-adaptive-foreground.png, next to it.
 */
export const brand = {
  name: 'Swaadone',
  logo,
  /** Width ÷ height of the logo artwork. Logos are always drawn at this ratio. */
  logoAspectRatio: 1,
} as const;
