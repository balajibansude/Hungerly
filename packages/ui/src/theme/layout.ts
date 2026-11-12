import { Platform, type ViewStyle } from 'react-native';

import { colors } from './colors';

/** 4-point spacing scale. Use these instead of literal margins/paddings. */
export const spacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
  '5xl': 56,
} as const;

export type SpacingToken = keyof typeof spacing;

export const radius = {
  none: 0,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
  card: 20,
  /** Primary actions are full pills (Foodu-style). */
  button: 999,
  input: 16,
  modal: 28,
  image: 18,
} as const;

/** Horizontal page padding used by every screen. */
export const screenGutter = spacing.xl;

/** Minimum interactive size (Apple HIG 44pt, Material 48dp → 48 on both). */
export const minTouchTarget = 48;

/**
 * Elevation is used sparingly: `low` for cards that sit on white, `high` for floating
 * elements (cart bar, dialogs), `brand` for the soft green glow under primary buttons.
 */
export const elevation = {
  none: {},
  low: Platform.select<ViewStyle>({
    ios: {
      shadowColor: colors.secondary,
      shadowOpacity: 0.08,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
    },
    default: { elevation: 2 },
  }),
  high: Platform.select<ViewStyle>({
    ios: {
      shadowColor: colors.secondary,
      shadowOpacity: 0.16,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 8 },
    },
    default: { elevation: 8 },
  }),
  brand: Platform.select<ViewStyle>({
    ios: {
      shadowColor: colors.primary,
      shadowOpacity: 0.28,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
    },
    default: { elevation: 4, shadowColor: colors.primary },
  }),
} as const;

export const motion = {
  duration: { fast: 150, normal: 250, slow: 400 },
  /** Spring used for press feedback and small layout changes. */
  spring: { damping: 18, stiffness: 260, mass: 0.8 },
  pressedScale: 0.97,
} as const;

export const hitSlop = { top: 8, bottom: 8, left: 8, right: 8 } as const;
