/**
 * Does the device ask for reduced motion? False until the first read lands, then live. The same
 * reading Confetti and CheatsheetButton do inline; shared here for the puzzle's feedback effects.
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((on) => active && setReduceMotion(on))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (on) =>
      active ? setReduceMotion(on) : undefined,
    );
    return () => {
      active = false;
      sub?.remove?.();
    };
  }, []);
  return reduceMotion;
}
