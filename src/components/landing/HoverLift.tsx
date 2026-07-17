/**
 * Hover-lift — native passthrough. Hover is a pointer concept, so on touch platforms this
 * just renders its child. The web variant (HoverLift.web.tsx) carries the actual effect.
 */
import { type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

export function HoverLift({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={style}>{children}</View>;
}
