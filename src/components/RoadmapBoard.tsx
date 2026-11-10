/**
 * THE ROADMAP BOARD (MIC-017 piece 13, the sweep's "votes as a roadmap board"): what you can vote
 * on, what is being built, and what shipped, side by side, so people see their votes turn into
 * features. "Up for votes" is the ballot below it on the page; "Being built" is BUILDING here
 * (kept by hand, plain words, no promises of dates); "Shipped" is the latest of What's New.
 *
 * Behind the 'play-board' dev flag. No database: the statuses live in this file and the changelog.
 */
import { useRouter, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FontSize, Palette, Radius, Weight } from '@/constants/theme';
import { CHANGELOG } from '@/data/changelog';

/** What is under construction right now, in the words a visitor would use. */
export const BUILDING: readonly { head: string; body: string }[] = [
  { head: 'A hand of cards in the editor', body: 'Deal cards that fit the page and drag them into pockets.' },
  { head: 'Pages that name themselves', body: 'A page title and description from the cards on it, until you write your own.' },
  { head: 'Search results as binder pages', body: 'Turn through results nine at a time, the way they will sit in a binder.' },
  { head: 'A bookshelf for your binders', body: 'Your binders as spines on a shelf, if you like that better than the grid.' },
];

function shipped(n: number): { head: string; date: string }[] {
  const out: { head: string; date: string }[] = [];
  for (const batch of CHANGELOG)
    for (const it of batch.items)
      if (it.products.includes('michi') && out.length < n) out.push({ head: it.head, date: batch.date });
  return out;
}

export function RoadmapBoard({ topVotes }: { topVotes: readonly { label: string; votes: number }[] }) {
  const router = useRouter();
  const done = shipped(5);
  const cols: { key: string; title: string; colour: string; items: { head: string; sub: string }[]; more?: { label: string; href: Href } }[] = [
    { key: 'vote', title: 'Up for votes', colour: '#3B82F6', items: topVotes.slice(0, 5).map((v) => ({ head: v.label, sub: `${v.votes} vote${v.votes === 1 ? '' : 's'}` })) },
    { key: 'build', title: 'Being built', colour: '#f08a24', items: BUILDING.map((b) => ({ head: b.head, sub: b.body })) },
    { key: 'shipped', title: 'Shipped', colour: '#3fa34d', items: done.map((d) => ({ head: d.head, sub: d.date })), more: { label: 'All of What’s New ›', href: '/whats-new' as Href } },
  ];
  return (
    <View style={styles.board} testID="roadmap-board">
      {cols.map((c) => (
        <View key={c.key} style={styles.col} testID={`roadmap-${c.key}`}>
          <View style={[styles.colHead, { backgroundColor: c.colour }]}>
            <Text style={styles.colTitle}>{c.title}</Text>
          </View>
          <View style={styles.items}>
            {c.items.map((it) => (
              <View key={it.head} style={[styles.item, { borderLeftColor: c.colour }]}>
                <Text style={styles.itemHead}>{it.head}</Text>
                <Text style={styles.itemSub} numberOfLines={2}>
                  {it.sub}
                </Text>
              </View>
            ))}
            {c.more ? (
              <Pressable onPress={() => router.push(c.more!.href)} accessibilityRole="link">
                <Text style={[styles.more, { color: c.colour }]}>{c.more.label}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  board: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  col: { flexGrow: 1, flexBasis: 240, minWidth: 0, borderRadius: Radius.control, backgroundColor: Palette.panel, overflow: 'hidden', borderWidth: 1, borderColor: Palette.hairline },
  colHead: { paddingHorizontal: 12, paddingVertical: 8 },
  colTitle: { fontSize: FontSize.sm, fontWeight: Weight.bold, color: '#fff', letterSpacing: 0.4, textTransform: 'uppercase' },
  items: { padding: 10, gap: 8 },
  item: { borderLeftWidth: 3, paddingLeft: 8, gap: 2 },
  itemHead: { fontSize: FontSize.sm, fontWeight: Weight.semibold, color: Palette.ink },
  itemSub: { fontSize: 12, color: Palette.muted, lineHeight: 16 },
  more: { fontSize: FontSize.sm, fontWeight: Weight.semibold, marginTop: 2 },
});
