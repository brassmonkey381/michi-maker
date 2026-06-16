import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { BinderProvider } from '@/store/binders';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  return (
    // GestureHandlerRootView must wrap the app for any GestureDetector (drag-to-move,
    // page reordering) to receive touches — required on web and native.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <BinderProvider>
          <AnimatedSplashOverlay />
          <AppTabs />
        </BinderProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
