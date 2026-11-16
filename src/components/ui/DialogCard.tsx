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
import { Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CloseButton } from 'tcgscan-ui';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Breakpoints, FontSize, Palette, Radius, Spacing } from '@/constants/theme';
import { sheet } from '@/constants/ui';
import { flag } from '@/lib/flags';

/**
 * MIC-045 M6: one scrim (scrim45), an X instead of "Close", and on a phone a bottom sheet with a
 * grab handle instead of a centred card.
 */
const KIT_OVERLAYS = flag('ui-overlays');

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
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const asSheet = KIT_OVERLAYS && width < Breakpoints.phone;
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
  if (KIT_OVERLAYS) {
    const close = headerRight ?? <CloseButton onPress={onClose} />;
    return (
      <Modal visible={visible} transparent animationType={asSheet ? 'slide' : 'fade'} onRequestClose={onClose}>
        <Pressable style={asSheet ? styles.sheetBackdrop : sheet.dialogBackdrop} onPress={onClose}>
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={[styles.wrap, asSheet ? styles.sheetWrap : { maxWidth }]}>
            <ThemedView
              type="backgroundElement"
              style={[sheet.dialogCard, styles.card, asSheet && [styles.sheetCard, { paddingBottom: 24 + insets.bottom }]]}>
              {asSheet ? <View style={styles.handle} /> : null}
              <View style={styles.header}>
                <ThemedText type="subtitle" style={[styles.title, styles.kitTitle]}>
                  {title}
                </ThemedText>
                {close}
              </View>
              {body}
            </ThemedView>
          </Pressable>
        </Pressable>
      </Modal>
    );
  }

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
  kitTitle: { flex: 1 },
  sheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: Palette.scrim45 },
  sheetWrap: { maxWidth: '100%', maxHeight: '92%' },
  sheetCard: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderTopLeftRadius: Radius.sheet, borderTopRightRadius: Radius.sheet, paddingTop: 8 },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: Palette.scrim30 },
});
