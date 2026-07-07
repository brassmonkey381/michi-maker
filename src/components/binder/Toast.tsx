/**
 * A lightweight auto-dismissing toast for the binder editor: brief confirmation of an action,
 * with an optional inline action (e.g. "Undo"). Re-arms its dismiss timer whenever the message
 * changes (keyed by the caller). Positioned by the parent.
 */

import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Palette, Radius } from '@/constants/theme';

export interface ToastSpec {
  /** Bumped on every show so repeated identical messages still re-trigger. */
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function Toast({ spec, onDismiss }: { spec: ToastSpec | null; onDismiss: () => void }) {
  const id = spec?.id;
  useEffect(() => {
    if (id == null) return;
    const handle = setTimeout(onDismiss, 3500);
    return () => clearTimeout(handle);
  }, [id, onDismiss]);

  if (!spec) return null;

  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      <View style={styles.toast}>
        <ThemedText type="small" style={styles.message} numberOfLines={2}>
          {spec.message}
        </ThemedText>
        {spec.actionLabel && spec.onAction ? (
          <Pressable
            onPress={() => {
              spec.onAction?.();
              onDismiss();
            }}
            hitSlop={8}>
            <ThemedText type="smallBold" style={styles.action}>
              {spec.actionLabel}
            </ThemedText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 28,
    alignItems: 'center',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    maxWidth: 420,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: Radius.pill,
    backgroundColor: Palette.toast,
    shadowColor: Palette.black,
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  message: { color: Palette.white, flexShrink: 1 },
  action: { color: Palette.accentSoft },
});
