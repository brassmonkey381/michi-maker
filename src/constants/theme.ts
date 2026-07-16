/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

import { activePalette, activeVariant } from '@/constants/variants';

/**
 * Scheme-aware colour roles for the ACTIVE theme variation (see
 * `constants/variants.ts`). Resolved once at module load; `useTheme()` indexes
 * this by the current light/dark scheme.
 */
export const Colors = activeVariant.colors;

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
/** Readable column for prose and forms (descriptions, empty states, auth). Text wider than
 *  this gets hard to read, so it stays capped even inside a wide shell. */
export const MaxContentWidth = 800;
/** Shell width for VISUAL surfaces (home sections, binder viewer, profiles). This is a
 *  gallery app — grids/carousels/spreads use the extra room to show more art; prose inside
 *  a wide shell should still cap itself at MaxContentWidth. */
export const MaxContentWidthWide = 1440;
/** Max on-screen width of a rendered binder page (the grid + its cards scale to this). The
 *  viewer caps at this on wide screens; narrow screens fall back to the available width. */
export const BinderPageMaxWidth = 560;

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
 * the translucent foil overlays (per active variation). Layered as plain Views
 * (no gradient library, works on web + native).
 */
export const BinderSurface = activeVariant.surface;

/** Default backing tint applied to a slot when a card has no dominantColor. */
export const SlotBackingFallback = activeVariant.slotBacking;

/**
 * ─────────────────────────────────────────────────────────────────────────
 * Semantic design tokens for the ACTIVE variation (see `constants/variants.ts`).
 *
 * `Palette` = accent / status / surface / text-ramp / dark-chrome colours, plus
 * `surface` (raised card/sheet bg) and `accentText` (text on the accent).
 * `Radius` = control/surface corner radii (distinct from the binder-page `Radii`).
 *
 * Semantic tokens (`panel`, the `ink*` text ramp, `surface`, …) let a dark
 * variation like "Dark Vault" restyle the whole editor by value alone — no
 * per-component branching.
 * ─────────────────────────────────────────────────────────────────────────
 */
// Scheme-resolved at module load: dark schemes get the variant's `paletteDark` overrides
// (surfaces, ink ramp, hairlines) so palette-styled chrome is readable in dark mode.
export const Palette = activePalette;

export const Radius = activeVariant.radius;

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
