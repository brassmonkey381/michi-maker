/**
 * WHICH BINDER IT IS. Just that.
 *
 * Decorating used to live in here too, as a second tab, and it was the wrong room for it: a cover
 * you decorate in a dialog is a copy of the cover, at a dialog's size, away from the pages it
 * belongs with. Decorating now happens in the binder itself, in edit mode, on the real surfaces.
 * This sheet is the catalogue and the one binder-wide switch, and it is reachable from the
 * binder's toolbar and from its ⋯ menu on My binders alike.
 */
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { BinderCoverPicker } from '@/components/binder/BinderCoverPicker';
import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import type { BinderCover, DemoBinder } from '@/data/binderTypes';

export function BinderCoverSheet({
  binder,
  onChange,
  onClose,
}: {
  binder: DemoBinder;
  onChange: (cover: BinderCover) => void;
  onClose: () => void;
}) {
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.card}>
          <ThemedText type="subtitle">Binder cover</ThemedText>
          {binder.cover ? (
            <Pressable
              onPress={() =>
                onChange({ ...binder.cover!, showCover: !binder.cover!.showCover })
              }
              style={styles.showRow}
              hitSlop={4}>
              <View style={[styles.check, binder.cover.showCover && styles.checkOn]}>
                {binder.cover.showCover ? (
                  <ThemedText type="small" style={styles.checkMark}>
                    ✓
                  </ThemedText>
                ) : null}
              </View>
              <ThemedText type="small">
                Show cover — use the front cover as this binder&apos;s face on the shelf
              </ThemedText>
            </Pressable>
          ) : null}
          <ThemedText type="small" themeColor="textSecondary" style={styles.sub}>
            Which binder these pages live in. To put art on its covers, open the binder, switch to
            Edit, and pick FC, IFC, IBC or BC in the filmstrip.
          </ThemedText>
          <BinderCoverPicker binder={binder} onChange={onChange} />
          <Pressable onPress={onClose} style={styles.done} hitSlop={6}>
            <ThemedText type="smallBold">Done</ThemedText>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.three,
  },
  card: {
    backgroundColor: Palette.surface,
    borderRadius: Radius.sheet,
    padding: Spacing.three,
    gap: Spacing.two,
    maxWidth: 720,
    width: '100%',
  },
  sub: { marginTop: -4 },
  showRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  check: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: Palette.accent, borderColor: Palette.accent },
  checkMark: { color: Palette.accentText },
  done: { alignSelf: 'flex-end', paddingVertical: Spacing.one, paddingHorizontal: Spacing.two },
});
