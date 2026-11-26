/**
 * MIC-041: a collector's Want list and Trade list on their profile page. Renders nothing unless
 * they turned on "Show my lists on my profile" (public_collection_lists returns null otherwise).
 * Card names come from the catalog; each list opens in place with "Show all".
 */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { FontSize, Palette, Spacing, Weight } from '@/constants/theme';
import { resolveCardWith } from '@/data/cardResolver';
import { fetchPublicLists, type PublicLists } from '@/data/listsRepo';
import { useCatalog } from '@/hooks/use-catalog';

const FIRST = 12;

export function PublicListsSection({ userId }: { userId: string }) {
  const [lists, setLists] = useState<{ userId: string; lists: PublicLists | null } | null>(null);
  const { catalog } = useCatalog(true);

  useEffect(() => {
    let live = true;
    fetchPublicLists(userId)
      .then((l) => {
        if (live) setLists({ userId, lists: l });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [userId]);

  const l = lists?.userId === userId ? lists.lists : null;
  if (!l || (!l.wants.length && !l.trades.length)) return null;
  const nameOf = (id: string) => {
    const c = resolveCardWith(catalog, id);
    return c ? `${c.name}${c.setName ? `, ${c.setName}` : ''}` : id;
  };
  return (
    <View style={styles.wrap} testID="profile-lists">
      <ListBlock
        title={`♥ Want (${l.wants.length})`}
        tint={styles.want}
        lines={l.wants.map((w) => `${nameOf(w.card_id)}${w.quantity > 1 ? ` x${w.quantity}` : ''}`)}
      />
      <ListBlock
        title={`⇄ Trade (${l.trades.length})`}
        tint={styles.trade}
        lines={l.trades.map((t) => `${nameOf(t.card_id)} (${t.variant})${t.quantity > 1 ? ` x${t.quantity}` : ''}`)}
      />
    </View>
  );
}

function ListBlock({ title, lines, tint }: { title: string; lines: string[]; tint: object }) {
  const [all, setAll] = useState(false);
  if (!lines.length) return null;
  const shown = all ? lines : lines.slice(0, FIRST);
  return (
    <View style={styles.block}>
      <Text style={[styles.title, tint]}>{title}</Text>
      {shown.map((line, i) => (
        <ThemedText key={`${i}-${line}`} type="small">
          {line}
        </ThemedText>
      ))}
      {lines.length > FIRST ? (
        <Pressable onPress={() => setAll(!all)} accessibilityRole="button" style={styles.more}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            {all ? 'Show fewer' : `Show all ${lines.length}`}
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.four, marginTop: Spacing.three },
  block: { flexGrow: 1, flexBasis: 280, minWidth: 0, gap: 4 },
  title: { fontSize: FontSize.label, fontWeight: Weight.bold, color: Palette.ink, marginBottom: 4 },
  want: { color: '#2f7fc1' },
  trade: { color: '#b07400' },
  more: { minHeight: 44, justifyContent: 'center' },
});
