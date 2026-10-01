import type { TextStyle } from 'react-native';

/**
 * Font family names as registered by `@expo-google-fonts/plus-jakarta-sans`.
 * Apps must load these exact keys with `useFonts` before rendering text.
 */
export const fontFamily = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extrabold: 'PlusJakartaSans_800ExtraBold',
} as const;

type TypeStyle = Required<Pick<TextStyle, 'fontFamily' | 'fontSize' | 'lineHeight'>> &
  Pick<TextStyle, 'letterSpacing' | 'fontVariant'>;

/**
 * The only text styles used in the apps. Components pick a variant; they never set
 * font sizes directly. Sizes follow a ~1.2 scale anchored on a 15 pt body.
 */
export const typography = {
  /** Wordmark-sized text for brand moments (splash, auth headers). */
  brand: { fontFamily: fontFamily.extrabold, fontSize: 44, lineHeight: 52, letterSpacing: -1.2 },
  display: { fontFamily: fontFamily.extrabold, fontSize: 32, lineHeight: 38, letterSpacing: -0.6 },
  h1: { fontFamily: fontFamily.bold, fontSize: 26, lineHeight: 32, letterSpacing: -0.4 },
  h2: { fontFamily: fontFamily.bold, fontSize: 21, lineHeight: 28, letterSpacing: -0.2 },
  h3: { fontFamily: fontFamily.semibold, fontSize: 17, lineHeight: 24 },
  bodyLarge: { fontFamily: fontFamily.regular, fontSize: 16, lineHeight: 24 },
  body: { fontFamily: fontFamily.regular, fontSize: 15, lineHeight: 22 },
  bodySmall: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fontFamily.medium, fontSize: 12, lineHeight: 16 },
  label: { fontFamily: fontFamily.semibold, fontSize: 13, lineHeight: 18, letterSpacing: 0.1 },
  button: { fontFamily: fontFamily.bold, fontSize: 15, lineHeight: 20, letterSpacing: 0.1 },
  price: {
    fontFamily: fontFamily.bold,
    fontSize: 15,
    lineHeight: 20,
    fontVariant: ['tabular-nums'],
  },
  metadata: { fontFamily: fontFamily.medium, fontSize: 12, lineHeight: 16 },
} as const satisfies Record<string, TypeStyle>;

export type TypographyVariant = keyof typeof typography;

/**
 * Upper bound for Dynamic Type / font scaling. Large enough for accessibility (≈200%),
 * bounded so layouts do not break entirely.
 */
export const maxFontSizeMultiplier = 2;
