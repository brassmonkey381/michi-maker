/**
 * WHAT THIS BINDER IS, or what this page is — the description, on its own, when you ask for it.
 *
 * A description used to sit under the binder title as a permanent line of centred grey text. That
 * is a poor deal on a screen whose whole job is showing a binder: it costs every visit vertical
 * space to answer a question most visits are not asking, and it reads as caption furniture rather
 * than as something a person wrote. So it moved behind the title, which was already the obvious
 * thing to tap and already opened the same words in edit mode.
 *
 * A CARD, NOT A FORM. There is nothing to do here, so there is nothing that looks like doing:
 * no fields, no Done, no heading that repeats the word "details". A kicker naming what you tapped,
 * a hairline, and the text set in the binder face at a reading measure. The ✕ is the only control,
 * because a popup with no visible way out is a trap on touch however obvious the backdrop is.
 *
 * NARROWER THAN THE DIALOGS IT SITS AMONG (520 against the tools card's 760). Those hold fields in
 * columns and want the width; a paragraph does not — past about 70 characters a line stops being
 * easy to come back from, and this is the one dialog in the editor that is purely prose.
 */
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { sheet } from '@/constants/ui';

export function AboutPopup({
  /** What was tapped, named: the binder's title, or "Page 3". */
  kicker,
  /** The description itself. The caller decides there is one; this draws it. */
  text,
  onClose,
}: {
  kicker: string;
  text: string;
  onClose: () => void;
}) {
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={sheet.dialogBackdrop}>
        {/* Behind the card rather than around it, so the text stays selectable on web. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <ThemedView type="backgroundElement" style={styles.card}>
          <View style={styles.head}>
            <ThemedText style={styles.kicker} numberOfLines={1}>
              {kicker}
            </ThemedText>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </View>
          <View style={styles.rule} />
          <ThemedText style={styles.body}>{text}</ThemedText>
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    borderRadius: Radius.panel,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.four,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.three },
  // Small and letter-spaced: it labels the text below rather than competing with it.
  kicker: {
    flexShrink: 1,
    fontSize: FontSize.sm,
    lineHeight: 16,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: Palette.muted,
    fontWeight: Weight.semibold,
  },
  close: { fontSize: FontSize.md, lineHeight: 20, color: Palette.muted },
  rule: { height: 1, backgroundColor: Palette.hairlineStrong, marginTop: Spacing.two, marginBottom: Spacing.three },
  // The binder face, at a size and leading meant for a paragraph rather than a caption.
  body: { fontFamily: Fonts?.brand, fontSize: FontSize.md, lineHeight: 26 },
});
