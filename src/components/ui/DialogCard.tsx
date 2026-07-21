/**
 * The ONE centred-dialog scaffold: a card over a scrim with a pinned header and a
 * SCROLLABLE body. Adopt this for every `Modal`-based dialog instead of re-declaring the
 * backdrop → wrap → card → header boilerplate (Share / Print / Likers / AutoFill / Report …).
 *
 * Why it exists: the card is capped to the (padded) viewport height and the body scrolls,
 * so a tall dialog can never clip its own bottom off a short (mobile) screen — the mobile
 * print-modal bug. On a tall screen the cap is inert (content shorter than the viewport just
 * sizes to content), so adopting this is visually identical until something would overflow.
 *
 * The header (title + Close) stays PINNED; only the body scrolls. Pass `scroll={false}` for
 * the rare dialog that manages its own scrolling inside `children`.
 */
import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontSize, Spacing } from '@/constants/theme';
import { sheet } from '@/constants/ui';

export function DialogCard({
  title,
  onClose,
  children,
  visible = true,
  maxWidth = 440,
  headerRight,
  scroll = true,
}: {
  /** Left-aligned dialog title in the pinned header. */
  title: ReactNode;
  onClose: () => void;
  /** The dialog body — rendered inside the scrollable region (unless `scroll={false}`). */
  children: ReactNode;
  /** Controls the Modal; defaults to always-visible for parents that mount conditionally. */
  visible?: boolean;
  /** Card max width (px). Defaults to 440 — the print/share sheet width. */
  maxWidth?: number;
  /** Replaces the default "Close" text button on the right of the header. */
  headerRight?: ReactNode;
  /** Body scrolls by default; set false when `children` scrolls itself. */
  scroll?: boolean;
}) {
  const body = scroll ? (
    <ScrollView
      style={styles.body}
      contentContainerStyle={styles.bodyContent}
      showsVerticalScrollIndicator>
      {children}
    </ScrollView>
  ) : (
    children
  );
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={sheet.dialogBackdrop} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={[styles.wrap, { maxWidth }]}>
          <ThemedView type="backgroundElement" style={[sheet.dialogCard, styles.card]}>
            <View style={styles.header}>
              <ThemedText type="subtitle" style={styles.title}>
                {title}
              </ThemedText>
              {headerRight ?? (
                <Pressable onPress={onClose} hitSlop={8}>
                  <ThemedText type="link" themeColor="textSecondary">
                    Close
                  </ThemedText>
                </Pressable>
              )}
            </View>
            {body}
          </ThemedView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // maxHeight caps the card to the (padded) viewport; flexShrink lets it shrink to that cap and
  // the body ScrollView takes the remainder — so a tall dialog scrolls instead of clipping.
  wrap: { width: '100%', maxHeight: '100%' },
  card: { flexShrink: 1, overflow: 'hidden' },
  body: { flexShrink: 1 },
  // The card's own `gap` doesn't reach inside the ScrollView, so the body sets its own.
  bodyContent: { gap: Spacing.three, paddingBottom: Spacing.one },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: FontSize.h2, lineHeight: 26 },
});
