/**
 * MICHI'S SIDE OF THE SHARED KIT'S ONE DOOR (owner, 2026-10-28: one page shell and one control
 * kit for both sites, skinned per app; 2026-11-07: start on a branch, merge after the Reddit
 * wizard read). tcgscan-ui never imports an app: it reads the live palette and a skin from
 * `KitProvider`, and every kit control and the Shell draw from those.
 *
 * The palette is michi's own, already resolved at module load (constants/theme: the active
 * variant under the effective scheme), plus the five scheme roles the kit's `Palette` type adds.
 * The skin is michi's shape: pill buttons and chips, radius control 8 / panel 12 / sheet 20 (the
 * variant's own ladder), Fraunces for display text on the web, and no shadow under a primary.
 * Sizes are not here on purpose: they come from the kit's one scale.
 */
import { useMemo, type ReactNode } from 'react';
import type { TextStyle } from 'react-native';
import { isDarkHex } from 'tcgscan-theme';
import { KitProvider, tcgscanSkin, type KitSkin } from 'tcgscan-ui';

import { Fonts, Palette, Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Michi's skin: the variant's radius per role, the brand face for display text. */
export const michiSkin: KitSkin = {
  ...tcgscanSkin,
  radius: {
    button: Radius.pill,
    chip: Radius.pill,
    input: Radius.control,
    panel: Radius.panel,
    sheet: Radius.sheet,
    dialog: Radius.panel,
    toast: Radius.panel,
  },
  // Fraunces on the web (global.css --font-brand), the system serif on native: the face michi's
  // wordmark and binder titles already use, so a shell title reads as the same site.
  displayFace: (weight) => ({ fontFamily: Fonts.brand, fontWeight: String(weight) as TextStyle['fontWeight'] }),
};

export function AppKitProvider({ children }: { children: ReactNode }) {
  const roles = useTheme();
  const colors = useMemo(() => ({ ...roles, ...Palette, heading: roles.text }), [roles]);
  return (
    <KitProvider colors={colors} dark={isDarkHex(roles.background)} skin={michiSkin}>
      {children}
    </KitProvider>
  );
}
