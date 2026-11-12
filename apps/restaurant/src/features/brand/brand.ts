/**
 * Swaadone brand for the restaurant app. Every screen reads the name and logo from here.
 *
 * The logo is the *same file* the customer app uses (apps/customer/assets/brand/), not a
 * copy, so replacing that one file updates both apps. The native icon and splash in
 * app.json point at the same file.
 */
import logo from '../../../../customer/assets/brand/swaadone-logo.png';

export const brand = {
  name: 'Swaadone',
  appName: 'Swaadone Partner',
  logo,
  /** Width ÷ height of the logo artwork. */
  logoAspectRatio: 1,
} as const;
