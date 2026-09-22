import type { BrowseTheme } from 'tcgscan-browse';

import { Palette } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Map the app's tokens onto the browse kit's injected color contract. Without this the
 * kit falls back to its built-in light look — white tiles and dark text — which is what
 * made the home feed unreadable in dark mode. `Palette` is already scheme-resolved
 * (variants.ts), so this follows light/dark and the active variant automatically.
 */
export function useBrowseTheme(): Partial<BrowseTheme> {
  const theme = useTheme();
  return {
    text: Palette.ink,
    subtext: Palette.muted,
    faint: Palette.muted3,
    accent: Palette.accent,
    accentText: Palette.accentText,
    link: Palette.link,
    background: theme.background,
    panel: Palette.surface,
    border: Palette.hairlineStrong,
    selected: Palette.selectionTint,
    danger: Palette.danger,
    imagePlaceholder: Palette.panel,
    overlay: Palette.scrim45,
    // OUR tile, not TCGPlayer's. A card the catalogue has no art for gets this instead of a
    // grey box reading "no image"; the kit falls back to that text if this is ever omitted.
    // Drawn by tcgscan-data's catalog/coming_soon.py from this app's own mark.
    comingSoonImage: require('@/assets/images/image-coming-soon.png'),
  };
}
