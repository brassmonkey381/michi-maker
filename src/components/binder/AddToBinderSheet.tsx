/**
 * "Add to a binder" chooser — opened when a card is tapped in the home browse. Lists the user's
 * binders (plus a "New binder" row) so a found card can go straight into a binder without first
 * opening the editor. A bottom sheet, matching the card picker's language.
 */
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import type { DemoBinder } from '@/data/binderTypes';

export function AddToBinderSheet({
  binders,
  onPick,
  onNew,
  onClose,
}: {
  binders: DemoBinder[];
  onPick: (binderId: string) => void;
  onNew: () => void;
  onClose: () => void;
}) {
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropFill} onPress={onClose} />
        <ThemedView type="backgroundElement" style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <ThemedText type="subtitle" style={styles.title}>
              Add to a binder
            </ThemedText>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={styles.close}>Cancel</Text>
            </Pressable>
          </View>

          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            <Pressable onPress={onNew} style={({ pressed }) => [styles.newRow, pressed && styles.pressed]}>
              <Text style={styles.newText}>＋  New binder</Text>
            </Pressable>
            {binders.map((binder) => (
              <Pressable
                key={binder.id}
                onPress={() => onPick(binder.id)}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
                <ThemedText type="smallBold" numberOfLines={1} style={styles.rowTitle}>
                  {binder.title}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {binder.pages.length} {binder.pages.length === 1 ? 'page' : 'pages'}
                </ThemedText>
              </Pressable>
            ))}
            {binders.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
                You don’t have any binders yet — “New binder” starts one with this card.
              </ThemedText>
            ) : null}
          </ScrollView>
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: Palette.scrim40 },
  backdropFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  sheet: {
    borderTopLeftRadius: Radius.sheet,
    borderTopRightRadius: Radius.sheet,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.four,
    maxHeight: '70%',
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: Radius.xs, backgroundColor: Palette.handle, marginBottom: Spacing.two },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.three },
  title: { flex: 1 },
  close: { fontSize: FontSize.md, fontWeight: Weight.semibold, color: Palette.accent },
  list: { flexGrow: 0 },
  listContent: { gap: Spacing.two, paddingBottom: Spacing.two },
  newRow: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.control,
    backgroundColor: Palette.accent,
  },
  newText: { fontSize: FontSize.control, fontWeight: Weight.bold, color: Palette.accentText },
  row: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.control,
    backgroundColor: Palette.panel,
    gap: 2,
  },
  rowTitle: {},
  pressed: { opacity: 0.7 },
  empty: { paddingVertical: Spacing.three, lineHeight: 20 },
});
