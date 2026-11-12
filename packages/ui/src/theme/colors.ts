/**
 * Swaadone colour system.
 *
 * Raw palette values are private to this file. Components use the semantic `colors`
 * tokens only, so the palette can evolve (or gain a dark theme) without touching screens.
 *
 * Identity: a fresh brand green on clean white surfaces, near-black ink for text, and a
 * small set of bright accents (orange, pink-red, blue) reserved for promotional banners.
 * Food classification uses its own deeper green, red and yellow so it never reads as
 * brand decoration.
 */
const palette = {
  green500: '#1BAC4B',
  green600: '#16913F',
  green700: '#127A37',
  green50: '#E8F7EE',
  green100: '#C9EDD6',
  ink900: '#212121',
  ink800: '#303030',
  ink700: '#424242',
  amber50: '#FFF4E0',
  amber700: '#B45309',
  white: '#FFFFFF',
  grey50: '#FAFAFA',
  grey100: '#F5F5F5',
  grey200: '#EEEEEE',
  grey300: '#E0E0E0',
  grey400: '#BDBDBD',
  grey500: '#9E9E9E',
  grey600: '#757575',
  grey700: '#616161',
  red50: '#FFEDED',
  red400: '#F75555',
  red700: '#D32F2F',
  blue50: '#EAF1FF',
  blue500: '#246BFD',
  blue700: '#1D4ED8',
  star: '#FFC107',
  // Food classification (FSSAI-style marks).
  vegGreen: '#0F8A3C',
  nonVegRed: '#E53935',
  eggAmber: '#C77A0A',
  jainYellow: '#F2A900',
  jainInk: '#9A6B00',
  // Promotional accents: banners only.
  promoOrange: '#FF9800',
  promoPink: '#FF5A5F',
} as const;

export const colors = {
  /** Brand green: buttons, active tab, selected chips, focus. */
  primary: palette.green500,
  primaryPressed: palette.green600,
  primarySoft: palette.green50,
  primarySoftBorder: palette.green100,
  /** Brand green dark enough for small text on white or `primarySoft` (≥ 4.5:1). */
  primaryText: palette.green700,
  onPrimary: palette.white,

  /** Near-black surfaces: CLOSED pills, dark badges, avatar. */
  secondary: palette.ink900,
  secondaryPressed: palette.ink800,
  secondaryMuted: palette.ink700,
  onSecondary: palette.white,

  accent: palette.promoOrange,
  accentSoft: palette.amber50,
  onAccentSoft: palette.amber700,

  background: palette.white,
  surface: palette.white,
  surfaceMuted: palette.grey50,
  surfacePressed: palette.grey100,
  card: palette.white,
  overlay: 'rgba(33, 33, 33, 0.48)',
  imagePlaceholder: palette.grey100,

  textPrimary: palette.ink900,
  textSecondary: palette.grey700,
  /** Lowest-emphasis readable text (4.6:1 on white). */
  textTertiary: palette.grey600,
  /** Placeholders and decorative hints only — below text contrast on purpose. */
  textMuted: palette.grey500,
  textInverse: palette.white,
  textLink: palette.green700,

  border: palette.grey200,
  borderStrong: palette.grey300,
  focus: palette.green500,

  success: palette.green700,
  successSoft: palette.green50,
  warning: palette.amber700,
  warningSoft: palette.amber50,
  /** Error text (5:1 on white). */
  error: palette.red700,
  errorSoft: palette.red50,
  /** Destructive fills and icons (delete, swipe-to-remove). */
  danger: palette.red400,
  info: palette.blue700,
  infoSoft: palette.blue50,

  disabled: palette.grey200,
  onDisabled: palette.grey500,

  rating: palette.star,
  veg: palette.vegGreen,
  nonVeg: palette.nonVegRed,
  egg: palette.eggAmber,
  jain: palette.jainYellow,
  /** Jain yellow is too light for icons and text on white; this darker tone is ≥ 4.5:1. */
  jainInk: palette.jainInk,

  promoGreen: palette.green500,
  promoOrange: palette.promoOrange,
  promoPink: palette.promoPink,
  promoBlue: palette.blue500,
} as const;

export type ColorToken = keyof typeof colors;
