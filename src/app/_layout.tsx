import { DarkTheme, DefaultTheme, Slot, ThemeProvider } from 'expo-router';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Platform, useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { UsernameGate } from '@/components/auth/UsernameGate';
import { AuthProvider } from '@/store/auth';
import { BinderProvider } from '@/store/binders';

export default function TabLayout() {
  const colorScheme = useColorScheme();

  // On web, suppress the browser's native drag (image-drag / "no-drop" cursor) globally so
  // gesture-handler's Pan gestures (drag-to-move, slice-studio pan) get the mouse drag.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const prevent = (e: Event) => e.preventDefault();
    document.addEventListener('dragstart', prevent);
    return () => document.removeEventListener('dragstart', prevent);
  }, []);

  return (
    // GestureHandlerRootView must wrap the app for any GestureDetector (drag-to-move,
    // page reordering) to receive touches — required on web and native.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AuthProvider>
          <BinderProvider>
            <AnimatedSplashOverlay />
            <Slot />
            {/* Blocks any real account with no @username yet — required, immutable, once per account. */}
            <UsernameGate />
          </BinderProvider>
        </AuthProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
