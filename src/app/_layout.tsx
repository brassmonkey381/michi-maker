import { DarkTheme, DefaultTheme, Slot, ThemeProvider } from 'expo-router';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Platform, useColorScheme, View } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { UsernameGate } from '@/components/auth/UsernameGate';
import { ProStatusBanner } from '@/components/monetization/ProStatusBanner';
import { AppRail } from '@/components/nav/AppRail';
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
            {/* Site frame: the wide-web left rail beside the routed screen. On native (and on
                narrow web / excluded routes) AppRail renders null and the row collapses. */}
            <View style={{ flex: 1, flexDirection: 'row' }}>
              <AppRail />
              <View style={{ flex: 1 }}>
                {/* PRO trial nudge / over-cap reclaim warning / restore — null unless it applies. */}
                <ProStatusBanner />
                <Slot />
              </View>
            </View>
            {/* Blocks any real account with no @username yet — required, immutable, once per account. */}
            <UsernameGate />
          </BinderProvider>
        </AuthProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
