/**
 * The per-binder "⋯" action menu on My Binders: Binder cover and Print fill sheets, then Rename /
 * Duplicate / Share, then Delete, so a binder can be managed without opening the editor. A small
 * centred modal card; destructive Delete is tinted and routed through a confirm by the caller.
 *
 * LAYOUT A (MIC-039 p35, owner's pick 2026-11-15, "A and put a thin border around each of the two
 * blue buttons"). Every row is a real button now. The two "make something" actions stay the
 * headline as two tinted tiles with a thin border; the housekeeping rows are quiet buttons; Delete
 * sits under a rule in red. The blue fill used to be the only thing marking a button, so the other
 * rows read as plain text and the two blue ones sat 2 px apart.
 */
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontSize, Palette, Radii, Radius, Spacing, Weight } from '@/constants/theme';

/** The headline tiles: a light blue with the darker blue that passes 4.5:1 for text. */
const TINT = '#e8effd';
const TINT_INK = '#1d4ed8';
const TINT_EDGE = '#9db5ef';
/** The quiet buttons: a warm grey a step off the card. */
const QUIET = '#e9e7e3';
const DANGER_TINT = '#fbeaea';
const DANGER_INK = '#b42318';

export function BinderActionsMenu({
  title,
  canShare,
  readOnly = false,
  onRename,
  onDuplicate,
  onShare,
  onCover,
  onPrint,
  onDelete,
  onClose,
}: {
  title: string;
  canShare: boolean;
  /** A read-only binder (the "Try it out!" demo): hide Rename + Share, keep Duplicate + Delete
   *  (Duplicate makes a real, editable copy — the "keep it" path). */
  readOnly?: boolean;
  onRename: () => void;
  onDuplicate: () => void;
  onShare: () => void;
  /** Choose which real binder these pages sit in. Omit to hide the tile. */
  onCover?: () => void;
  /** Open the "Print placeholders" PDF sheet. Omit to hide the tile. */
  onPrint?: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const cover = onCover && !readOnly ? onCover : undefined;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.cardWrap}>
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold" numberOfLines={1} style={styles.title}>
              {title}
            </ThemedText>
            {/* The editor no longer carries a "Binder cover" button of its own, so this is the way in. */}
            {cover || onPrint ? (
              <View style={styles.tileRow}>
                {cover ? <Tile glyph="▣" label="Binder cover" onPress={cover} /> : null}
                {onPrint ? <Tile glyph="⎙" label="Print fill sheets" onPress={onPrint} /> : null}
              </View>
            ) : null}
            <View style={styles.list}>
              {!readOnly ? <Row glyph="✎" label="Rename" onPress={onRename} /> : null}
              <Row glyph="⧉" label="Duplicate" onPress={onDuplicate} />
              {canShare && !readOnly ? <Row glyph="↗" label="Share" onPress={onShare} /> : null}
            </View>
            <View style={styles.rule} />
            <Row glyph="✕" label="Delete" tone="danger" onPress={onDelete} />
            <Pressable onPress={onClose} style={styles.cancel} hitSlop={6} accessibilityRole="button">
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </ThemedView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Tile({ glyph, label, onPress }: { glyph: string; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
      <Text style={styles.tileGlyph}>{glyph}</Text>
      <Text style={styles.tileText} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

function Row({ glyph, label, onPress, tone = 'quiet' }: { glyph: string; label: string; onPress: () => void; tone?: 'quiet' | 'danger' }) {
  const ink = tone === 'danger' ? DANGER_INK : Palette.ink;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.row, { backgroundColor: tone === 'danger' ? DANGER_TINT : QUIET }, pressed && styles.pressed]}>
      <Text style={[styles.rowGlyph, { color: ink }]}>{glyph}</Text>
      <Text style={[styles.rowText, { color: ink }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: Palette.scrim45,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  cardWrap: { width: '100%', maxWidth: 340 },
  card: { borderRadius: Radii.page, padding: Spacing.three, gap: Spacing.two },
  title: { paddingHorizontal: 2, marginBottom: 2 },
  tileRow: { flexDirection: 'row', gap: 8 },
  tile: {
    flex: 1,
    minHeight: 86,
    borderRadius: Radius.control,
    borderWidth: 1,
    borderColor: TINT_EDGE,
    backgroundColor: TINT,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 10,
  },
  tileGlyph: { fontSize: 22, fontWeight: Weight.bold, color: TINT_INK },
  tileText: { fontSize: FontSize.sm, fontWeight: Weight.semibold, color: TINT_INK, textAlign: 'center' },
  list: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingVertical: 10, paddingHorizontal: 14, borderRadius: Radius.control },
  rowGlyph: { width: 20, textAlign: 'center', fontSize: 17, fontWeight: Weight.bold },
  rowText: { fontSize: FontSize.control, fontWeight: Weight.semibold },
  rule: { height: 1, backgroundColor: Palette.hairline, marginVertical: 2 },
  cancel: { marginTop: 2, paddingVertical: Spacing.two, alignItems: 'center' },
  cancelText: { fontSize: FontSize.control, fontWeight: Weight.semibold, color: Palette.muted },
  pressed: { opacity: 0.7 },
});
