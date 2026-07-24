/**
 * A small cross-platform confirmation dialog (RN Alert is unreliable on web). Rendered by the
 * binder editor before destructive actions — deleting a page or a binder.
 */

import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontSize, Palette, Radii, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface ConfirmSpec {
  title: string;
  message?: string;
  confirmLabel?: string;
  /** When true, the confirm button reads as destructive (red). */
  destructive?: boolean;
  /** When set, the user must type this exact text (trimmed, case-insensitive) to enable the
   *  confirm button — the "type the name to delete" gate for the most destructive actions. */
  requireText?: string;
  onConfirm: () => void;
}

export function ConfirmDialog({ spec, onClose }: { spec: ConfirmSpec | null; onClose: () => void }) {
  const theme = useTheme();
  const [text, setText] = useState('');
  // Reset the typed confirmation whenever a dialog opens or closes (spec identity changes).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setText('');
  }, [spec]);
  if (!spec) return null;

  const need = spec.requireText?.trim().toLowerCase() ?? '';
  const canConfirm = !need || text.trim().toLowerCase() === need;
  const close = () => {
    setText('');
    onClose();
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
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
            {spec.requireText ? (
              <>
                <ThemedText type="small" themeColor="textSecondary" style={styles.gateLabel}>
                  Type <ThemedText type="smallBold">{spec.requireText}</ThemedText> to confirm.
                </ThemedText>
                <TextInput
                  value={text}
                  onChangeText={setText}
                  placeholder={spec.requireText}
                  placeholderTextColor={theme.textSecondary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoFocus
                  style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
                />
              </>
            ) : null}
            <View style={styles.row}>
              <Pressable
                onPress={close}
                style={({ pressed }) => [
                  styles.btn,
                  { borderColor: theme.backgroundSelected },
                  pressed && styles.pressed,
                ]}>
                <ThemedText type="smallBold">Cancel</ThemedText>
              </Pressable>
              <Pressable
                disabled={!canConfirm}
                onPress={() => {
                  spec.onConfirm();
                  close();
                }}
                style={({ pressed }) => [
                  styles.btn,
                  spec.destructive ? styles.btnDanger : styles.btnPrimary,
                  !canConfirm && styles.btnDisabled,
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
    backgroundColor: Palette.scrim45,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  cardWrap: { width: '100%', maxWidth: 360 },
  card: { borderRadius: Radii.page, padding: Spacing.four, gap: Spacing.three },
  title: { fontSize: FontSize.h2, lineHeight: 26 },
  message: { lineHeight: 20 },
  row: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.two, marginTop: Spacing.one },
  btn: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  btnPrimary: { backgroundColor: Palette.accent },
  btnDanger: { backgroundColor: Palette.danger },
  btnDisabled: { opacity: 0.4 },
  btnFilledText: { color: Palette.accentText },
  pressed: { opacity: 0.7 },
  gateLabel: { lineHeight: 20 },
  input: {
    borderWidth: 1,
    borderRadius: Radius.control,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: FontSize.body,
  },
});
