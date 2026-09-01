/**
 * The cover picker in a modal, so both places that offer it offer exactly the same thing: the
 * binder's own toolbar (where you are looking at the binder) and its ⋯ menu on My binders (where
 * you are managing it without opening it).
 */
import { Modal, Pressable, StyleSheet } from 'react-native';

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
          <ThemedText type="small" themeColor="textSecondary" style={styles.sub}>
            Which binder these pages live in. The art on its covers comes next.
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
  done: { alignSelf: 'flex-end', paddingVertical: Spacing.one, paddingHorizontal: Spacing.two },
});
