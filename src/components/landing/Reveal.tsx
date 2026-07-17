/**
 * Scroll-into-view reveal — native passthrough. The marketing landing page is web-first
 * (see lib/landing); on iOS/Android this simply renders its children in place, so the
 * page stays correct without depending on scroll-position instrumentation. The web
 * variant (Reveal.web.tsx) carries the actual fade-and-rise motion.
 */
import { type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

export function Reveal({
  children,
  style,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={style}>{children}</View>;
}
