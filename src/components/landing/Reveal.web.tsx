/**
 * Scroll-into-view reveal (web). Wraps content so it fades + rises the first time it
 * enters the viewport — the "delayed load" motion the marketing page leans on. Uses
 * IntersectionObserver and drives the transition on the DOM node imperatively (so it
 * survives react-native-web's style normalisation). Honours `prefers-reduced-motion`
 * and degrades to "just show it" if the API is unavailable.
 *
 * Native gets a plain passthrough (see Reveal.tsx) — the landing page is web-first.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

export function Reveal({
  children,
  delay = 0,
  y = 18,
  style,
}: {
  children: ReactNode;
  /** Stagger, in ms, before this element reveals once it's in view. */
  delay?: number;
  /** How far (px) the element rises into place. */
  y?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const ref = useRef<View>(null);

  useEffect(() => {
    const el = ref.current as unknown as HTMLElement | null;
    if (!el) return;

    const reduce =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduce || typeof IntersectionObserver === 'undefined') {
      el.style.opacity = '1';
      el.style.transform = 'none';
      return;
    }

    const ease = 'cubic-bezier(0.22, 1, 0.36, 1)';
    el.style.transition = `opacity 700ms ${ease} ${delay}ms, transform 700ms ${ease} ${delay}ms`;
    el.style.willChange = 'opacity, transform';

    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            el.style.opacity = '1';
            el.style.transform = 'translateY(0)';
            obs.disconnect();
            return;
          }
        }
      },
      { threshold: 0.1, rootMargin: '0px 0px -6% 0px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [delay, y]);

  // Start hidden + shifted so the very first paint is already in the "before" state
  // (no flash). The effect above takes over from here.
  return (
    <View ref={ref} style={[style, { opacity: 0, transform: [{ translateY: y }] }]}>
      {children}
    </View>
  );
}
