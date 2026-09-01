/**
 * THE COVER, IN ONE PLACE: which binder it is, and what is on it.
 *
 * Two steps, and they are genuinely different jobs, so they are two views rather than one long
 * scroll. Choosing the binder happens once; decorating it happens over and over, so a binder that
 * already has a cover opens straight into the decorating and does not make you walk past the
 * catalogue every time.
 *
 * Offered from both the binder's own toolbar and its ⋯ menu on My binders, and it is the same
 * component either way rather than two modals that drift apart.
 */
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { BinderCoverPicker } from '@/components/binder/BinderCoverPicker';
import { CoverStudio } from '@/components/binder/CoverStudio';
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
  // An undressed binder has to choose one before there is anything to decorate.
  const [view, setView] = useState<'decorate' | 'binder'>(binder.cover ? 'decorate' : 'binder');
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.card}>
          <View style={styles.head}>
            <ThemedText type="subtitle">Binder cover</ThemedText>
            <View style={styles.viewTabs}>
              <Pressable
                onPress={() => setView('decorate')}
                style={[styles.viewTab, view === 'decorate' && styles.viewTabOn]}>
                <ThemedText type="small" style={view === 'decorate' ? styles.viewTabOnText : undefined}>
                  Decorate
                </ThemedText>
              </Pressable>
              <Pressable
                onPress={() => setView('binder')}
                style={[styles.viewTab, view === 'binder' && styles.viewTabOn]}>
                <ThemedText type="small" style={view === 'binder' ? styles.viewTabOnText : undefined}>
                  Change binder
                </ThemedText>
              </Pressable>
            </View>
          </View>
          {view === 'binder' ? (
            <>
              <ThemedText type="small" themeColor="textSecondary" style={styles.sub}>
                Which binder these pages live in.
              </ThemedText>
              <BinderCoverPicker
                binder={binder}
                onChange={(cover) => {
                  onChange(cover);
                  setView('decorate');
                }}
              />
            </>
          ) : (
            <CoverStudio binder={binder} onChange={onChange} />
          )}
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
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  viewTabs: { flexDirection: 'row', gap: 6 },
  viewTab: {
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  viewTabOn: { backgroundColor: Palette.accent, borderColor: Palette.accent },
  viewTabOnText: { color: Palette.accentText },
  sub: { marginTop: -4 },
  done: { alignSelf: 'flex-end', paddingVertical: Spacing.one, paddingHorizontal: Spacing.two },
});
