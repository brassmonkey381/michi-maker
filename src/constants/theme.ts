/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#000000',
    background: '#ffffff',
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    textSecondary: '#60646C',
  },
  dark: {
    text: '#ffffff',
    background: '#000000',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;

/**
 * Corner radii used across the binder surface. The grid scales these down for
 * small thumbnails, but the ratios between them stay constant.
 */
export const Radii = {
  /** Outer binder "page" / mat. */
  page: 16,
  pageSmall: 8,
  /** Individual pocket / slot. */
  slot: 8,
  slotSmall: 4,
} as const;

/**
 * Soft, layered shadows. Kept cross-platform: iOS/web read the shadow* props,
 * Android reads `elevation`.
 */
export const Shadows = {
  page: {
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
} as const;

/**
 * The "michi" binder palette — the tonal mat, pocket outlines, inner shadows and
 * the translucent foil overlays. All values are pre-baked rgba strings so they can
 * be layered as plain Views (no gradient library, works on web + native).
 */
export const BinderSurface = {
  /** Page background when a page doesn't specify its own colour. */
  mat: '#fbfaf7',
  /** Empty pocket fill — a touch darker than the mat so it reads as a recess. */
  pocketFill: 'rgba(120, 116, 108, 0.05)',
  /** Pocket outline. */
  pocketBorder: 'rgba(120, 116, 108, 0.20)',
  /** Faint inner-shadow line drawn at the top of an empty pocket. */
  pocketInnerShadow: 'rgba(80, 76, 70, 0.07)',
  /** Card pocket "mat" frame behind a placed card. */
  cardFrame: '#ffffff',
  cardFrameBorder: 'rgba(40, 34, 28, 0.12)',
  /** Diagonal foil sheen drawn over placed cards. */
  foilSheen: 'rgba(255, 255, 255, 0.16)',
  /** Soft inner highlight along the top of a tonal insert. */
  insertHighlight: 'rgba(255, 255, 255, 0.22)',
  insertBorder: 'rgba(0, 0, 0, 0.05)',
  /** Selection ring in the editor. */
  selection: '#3B82F6',
} as const;

/** Default backing tint applied to a slot when a card has no dominantColor. */
export const SlotBackingFallback = '#f1f1f1';
