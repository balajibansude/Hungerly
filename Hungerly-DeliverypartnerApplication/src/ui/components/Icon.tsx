import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';

import { colors, type ColorToken } from '../theme/colors';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export const iconSize = { sm: 16, md: 20, lg: 24, xl: 32, hero: 48 } as const;

export interface IconProps {
  name: IconName;
  size?: keyof typeof iconSize;
  color?: ColorToken;
}

/**
 * One icon set (Ionicons) keeps the visual language consistent on iOS and Android.
 * Icons are decorative by default; interactive wrappers provide the accessible label.
 */
export function Icon({ name, size = 'md', color = 'textPrimary' }: IconProps) {
  return (
    <Ionicons
      name={name}
      size={iconSize[size]}
      color={colors[color]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}
