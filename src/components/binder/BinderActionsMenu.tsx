/**
 * The per-binder "⋯" action menu on the home screen — Rename / Duplicate / Share / Delete —
 * so a user can manage a binder without opening the editor. A small centred modal card;
 * destructive Delete is tinted and routed through a confirm by the caller.
 */
import { Modal, Pressable, StyleSheet, Text } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontSize, Palette, Radii, Radius, Spacing, Weight } from '@/constants/theme';

export function BinderActionsMenu({
  title,
  canShare,
  readOnly = false,
  onRename,
  onDuplicate,
  onShare,
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
  /** Open the "Print placeholders" PDF sheet. Omit to hide the row. */
  onPrint?: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.cardWrap}>
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold" numberOfLines={1} style={styles.title}>
              {title}
            </ThemedText>
            {!readOnly ? <Row label="Rename" onPress={onRename} /> : null}
            <Row label="Duplicate" onPress={onDuplicate} />
            {canShare && !readOnly ? <Row label="Share" onPress={onShare} /> : null}
            {onPrint ? <Row label="Print fill sheets" tone="accent" onPress={onPrint} /> : null}
            <Row label="Delete" tone="danger" onPress={onDelete} />
            <Pressable onPress={onClose} style={styles.cancel} hitSlop={6}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </ThemedView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Row({ label, onPress, tone = 'default' }: { label: string; onPress: () => void; tone?: 'default' | 'danger' | 'accent' }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, tone === 'accent' && styles.rowAccent, pressed && styles.rowPressed]}>
      <Text
        style={[
          styles.rowText,
          tone === 'danger' && styles.rowTextDanger,
          tone === 'accent' && styles.rowTextAccent,
        ]}>
        {label}
      </Text>
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
  card: { borderRadius: Radii.page, padding: Spacing.three, gap: Spacing.half },
  title: { marginBottom: Spacing.two, paddingHorizontal: Spacing.two },
  row: { paddingVertical: Spacing.three, paddingHorizontal: Spacing.two, borderRadius: Radius.control },
  rowPressed: { backgroundColor: Palette.panel },
  // The print action is the tile's headline verb — accent-filled like the home Print button.
  rowAccent: { backgroundColor: Palette.accent, alignItems: 'center' },
  rowText: { fontSize: FontSize.control, fontWeight: Weight.semibold, color: Palette.ink },
  rowTextDanger: { color: Palette.dangerAlt },
  rowTextAccent: { color: Palette.accentText },
  cancel: { marginTop: Spacing.two, paddingVertical: Spacing.three, alignItems: 'center' },
  cancelText: { fontSize: FontSize.control, fontWeight: Weight.semibold, color: Palette.muted },
});
