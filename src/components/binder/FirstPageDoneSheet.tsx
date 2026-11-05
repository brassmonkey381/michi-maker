/**
 * THE WALKTHROUGH'S LAST WORD (owner, 2026-11-05: "upon completing the walkthrough ... a
 * celebration modal, with suggestions of what to do next ... There's also more to the site, feel
 * free to explore, and welcome!"). Shown once, the moment a seeded arrival's own card lands on
 * page two. Five next moves, each a real control the page has, and the account ask for a guest.
 */
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { DialogCard } from '@/components/ui/DialogCard';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { track } from '@/lib/analytics';

/** The five next moves; the two that name a control say where it is on this screen. */
function nextMoves(narrow: boolean): { title: string; body: string }[] {
  return [
    { title: 'Tap a card, then Fill page', body: 'The rest of the page is built around the card you picked.' },
    { title: 'Similar and Colors, on that same bar', body: 'Cards that look like it, or share its palette.' },
    { title: 'Search the artwork', body: 'In the card browser, type theme: and a word. theme:rain finds cards drawn in the rain.' },
    { title: 'Add a picture of your own', body: narrow ? 'Art, in the row above the page. Upload it and cut it to fit a pocket.' : 'Art, on the left. Upload it and cut it to fit a pocket.' },
    narrow
      ? { title: 'Swipe to turn pages', body: 'A full page grows a new one by itself.' }
      : { title: 'Turn pages with the arrow keys', body: 'A full page grows a new one by itself.' },
  ];
}

export function FirstPageDoneSheet({
  visible,
  guest,
  onAccount,
  onClose,
}: {
  visible: boolean;
  /** A guest gets the account ask as the primary button; an account holder just keeps building. */
  guest: boolean;
  onAccount: () => void;
  onClose: () => void;
}) {
  const narrow = useWindowDimensions().width < 500;
  useEffect(() => {
    if (visible) track('walkthrough.celebration', { walkthrough: 'seeded', action: 'shown' });
  }, [visible]);
  if (!visible) return null;
  const NEXT = nextMoves(narrow);
  return (
    <DialogCard title="Your first page is built" onClose={onClose} maxWidth={520}>
      <View style={styles.body} testID="first-page-done">
        <Text style={styles.lead}>Three cards you were given, a fill, and one you chose. That is how every page here starts. A few things to try next:</Text>
        <View style={styles.list}>
          {NEXT.map((n, i) => (
            <View key={n.title} style={styles.row}>
              <Text style={styles.num}>{i + 1}</Text>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{n.title}</Text>
                <Text style={styles.rowBody}>{n.body}</Text>
              </View>
            </View>
          ))}
        </View>
        <Text style={styles.welcome}>There is more to the site than this page. Explore, and welcome.</Text>
        <View style={styles.actions}>
          {guest ? (
            <Pressable
              onPress={() => {
                track('walkthrough.celebration', { walkthrough: 'seeded', action: 'account' });
                onAccount();
              }}
              accessibilityRole="button"
              testID="first-page-done-account"
              style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
              <Text style={styles.primaryText}>Create a free account to keep it</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => {
              track('walkthrough.celebration', { walkthrough: 'seeded', action: 'keep' });
              onClose();
            }}
            accessibilityRole="button"
            testID="first-page-done-keep"
            style={({ pressed }) => [guest ? styles.secondary : styles.primary, pressed && styles.pressed]}>
            <Text style={guest ? styles.secondaryText : styles.primaryText}>Keep building</Text>
          </Pressable>
        </View>
      </View>
    </DialogCard>
  );
}

const styles = StyleSheet.create({
  body: { gap: Spacing.three },
  lead: { fontSize: FontSize.body, lineHeight: 21, color: Palette.ink2 },
  list: { gap: Spacing.two },
  row: { flexDirection: 'row', gap: Spacing.three, alignItems: 'flex-start' },
  num: { width: 22, height: 22, borderRadius: 11, textAlign: 'center', lineHeight: 22, fontSize: FontSize.xs, fontWeight: Weight.bold, color: Palette.accentText, backgroundColor: Palette.accent, overflow: 'hidden' },
  rowText: { flex: 1, gap: 1 },
  rowTitle: { fontSize: FontSize.label, fontWeight: Weight.bold, color: Palette.ink },
  rowBody: { fontSize: FontSize.label, lineHeight: 18, color: Palette.ink3 },
  welcome: { fontSize: FontSize.label, lineHeight: 18, color: Palette.ink2, marginTop: 2 },
  actions: { gap: Spacing.two, marginTop: 4 },
  primary: { paddingVertical: 11, paddingHorizontal: 18, borderRadius: Radius.pill, backgroundColor: Palette.accent, alignItems: 'center' },
  primaryText: { fontSize: FontSize.body, fontWeight: Weight.bold, color: Palette.accentText },
  secondary: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: Radius.pill, borderWidth: 1, borderColor: Palette.accent, alignItems: 'center' },
  secondaryText: { fontSize: FontSize.body, fontWeight: Weight.semibold, color: Palette.accent },
  pressed: { opacity: 0.8 },
});
