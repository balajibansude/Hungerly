import Svg, { Circle, Path, Rect } from 'react-native-svg';

/** The Hungerly mark (same geometry as the app icon and the admin panel): white "h", saffron dot, terracotta. */
export function LogoMark({ size = 48, radius = 0.28 }: { size?: number; radius?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024" accessibilityLabel="Hungerly">
      <Rect width={1024} height={1024} rx={1024 * radius} fill="#C2410C" />
      <Path d="M341 306h104v184c28-31 66-45 110-45 82 0 135 57 135 146v246H585V611c0-43-25-70-66-70-45 0-74 31-74 79v217H341z" fill="#FFFFFF" />
      <Circle cx={690} cy={300} r={62} fill="#E8A13A" />
    </Svg>
  );
}
