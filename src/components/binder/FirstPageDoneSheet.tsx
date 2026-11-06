/**
 * THE WALKTHROUGH'S LAST WORD (owner, 2026-11-05: "upon completing the walkthrough ... a
 * celebration modal, with suggestions of what to do next ... There's also more to the site, feel
 * free to explore, and welcome!"). Shown once, the moment a seeded arrival's own card lands on
 * page two. Plain words (owner: "talk like a freaking human"): what each control does, the three
 * ways to search the card browser, and a link to the rest of the site.
 */
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { DialogCard } from '@/components/ui/DialogCard';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { track } from '@/lib/analytics';
import { cardThumbUrl } from '@/lib/catalogConfig';

/** What to try next, in plain words. The two that name a control say where it is on this screen. */
function nextMoves(narrow: boolean): { title: string; body: string }[] {
  return [
    { title: 'Fill a page from one card', body: 'Tap any card, then Fill page. The empty pockets get cards that match it.' },
    { title: 'Search card art by theme', body: 'In the card browser, type theme: and a word, like theme:rain. The Theme button runs an example.' },
    { title: 'Search by color or by look', body: 'Color Search finds cards in the colors you pick. Similar, on a card, finds cards that look like it.' },
    { title: 'Add your own picture', body: narrow ? 'Tap Art above the page. Upload a picture and crop it to a pocket.' : 'Open Art on the left. Upload a picture and crop it to a pocket.' },
    { title: narrow ? 'Swipe to turn pages' : 'Use the arrow keys to turn pages', body: 'When a page is full, a new one is added for you.' },
  ];
}

export function FirstPageDoneSheet({
  visible,
  cardIds,
  guest,
  ownCard = true,
  onAccount,
  onClose,
}: {
  visible: boolean;
  /** The binder's cards, a few of them, as the picture of what was built. */
  cardIds: readonly string[];
  /** A guest gets the account ask as the primary button; an account holder just keeps building. */
  guest: boolean;
  /** False for the wizard's three-card binder: the page was filled, no card of their own landed. */
  ownCard?: boolean;
  onAccount: () => void;
  onClose: () => void;
}) {
  const narrow = useWindowDimensions().width < 500;
  const router = useRouter();
  useEffect(() => {
    if (visible) track('walkthrough.celebration', { walkthrough: 'seeded', action: 'shown' });
  }, [visible]);
  if (!visible) return null;
  const NEXT = nextMoves(narrow);
  return (
    <DialogCard title="You built a page" onClose={onClose} maxWidth={520}>
      <View style={styles.body} testID="first-page-done">
        {cardIds.length ? (
          <View style={styles.strip}>
            {cardIds.map((id, i) => (
              <Image key={`${id}-${i}`} source={{ uri: cardThumbUrl(id, 'full') }} style={styles.thumb} contentFit="cover" transition={150} />
            ))}
          </View>
        ) : null}
        <Text style={styles.lead}>
          {ownCard
            ? 'You started with three cards, filled the page, and added one yourself. That is how every page here gets made. Things to try next:'
            : 'You picked three cards and filled the page around them. That is how every page here gets made. Things to try next:'}
        </Text>
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
        <Text style={styles.welcome}>
          There is more on the site: public binders to browse, every card, and the Michi Method.{' '}
          <Text
            style={styles.link}
            accessibilityRole="link"
            onPress={() => {
              track('walkthrough.celebration', { walkthrough: 'seeded', action: 'home' });
              onClose();
              router.push('/');
            }}>
            Go to the home page
          </Text>
          . Welcome.
        </Text>
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
              <Text style={styles.primaryText}>Create a free account to keep this binder</Text>
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
  link: { color: Palette.accent, fontWeight: Weight.bold },
  actions: { gap: Spacing.two, marginTop: 4 },
  primary: { paddingVertical: 11, paddingHorizontal: 18, borderRadius: Radius.pill, backgroundColor: Palette.accent, alignItems: 'center' },
  primaryText: { fontSize: FontSize.body, fontWeight: Weight.bold, color: Palette.accentText },
  secondary: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: Radius.pill, borderWidth: 1, borderColor: Palette.accent, alignItems: 'center' },
  secondaryText: { fontSize: FontSize.body, fontWeight: Weight.semibold, color: Palette.accent },
  pressed: { opacity: 0.8 },
});
