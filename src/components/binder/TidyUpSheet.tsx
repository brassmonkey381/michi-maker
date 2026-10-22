/**
 * TIDY UP THE ARTWORK TRAY (owner, 2026-10-22). Every piece no binder uses, shown before anything
 * is deleted: grouped by the picture it was cut from, each piece ticked by default, a tap unticks
 * it, a group heading flips its whole picture. One button deletes what is ticked. Deleted pieces
 * go to the tray's Recently removed list, with Restore, so a bulk clean is never a bet.
 *
 * What other tools do, and what was taken: Figma's "remove unused", InDesign's Links panel and
 * every photo manager show the candidates as thumbnails with ticks and delete in one go; Lightroom
 * and Google Photos delete into a bin with undo. Folders and tags were left out on purpose: nobody
 * files art by hand, and the pieces already group by picture.
 */
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SliceThumb } from '@/components/binder/SliceTray';
import { DialogCard } from '@/components/ui/DialogCard';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { track } from '@/lib/analytics';
import { restoreSavedSlices, useRecentlyRemovedSlices, type SavedSlice } from '@/data/savedSlices';
import { tidyGroups } from '@/data/sliceTidy';

const THUMB = 64;

export function TidyUpSheet({
  slices,
  usedSignatures,
  onDelete,
  onClose,
}: {
  slices: readonly SavedSlice[];
  /** Content signatures of every artwork pocket across the account's binders. */
  usedSignatures: ReadonlySet<string>;
  /** Remove these pieces from the tray. They are unused, so no pocket is touched. */
  onDelete: (slices: SavedSlice[]) => void;
  onClose: () => void;
}) {
  const groups = useMemo(() => tidyGroups(slices, usedSignatures), [slices, usedSignatures]);
  const all = useMemo(() => groups.flatMap((g) => g.unused), [groups]);
  // Unticked ids: everything starts ticked, so the common case is one press.
  const [kept, setKept] = useState<Set<string>>(() => new Set());
  const removed = useRecentlyRemovedSlices();
  const chosen = all.filter((s) => !kept.has(s.id));
  const used = slices.length - all.length;

  const toggle = (id: string) =>
    setKept((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleGroup = (ids: string[]) =>
    setKept((prev) => {
      const next = new Set(prev);
      const allKept = ids.every((id) => next.has(id));
      for (const id of ids) {
        if (allKept) next.delete(id);
        else next.add(id);
      }
      return next;
    });

  const del = () => {
    if (!chosen.length) return;
    track('art.tidy', { deleted: chosen.length, unused: all.length, kept: kept.size });
    onDelete(chosen);
    onClose();
  };

  return (
    <DialogCard title="Tidy up" onClose={onClose} maxWidth={560}>
      <View style={styles.body}>
        <Text style={styles.lead}>
          {all.length === 0
            ? used > 0
              ? `Every piece in your tray is in a binder. Nothing to tidy.`
              : 'Your tray is empty.'
            : `${all.length} piece${all.length === 1 ? ' is' : 's are'} not in any of your binders${used ? `, ${used} ${used === 1 ? 'is' : 'are'}` : ''}. Untick anything to keep.`}
        </Text>

        {groups.map((g) => {
          const ids = g.unused.map((s) => s.id);
          const groupKept = ids.filter((id) => kept.has(id)).length;
          return (
            <View key={g.key} style={styles.group}>
              <Pressable onPress={() => toggleGroup(ids)} accessibilityRole="button" style={styles.groupHead}>
                <Text style={styles.groupName} numberOfLines={1}>
                  {g.name} · {g.unused.length} unused{g.usedCount ? `, ${g.usedCount} in use` : ''}
                </Text>
                <Text style={styles.groupToggle}>{groupKept === ids.length ? 'Delete all' : 'Keep all'}</Text>
              </Pressable>
              <View style={styles.grid}>
                {g.unused.map((s) => {
                  const keep = kept.has(s.id);
                  return (
                    <Pressable
                      key={s.id}
                      onPress={() => toggle(s.id)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: !keep }}
                      accessibilityLabel={keep ? 'Kept' : 'Marked for deletion'}
                      style={[styles.cell, keep && styles.cellKept]}>
                      <SliceThumb slice={s} style={{ width: THUMB * s.cs, height: THUMB, borderRadius: Radius.tag }} />
                      <View style={[styles.tick, keep && styles.tickOff]}>
                        <Text style={styles.tickText}>{keep ? '' : '✓'}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        })}

        {all.length > 0 ? (
          <View style={styles.actions}>
            <Pressable onPress={onClose} style={({ pressed }) => [styles.btn, pressed && styles.pressed]}>
              <Text style={styles.btnText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={del}
              disabled={!chosen.length}
              testID="tidy-delete"
              style={({ pressed }) => [styles.btn, styles.btnDanger, !chosen.length && styles.btnOff, pressed && styles.pressed]}>
              <Text style={[styles.btnText, styles.btnDangerText]}>
                {chosen.length ? `Delete ${chosen.length} piece${chosen.length === 1 ? '' : 's'}` : 'Nothing ticked'}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {removed.length > 0 ? (
          <View style={styles.group}>
            <View style={styles.groupHead}>
              <Text style={styles.groupName}>Recently removed · {removed.length}</Text>
              <Pressable onPress={() => restoreSavedSlices(removed.map((s) => s.id))} hitSlop={6}>
                <Text style={styles.groupToggle}>Restore all</Text>
              </Pressable>
            </View>
            <View style={styles.grid}>
              {removed.map((s) => (
                <Pressable
                  key={s.id}
                  onPress={() => restoreSavedSlices([s.id])}
                  accessibilityRole="button"
                  accessibilityLabel="Restore this piece"
                  style={[styles.cell, styles.cellKept]}>
                  <SliceThumb slice={s} style={{ width: THUMB * s.cs, height: THUMB, borderRadius: Radius.tag }} />
                  <View style={styles.restore}>
                    <Text style={styles.restoreText}>Restore</Text>
                  </View>
                </Pressable>
              ))}
            </View>
            <Text style={styles.note}>Removed pieces can be restored until you leave the editor.</Text>
          </View>
        ) : null}
      </View>
    </DialogCard>
  );
}

const styles = StyleSheet.create({
  body: { gap: Spacing.three },
  lead: { fontSize: FontSize.label, color: Palette.ink3, lineHeight: 18 },
  group: { gap: 6 },
  groupHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  groupName: { flexShrink: 1, fontSize: FontSize.sm, color: Palette.muted, fontWeight: Weight.semibold, textTransform: 'uppercase', letterSpacing: 0.4 },
  groupToggle: { fontSize: FontSize.sm, color: Palette.accent, fontWeight: Weight.semibold },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cell: { position: 'relative', borderRadius: Radius.tag, overflow: 'hidden', borderWidth: 2, borderColor: Palette.danger },
  cellKept: { borderColor: 'transparent', opacity: 0.55 },
  tick: {
    position: 'absolute',
    top: 3,
    right: 3,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Palette.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickOff: { backgroundColor: Palette.scrim30 },
  tickText: { color: Palette.white, fontSize: FontSize.xs, fontWeight: Weight.bold, lineHeight: 14 },
  restore: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingVertical: 2, backgroundColor: Palette.scrim45, alignItems: 'center' },
  restoreText: { color: Palette.white, fontSize: FontSize.xs, fontWeight: Weight.semibold },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.two },
  btn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: Radius.control, backgroundColor: Palette.panel },
  btnDanger: { backgroundColor: Palette.danger },
  btnOff: { opacity: 0.45 },
  btnText: { fontSize: FontSize.label, fontWeight: Weight.semibold, color: Palette.ink2 },
  btnDangerText: { color: Palette.white },
  pressed: { opacity: 0.75 },
  note: { fontSize: FontSize.xs, color: Palette.muted3, lineHeight: 15 },
});
