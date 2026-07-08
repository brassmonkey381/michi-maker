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
  onRename,
  onDuplicate,
  onShare,
  onDelete,
  onClose,
}: {
  title: string;
  canShare: boolean;
  onRename: () => void;
  onDuplicate: () => void;
  onShare: () => void;
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
            <Row label="Rename" onPress={onRename} />
            <Row label="Duplicate" onPress={onDuplicate} />
            {canShare ? <Row label="Share" onPress={onShare} /> : null}
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

function Row({ label, onPress, tone = 'default' }: { label: string; onPress: () => void; tone?: 'default' | 'danger' }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <Text style={[styles.rowText, tone === 'danger' && styles.rowTextDanger]}>{label}</Text>
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
  rowText: { fontSize: FontSize.control, fontWeight: Weight.semibold, color: Palette.ink },
  rowTextDanger: { color: Palette.dangerAlt },
  cancel: { marginTop: Spacing.two, paddingVertical: Spacing.three, alignItems: 'center' },
  cancelText: { fontSize: FontSize.control, fontWeight: Weight.semibold, color: Palette.muted },
});
