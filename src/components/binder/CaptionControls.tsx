/**
 * The "Card labels" control for a binder view: a master on/off toggle (with an inline "?" that
 * opens the tabbed {@link LabelsHelp} explainer) and — when on — a wrapped row of field chips
 * (Series, Set, Name, Artist, …). Presentational: the enabled state and the selected fields live
 * in the parent screen so it can feed them to `BinderGrid`. Shared by the owner viewer
 * (`BinderScreen`) and the public viewer (`/binder/[id]`).
 *
 * TWO COMPONENTS, DELIBERATELY. The toggle sits in a horizontal row beside Double-sided, Owned and
 * Scans; the field chips and the help panel are far wider than that pill. When they were children
 * of the toggle, switching labels on widened it and shoved its neighbours sideways — the row
 * visibly rearranged itself as a side effect of an unrelated toggle. Keeping the wide parts in a
 * separate component lets the parent put them on their own line, where growing costs nobody
 * anything.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SignInPerk } from '@/components/auth/SignInPerk';
import { LabelsHelp } from '@/components/binder/LabelsHelp';
import { FontSize, Palette, Spacing, Weight } from '@/constants/theme';
import { pillChip } from '@/constants/ui';
import { pickerFields, type CaptionFieldKey } from '@/data/cardCaption';
import { useCatalog } from '@/hooks/use-catalog';

export function CaptionControls({
  enabled,
  onToggle,
  fields,
  onToggleField,
}: {
  enabled: boolean;
  onToggle: () => void;
  fields: CaptionFieldKey[];
  onToggleField: (key: CaptionFieldKey) => void;
}) {
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <>
      <View style={styles.topRow}>
        <Pressable onPress={onToggle} style={[pillChip.base, enabled && pillChip.active]}>
          <Text style={[pillChip.text, enabled && pillChip.textActive]}>
            {enabled ? '✓ Card labels' : 'Card labels'}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setHelpOpen((v) => !v)}
          hitSlop={6}
          accessibilityLabel="Card labels help"
          style={[styles.helpBtn, helpOpen && styles.helpBtnOn]}>
          <Text style={[styles.helpBtnText, helpOpen && styles.helpBtnTextOn]}>?</Text>
        </Pressable>
      </View>
      {/* The help panel is as wide as the page; it belongs on its own line for the same reason the
          field chips do. Rendered here rather than by the parent because its open state is local. */}
      {helpOpen ? (
        <View style={styles.helpLine}>
          <LabelsHelp onClose={() => setHelpOpen(false)} />
        </View>
      ) : null}
    </>
  );
}

/** The wrapped field chips, on their own line below the toggle row. Renders nothing when labels
 *  are off, so the line costs no height until it is asked for. */
export function CaptionFieldRow({
  enabled,
  fields,
  onToggleField,
}: {
  enabled: boolean;
  fields: CaptionFieldKey[];
  onToggleField: (key: CaptionFieldKey) => void;
}) {
  // Card labels read real metadata from the catalog, which is a signed-in perk (guests browse in
  // cold mode). Subscribe-only here — turning labels on is what forces the load, in BinderGrid.
  const { guestGated } = useCatalog(false);
  if (!enabled) return null;
  if (guestGated) {
    return (
      <SignInPerk message="Card labels read live card data. Sign in (free) to see set, rarity, price and more under each card." />
    );
  }
  return (
    <View style={styles.fieldRow}>
      {pickerFields().map((f) => {
        const on = fields.includes(f.key);
        return (
          <Pressable
            key={f.key}
            onPress={() => onToggleField(f.key)}
            style={[pillChip.base, on && pillChip.active]}>
            <Text style={[pillChip.text, on && pillChip.textActive]}>{f.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  helpLine: { alignItems: 'center', marginTop: Spacing.two },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  fieldRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing.one,
    marginTop: Spacing.two,
  },
  helpBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helpBtnOn: { backgroundColor: Palette.accent, borderColor: Palette.accent },
  helpBtnText: { fontSize: FontSize.label, fontWeight: Weight.bold, color: Palette.muted },
  helpBtnTextOn: { color: Palette.accentText },
});
