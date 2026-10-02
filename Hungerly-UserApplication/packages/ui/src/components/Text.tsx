import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';

import { colors, type ColorToken } from '../theme/colors';
import { maxFontSizeMultiplier, typography, type TypographyVariant } from '../theme/typography';

export interface TextProps extends RNTextProps {
  variant?: TypographyVariant;
  color?: ColorToken;
  align?: TextStyle['textAlign'];
}

/** The only way to render text: every string gets a typography variant and a colour token. */
export function Text({
  variant = 'body',
  color = 'textPrimary',
  align,
  style,
  ...rest
}: TextProps) {
  return (
    <RNText
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      {...rest}
      style={[typography[variant], { color: colors[color] }, align && { textAlign: align }, style]}
    />
  );
}
