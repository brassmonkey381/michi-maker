/**
 * The "Card labels" control for a binder view: a master on/off toggle, the "?" that opens the
 * tabbed {@link LabelsHelp} explainer, and — separately — the wrapped row of field chips (Series,
 * Set, Name, Artist, …). Presentational: the enabled state and the selected fields live in the
 * parent screen so it can feed them to `BinderGrid`. Shared by the owner viewer (`BinderScreen`)
 * and the public viewer (`/binder/[id]`).
 *
 * TWO COMPONENTS, DELIBERATELY. The toggle sits in a settings row beside its "Which labels" button;
 * the field chips are far wider than that pill. When they were children of the toggle, switching
 * labels on widened it and shoved its neighbours sideways — the row visibly rearranged itself as a
 * side effect of an unrelated toggle.
 *
 * THE HELP IS A DIALOG, not a panel below the pill. Opened inline it inserted a 460px-wide block
 * into a centred wrap layout, so every pill in the View sheet jumped to a new position and the
 * sheet grew a scrollbar — a lot of movement to answer "what do these fields mean?". Over the top
 * it costs the layout underneath nothing, and closing it puts you back exactly where you were.
 */
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { SignInPerk } from '@/components/auth/SignInPerk';
import { LabelsHelp } from '@/components/binder/LabelsHelp';
import { FontSize, Palette, Spacing, Weight } from '@/constants/theme';
import { pillChip, sheet } from '@/constants/ui';
import { pickerFields, type CaptionFieldKey } from '@/data/cardCaption';
import { useCatalog } from '@/hooks/use-catalog';

export function CaptionControls({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <>
      <Pressable onPress={onToggle} style={[pillChip.base, enabled && pillChip.active]}>
        <Text style={[pillChip.text, enabled && pillChip.textActive]}>
          {enabled ? '✓ Card labels' : 'Card labels'}
        </Text>
      </Pressable>
      <Pressable
        onPress={() => setHelpOpen(true)}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel="What card labels show"
        style={[styles.helpBtn, helpOpen && styles.helpBtnOn]}>
        <Text style={[styles.helpBtnText, helpOpen && styles.helpBtnTextOn]}>?</Text>
      </Pressable>
      {helpOpen ? (
        <Modal visible transparent animationType="fade" onRequestClose={() => setHelpOpen(false)}>
          <View style={sheet.dialogBackdrop}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setHelpOpen(false)} />
            <LabelsHelp onClose={() => setHelpOpen(false)} />
          </View>
        </Modal>
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
