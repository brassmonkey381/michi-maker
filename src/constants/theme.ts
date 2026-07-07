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

/**
 * ─────────────────────────────────────────────────────────────────────────
 * Design tokens (Phase 1 — the de-facto palette + scales, named in one place).
 *
 * Every value here equals a literal that was previously hardcoded across the
 * components, so migrating a literal → token is pixel-identical. `Palette` is
 * the single surface a future theme *variation* swaps (see the redesign plan):
 * change a value here and every consumer updates.
 *
 * NOTE: the existing scheme-aware `Colors` (5 roles) stay the source of truth
 * for light/dark text+background. `Palette` holds the accent/danger/surface/
 * text-ramp/dark-chrome values that today render the same in both schemes.
 * ─────────────────────────────────────────────────────────────────────────
 */
export const Palette = {
  // Brand / accent
  accent: '#3B82F6',
  accentText: '#ffffff',
  accentSoft: '#7EB2FF',
  link: '#3c87f7',
  selectionSoft: '#e8f0fe',
  selectionTint: '#dbe7ff',

  // Neutrals & surfaces (light-locked today)
  white: '#ffffff',
  black: '#000000',
  panel: '#f0f0f3',
  panelAlt: '#f6f6f8',
  controlBorder: '#e0e0e3',
  handle: '#d4d4d4',
  hairline: '#ececec',
  hairlineStrong: '#dddddd',

  // Text ramp on light (strongest → faintest)
  ink: '#222222',
  ink2: '#333333',
  ink3: '#444444',
  ink4: '#555555',
  muted: '#666666',
  muted2: '#888888',
  muted3: '#999999',
  muted4: '#aaaaaa',

  // Text on dark chrome
  onDark: '#9a9a9a',
  onDarkMuted: '#8a8a96',
  onDarkMuted2: '#8a8a93',

  // Status
  danger: '#DC2626',
  dangerAlt: '#c0392b',
  dangerBg: '#fdeaea',
  success: '#059669',

  // Dark chrome (intentionally scheme-independent)
  chrome: '#14131A',
  chromeDeep: '#11111a',
  chromeDeepest: '#0d0d12',
  toast: '#222228',

  // Overlays / scrims
  scrim30: 'rgba(0,0,0,0.3)',
  scrim40: 'rgba(0,0,0,0.4)',
  scrim45: 'rgba(0,0,0,0.45)',
  scrim60: 'rgba(0,0,0,0.6)',
  scrim62: 'rgba(0,0,0,0.62)',

  // Hairline/tint borders
  swatchBorder: 'rgba(128,128,128,0.35)',
  grayBorder50: 'rgba(128,128,128,0.5)',
  grayBorder70: 'rgba(128,128,128,0.7)',
  skeletonFill: 'rgba(150,150,150,0.20)',
  tagWarn: 'rgba(192,57,43,0.85)',
} as const;

/** Corner radii for controls/surfaces (distinct from the binder-page `Radii`). */
export const Radius = {
  xs: 2, // drag handle
  tag: 3,
  sm: 4,
  thumb: 6,
  control: 8, // chips, buttons, inputs
  panel: 12, // canvas, guide cards
  actionBar: 14,
  lg: 16, // empty-state card
  sheet: 20, // bottom-sheet top corners
  pill: 999,
} as const;

/** Font weights as strings (RN renders string/number weights identically). */
export const Weight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

/** The type scale in use across the app, named. */
export const FontSize = {
  tag: 7,
  micro: 9,
  xs: 10,
  sm: 11,
  base: 12,
  label: 13,
  body: 14,
  control: 15,
  md: 16,
  lg: 18,
  h2: 20,
  title: 22,
  nav: 26,
  display: 34,
  hero: 48,
} as const;
