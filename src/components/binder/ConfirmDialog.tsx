/**
 * A small cross-platform confirmation dialog (RN Alert is unreliable on web). Rendered by the
 * binder editor before destructive actions — deleting a page or a binder.
 */

import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface ConfirmSpec {
  title: string;
  message?: string;
  confirmLabel?: string;
  /** When true, the confirm button reads as destructive (red). */
  destructive?: boolean;
  onConfirm: () => void;
}

export function ConfirmDialog({ spec, onClose }: { spec: ConfirmSpec | null; onClose: () => void }) {
  const theme = useTheme();
  if (!spec) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.cardWrap}>
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="subtitle" style={styles.title}>
              {spec.title}
            </ThemedText>
            {spec.message ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.message}>
                {spec.message}
              </ThemedText>
            ) : null}
            <View style={styles.row}>
              <Pressable
                onPress={onClose}
                style={({ pressed }) => [
                  styles.btn,
                  { borderColor: theme.backgroundSelected },
                  pressed && styles.pressed,
                ]}>
                <ThemedText type="smallBold">Cancel</ThemedText>
              </Pressable>
              <Pressable
                onPress={() => {
                  spec.onConfirm();
                  onClose();
                }}
                style={({ pressed }) => [
                  styles.btn,
                  spec.destructive ? styles.btnDanger : styles.btnPrimary,
                  pressed && styles.pressed,
                ]}>
                <ThemedText type="smallBold" style={styles.btnFilledText}>
                  {spec.confirmLabel ?? 'Confirm'}
                </ThemedText>
              </Pressable>
            </View>
          </ThemedView>
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
    padding: Spacing.four,
  },
  cardWrap: { width: '100%', maxWidth: 360 },
  card: { borderRadius: Radii.page, padding: Spacing.four, gap: Spacing.three },
  title: { fontSize: 20, lineHeight: 26 },
  message: { lineHeight: 20 },
  row: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.two, marginTop: Spacing.one },
  btn: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  btnPrimary: { backgroundColor: '#3B82F6' },
  btnDanger: { backgroundColor: '#DC2626' },
  btnFilledText: { color: '#fff' },
  pressed: { opacity: 0.7 },
});
