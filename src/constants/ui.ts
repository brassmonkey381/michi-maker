/**
 * Shared control styles — the small style blocks that were copy-pasted across
 * several components (chips, control buttons, the dark "studio" button). Each
 * block is built from the design tokens in `theme.ts`, so a token change (or a
 * future theme variation) restyles every consumer at once.
 *
 * Values here reproduce the previously-duplicated literals exactly, so adopting
 * a shared block in place of a local one is pixel-identical.
 */
import { StyleSheet } from 'react-native';

import { Palette, Radius, Weight, FontSize } from '@/constants/theme';

/** Rounded "pill" chip — identical in BinderScreen and SliceStudio. */
export const pillChip = StyleSheet.create({
  base: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: Radius.pill, backgroundColor: Palette.panel },
  active: { backgroundColor: Palette.accent },
  text: { fontSize: FontSize.label, color: Palette.ink2 },
  textActive: { color: Palette.accentText, fontWeight: Weight.semibold },
});

/** Flat (small-radius) chip — CardPicker span/shape chips. */
export const flatChip = StyleSheet.create({
  base: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: Radius.control, backgroundColor: Palette.panel },
  active: { backgroundColor: Palette.accent },
  text: { fontSize: FontSize.label, color: Palette.ink2 },
  textActive: { color: Palette.accentText, fontWeight: Weight.semibold },
});

/** Neutral/primary control button — SliceStudio toolbar buttons. */
export const controlButton = StyleSheet.create({
  base: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: Radius.control, backgroundColor: Palette.panel },
  primary: { backgroundColor: Palette.accent },
  text: { fontSize: FontSize.body, fontWeight: Weight.semibold, color: Palette.ink2 },
  primaryText: { color: Palette.accentText },
});

/** Dark "studio" launch button — CardPicker + ArtUploadButton (web). */
export const studioButton = StyleSheet.create({
  base: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: Radius.control, backgroundColor: Palette.chrome },
  text: { color: Palette.white, fontWeight: Weight.bold, fontSize: FontSize.label },
});

/**
 * The ONE sheet/dialog scaffold, in two families — adopt these instead of redeclaring:
 * `dialog*` = a centred card over a scrim (Share / Print / Likers / AutoFill / Settings).
 * `bottom*` = a slide-up sheet with a grab handle (CardPicker / AddToBinder).
 * Values match the previously-duplicated literals exactly, so adoption is pixel-identical.
 */
export const sheet = StyleSheet.create({
  dialogBackdrop: {
    flex: 1,
    backgroundColor: Palette.scrim45,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  dialogCard: { borderRadius: 16, padding: 24, gap: 16 },
  bottomBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: Palette.scrim40 },
  bottomSheet: {
    backgroundColor: Palette.surface,
    borderTopLeftRadius: Radius.sheet,
    borderTopRightRadius: Radius.sheet,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
    maxHeight: '85%',
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: Radius.xs, backgroundColor: Palette.handle, marginBottom: 8 },
});
