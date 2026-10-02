/**
 * Hungerly colour system.
 *
 * Raw palette values are private to this file. Components use the semantic `colors`
 * tokens only, so the palette can evolve (or gain a dark theme) without touching screens.
 *
 * Identity: a warm terracotta primary (appetising, distinct from the bright oranges and
 * reds common in food delivery), a deep herb-green ink for dark surfaces, saffron for
 * highlights, on a warm paper background instead of stark white.
 */
const palette = {
  terracotta50: '#FDF3EC',
  terracotta100: '#FBE3D3',
  terracotta600: '#C2410C',
  terracotta700: '#9A3412',
  ink900: '#16241F',
  ink800: '#1F332C',
  ink700: '#2C4A40',
  saffron100: '#FDF1D8',
  saffron500: '#E8A13A',
  saffron700: '#945607',
  paper: '#FAF7F2',
  white: '#FFFFFF',
  stone50: '#F5F1EA',
  stone100: '#EFE9DF',
  stone200: '#E4DDD1',
  stone300: '#D3CCC0',
  stone400: '#A8A097',
  stone500: '#6E6762',
  stone600: '#57534E',
  stone900: '#1C1917',
  green50: '#ECF7EF',
  green700: '#15803D',
  amber50: '#FEF6E7',
  amber700: '#B45309',
  red50: '#FDEEEE',
  red700: '#B91C1C',
  blue50: '#EEF3FE',
  blue700: '#1D4ED8',
  vegGreen: '#1E7B34',
  nonVegMaroon: '#A12B26',
  eggAmber: '#C77A0A',
} as const;

export const colors = {
  primary: palette.terracotta600,
  primaryPressed: palette.terracotta700,
  primarySoft: palette.terracotta50,
  primarySoftBorder: palette.terracotta100,
  onPrimary: palette.white,

  secondary: palette.ink800,
  secondaryPressed: palette.ink900,
  secondaryMuted: palette.ink700,
  onSecondary: palette.white,

  accent: palette.saffron500,
  accentSoft: palette.saffron100,
  onAccentSoft: palette.saffron700,

  background: palette.paper,
  surface: palette.white,
  surfaceMuted: palette.stone50,
  surfacePressed: palette.stone100,
  card: palette.white,
  overlay: 'rgba(22, 36, 31, 0.48)',
  imagePlaceholder: palette.stone100,

  textPrimary: palette.stone900,
  textSecondary: palette.stone600,
  textTertiary: palette.stone500,
  textInverse: palette.white,
  textLink: palette.terracotta600,

  border: palette.stone200,
  borderStrong: palette.stone300,
  focus: palette.terracotta600,

  success: palette.green700,
  successSoft: palette.green50,
  warning: palette.amber700,
  warningSoft: palette.amber50,
  error: palette.red700,
  errorSoft: palette.red50,
  info: palette.blue700,
  infoSoft: palette.blue50,

  disabled: palette.stone200,
  onDisabled: palette.stone400,

  rating: palette.saffron500,
  veg: palette.vegGreen,
  nonVeg: palette.nonVegMaroon,
  egg: palette.eggAmber,
} as const;

export type ColorToken = keyof typeof colors;
