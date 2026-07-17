/**
 * Hover-lift (web): raises and shadows its child on mouse hover — the tactile "these are
 * real, clickable objects" feel for the gallery binders. Driven imperatively on the DOM node
 * so it composes with react-native-web styling. No-op for touch (hover never fires); the
 * native variant (HoverLift.tsx) is a plain passthrough.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

export function HoverLift({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const ref = useRef<View>(null);
  useEffect(() => {
    const el = ref.current as unknown as HTMLElement | null;
    if (!el) return;
    const ease = 'cubic-bezier(0.22, 1, 0.36, 1)';
    el.style.transition = `transform 240ms ${ease}, box-shadow 240ms ${ease}`;
    const enter = () => {
      el.style.transform = 'translateY(-8px)';
      el.style.boxShadow = '0 26px 52px rgba(40, 34, 24, 0.24)';
    };
    const leave = () => {
      el.style.transform = 'translateY(0)';
      el.style.boxShadow = 'none';
    };
    el.addEventListener('mouseenter', enter);
    el.addEventListener('mouseleave', leave);
    return () => {
      el.removeEventListener('mouseenter', enter);
      el.removeEventListener('mouseleave', leave);
    };
  }, []);
  return (
    <View ref={ref} style={style}>
      {children}
    </View>
  );
}
