/**
 * A BUTTON THAT BREATHES. A slow, small swell — three and a half percent, once every couple of
 * seconds — is enough to say "this does something" without waving. Used on the cheatsheet's
 * Try it buttons, which sat as flat pills that read as labels. Off entirely for readers who have
 * asked their system for reduced motion.
 */
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

export function Nudge({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  useEffect(() => {
    if (reduced) return;
    scale.value = withRepeat(
      withSequence(
        withTiming(1.035, { duration: 1100, easing: Easing.inOut(Easing.sin) }),
        withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
    );
  }, [reduced, scale]);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}
