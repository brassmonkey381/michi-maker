/**
 * The bulk-action modal for a multi-selection of pockets (Ctrl/Cmd-click several pockets in the
 * editor, then release the modifier). Offers the actions that make sense across many pockets —
 * duplicate each into the next free pocket, or clear them all. Cancel just drops the selection.
 */
import { Modal, Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontSize, Palette, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function SlotMultiActions({
  count,
  onDuplicate,
  onRemove,
  onFindSimilar,
  onAddToBinder,
  onClose,
}: {
  count: number;
  onDuplicate: () => void;
  onRemove: () => void;
  /** Provided only when similarity search is available and ≥1 card is selected — shows a
   *  "Find similar to all" action that opens the card browse seeded with the selection. */
  onFindSimilar?: () => void;
  /** Copy the selected cards into ANOTHER binder (provided when ≥1 card is selected). */
  onAddToBinder?: () => void;
  /** Dismiss without acting (drops the selection). */
  onClose: () => void;
}) {
  const theme = useTheme();
  if (count <= 0) return null;
  const label = `${count} pocket${count === 1 ? '' : 's'} selected`;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.cardWrap}>
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="subtitle" style={styles.title}>
              {label}
            </ThemedText>
            {onAddToBinder ? (
              <Pressable
                onPress={onAddToBinder}
                style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && styles.pressed]}>
                <ThemedText type="smallBold" style={styles.btnFilledText}>
                  Add to another binder…
                </ThemedText>
              </Pressable>
            ) : null}
            {onFindSimilar ? (
              <Pressable
                onPress={onFindSimilar}
                style={({ pressed }) => [
                  styles.btn,
                  onAddToBinder ? styles.btnOutline : styles.btnPrimary,
                  onAddToBinder ? { borderColor: theme.backgroundSelected } : null,
                  pressed && styles.pressed,
                ]}>
                <ThemedText type="smallBold" style={onAddToBinder ? undefined : styles.btnFilledText}>
                  ≈ Find similar to all
                </ThemedText>
              </Pressable>
            ) : null}
            <Pressable
              onPress={onDuplicate}
              style={({ pressed }) => [
                styles.btn,
                onFindSimilar || onAddToBinder ? styles.btnOutline : styles.btnPrimary,
                onFindSimilar || onAddToBinder ? { borderColor: theme.backgroundSelected } : null,
                pressed && styles.pressed,
              ]}>
              <ThemedText
                type="smallBold"
                style={onFindSimilar || onAddToBinder ? undefined : styles.btnFilledText}>
                Duplicate
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={onRemove}
              style={({ pressed }) => [styles.btn, styles.btnDanger, pressed && styles.pressed]}>
              <ThemedText type="smallBold" style={styles.btnFilledText}>
                Remove
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [
                styles.btn,
                styles.btnOutline,
                { borderColor: theme.backgroundSelected },
                pressed && styles.pressed,
              ]}>
              <ThemedText type="smallBold">Cancel</ThemedText>
            </Pressable>
          </ThemedView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Palette.scrim40, padding: Spacing.four },
  cardWrap: { width: '100%', maxWidth: 320 },
  card: { borderRadius: Radius.lg, padding: Spacing.four, gap: Spacing.two },
  title: { textAlign: 'center', fontSize: FontSize.md, marginBottom: Spacing.one },
  btn: { paddingVertical: Spacing.three, borderRadius: Radius.control, alignItems: 'center' },
  btnPrimary: { backgroundColor: Palette.accent },
  btnDanger: { backgroundColor: Palette.danger },
  btnOutline: { borderWidth: 1 },
  btnFilledText: { color: Palette.accentText },
  pressed: { opacity: 0.75 },
});
