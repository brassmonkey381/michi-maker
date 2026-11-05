/**
 * THE WALKTHROUGH'S LAST WORD (owner, 2026-11-05: "upon completing the walkthrough ... a
 * celebration modal, with suggestions of what to do next ... There's also more to the site, feel
 * free to explore, and welcome!"). Shown once, the moment a seeded arrival's own card lands on
 * page two. Five next moves, each a real control the page has, and the account ask for a guest.
 */
import { Image } from 'expo-image';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { DialogCard } from '@/components/ui/DialogCard';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { track } from '@/lib/analytics';
import { cardThumbUrl } from '@/lib/catalogConfig';

/** The next moves, one line each (owner, 2026-11-05: "less copy"); the two that name a control say where it is. */
function nextMoves(narrow: boolean): { title: string; body: string }[] {
  return [
    { title: 'Tap a card, then Fill page', body: 'The rest is built around it.' },
    { title: 'Similar and Colors', body: 'On that same bar.' },
    { title: 'Search the artwork', body: 'Type theme:rain in the card browser.' },
    { title: 'Add a picture of your own', body: narrow ? 'Art, above the page.' : 'Art, on the left.' },
    { title: narrow ? 'Swipe to turn pages' : 'Arrow keys turn pages', body: 'A full page grows a new one.' },
  ];
}

export function FirstPageDoneSheet({
  visible,
  cardIds,
  guest,
  onAccount,
  onClose,
}: {
  visible: boolean;
  /** The binder's cards, a few of them, as the picture of what was built. */
  cardIds: readonly string[];
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
        {cardIds.length ? (
          <View style={styles.strip}>
            {cardIds.map((id, i) => (
              <Image key={`${id}-${i}`} source={{ uri: cardThumbUrl(id, 'full') }} style={styles.thumb} contentFit="cover" transition={150} />
            ))}
          </View>
        ) : null}
        <Text style={styles.lead}>Three cards you were given, a fill, and one you chose. Next:</Text>
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
        <Text style={styles.welcome}>There is more to explore. Welcome.</Text>
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
  strip: { flexDirection: 'row', gap: 6, justifyContent: 'center' },
  thumb: { flex: 1, maxWidth: 72, aspectRatio: 0.716, borderRadius: 4, backgroundColor: Palette.panel },
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
