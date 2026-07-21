/**
 * "Choose which binders to keep" — the agency half of over-cap reclaim (see docs/PRO-TRIALS.md).
 * A downgraded user over the Free cap picks which `cap` binders stay live; confirming archives the
 * rest via reclaim_over_cap(keep_ids). Soft-archive, not deletion: archived binders come back if
 * they subscribe. On web we reload after so the archived ones drop out of the grid (the store
 * loads binders on identity change, not on demand).
 */
import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { DialogCard } from '@/components/ui/DialogCard';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { reclaimOverCap } from '@/data/trial';

export function KeepBindersModal({
  visible,
  onClose,
  cap,
  binders,
  onArchived,
}: {
  visible: boolean;
  onClose: () => void;
  /** How many the user may keep (the Free binder cap). */
  cap: number;
  /** The over-cap live binders to choose among (own, non-demo), oldest → newest. */
  binders: { id: string; title: string }[];
  /** Called after a successful archive with how many were archived. */
  onArchived?: (n: number) => void;
}) {
  // Default to keeping the most recent `cap` (the tail of the oldest→newest list) — their likely
  // active work — but let them change it.
  const [keep, setKeep] = useState<Set<string>>(
    () => new Set(binders.slice(-cap).map((b) => b.id)),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) => {
    setKeep((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < cap) next.add(id); // never let them pick more than the cap
      return next;
    });
  };

  const archiveCount = binders.length - keep.size;
  const canConfirm = keep.size > 0 && keep.size <= cap && !busy;

  const confirm = async () => {
    if (!canConfirm) return;
    setBusy(true);
    setError(null);
    try {
      const n = await reclaimOverCap([...keep]);
      onArchived?.(n);
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.location.reload();
      } else {
        onClose();
      }
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <DialogCard visible={visible} onClose={onClose} title="Choose which binders to keep">
      <ThemedText type="small" themeColor="textSecondary" style={styles.sub}>
        Free keeps {cap} binder{cap === 1 ? '' : 's'}. Pick the {cap} to keep — the other{' '}
        {archiveCount === 1 ? 'one' : archiveCount} will be locked (not deleted) and come back if you
        subscribe.
      </ThemedText>

      <View style={styles.list}>
        {binders.map((b) => {
          const on = keep.has(b.id);
          const atCap = keep.size >= cap;
          return (
            <Pressable
              key={b.id}
              onPress={() => toggle(b.id)}
              disabled={!on && atCap}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on, disabled: !on && atCap }}
              style={({ pressed }) => [styles.row, pressed && styles.dim, !on && atCap && styles.rowMuted]}>
              <View style={[styles.box, on && styles.boxOn]}>{on ? <Text style={styles.tick}>✓</Text> : null}</View>
              <ThemedText type="small" numberOfLines={1} style={styles.rowTitle}>
                {b.title || 'Untitled binder'}
              </ThemedText>
              {on ? (
                <ThemedText type="small" themeColor="textSecondary">
                  Keep
                </ThemedText>
              ) : (
                <ThemedText type="small" style={styles.lockLabel}>
                  Lock
                </ThemedText>
              )}
            </Pressable>
          );
        })}
      </View>

      <ThemedText type="small" themeColor="textSecondary" style={styles.count}>
        Keeping {keep.size} of {cap} · locking {archiveCount}
      </ThemedText>

      <Pressable
        onPress={confirm}
        disabled={!canConfirm}
        style={({ pressed }) => [styles.btn, (!canConfirm || pressed) && styles.dim]}>
        {busy ? (
          <ActivityIndicator color={Palette.accentText} />
        ) : (
          <Text style={styles.btnText}>
            Keep these {keep.size} · lock {archiveCount}
          </Text>
        )}
      </Pressable>

      {error ? (
        <ThemedText type="small" style={styles.error}>
          {error}
        </ThemedText>
      ) : null}
    </DialogCard>
  );
}

const styles = StyleSheet.create({
  sub: { lineHeight: 19 },
  list: { gap: Spacing.one },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.control,
    borderWidth: 1,
    borderColor: Palette.hairline,
  },
  rowMuted: { opacity: 0.55 },
  rowTitle: { flex: 1 },
  box: {
    width: 20,
    height: 20,
    borderRadius: Radius.xs,
    borderWidth: 1.5,
    borderColor: Palette.hairlineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: Palette.accent, borderColor: Palette.accent },
  tick: { color: Palette.accentText, fontSize: 12, fontWeight: Weight.bold, lineHeight: 14 },
  lockLabel: { color: Palette.danger },
  count: { textAlign: 'center' },
  btn: {
    backgroundColor: Palette.accent,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  btnText: { color: Palette.accentText, fontSize: FontSize.md, fontWeight: Weight.semibold },
  error: { color: Palette.danger, lineHeight: 18 },
  dim: { opacity: 0.6 },
});
