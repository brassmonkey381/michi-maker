/**
 * A LIVE RESULT STRIP for the guides: a query, drawn as the search box shows it, and the real
 * cards it finds right now, with a Try it that opens Browse on the same query.
 *
 * Live rather than a still, on purpose: the artwork search is served by the data project and
 * metered by plan, so the strip shows the reader exactly what THEIR account gets. A free reader
 * sees the top few and the true "+N more", a paid reader sees them all; the caption says which.
 * It never lists what the artwork was described with, only what the search found.
 */
import { useRouter, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { parseQuery, searchCards, sendBrowseCommand, type CatalogCard } from 'tcgscan-browse';

import { ThemedText } from '@/components/themed-text';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { cardThumbUrl } from '@/lib/catalogConfig';

const THUMB_W = 84;
const THUMB_H = Math.round((THUMB_W * 88) / 63);

interface Page {
  cards: CatalogCard[];
  total: number;
  clamped: boolean;
}

export function ResultStrip({
  query,
  limit = 9,
  note,
  compact = false,
  width = 84,
}: {
  query: string;
  /** How many cards to show at most (the server may hand back fewer on a metered plan). */
  limit?: number;
  /** One line under the cards, after the count. */
  note?: string;
  /** The hub-card hook: three thumbnails, no chrome, each `width` wide (card-sized). */
  compact?: boolean;
  width?: number;
}) {
  const router = useRouter();
  const [page, setPage] = useState<Page | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    // Both settings happen in the promise's callbacks, never in the effect body: a synchronous
    // setState there cascades renders, and clearing first would blink the strip empty on a
    // re-run for no gain, since each strip's query never changes after it mounts.
    searchCards(parseQuery(query), { limit }).then(
      (p) => {
        if (!live) return;
        if (p.cards.length === 0) setFailed(true);
        else {
          setPage({ cards: p.cards.slice(0, limit), total: p.total, clamped: p.clamped });
          setFailed(false);
        }
      },
      () => { if (live) setFailed(true); },
    );
    return () => { live = false; };
  }, [query, limit]);

  const tryIt = () => {
    sendBrowseCommand({ type: 'search', query });
    router.push('/browse' as Href);
  };

  if (compact) {
    // Three cards at the hook's card size, side by side: the guide's subject is the pictures,
    // so they get the room a single card hook would take, three times over.
    const size = { width, height: Math.round((width * 88) / 63) };
    const shown = (page?.cards ?? []).slice(0, 3);
    return (
      <View style={styles.compactRow}>
        {shown.map((c) => (
          <Image key={c.id} source={{ uri: cardThumbUrl(c.id, 245) }} style={[styles.compactThumb, size]} contentFit="cover" transition={150} accessibilityLabel="" />
        ))}
        {Array.from({ length: 3 - shown.length }, (_, i) => (
          <View key={`empty-${i}`} style={[styles.compactThumb, styles.thumbEmpty, size]} />
        ))}
      </View>
    );
  }

  const hidden = page ? Math.max(0, page.total - page.cards.length) : 0;
  return (
    <View style={styles.wrap}>
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Text style={styles.glyph}>⌕</Text>
          <Text style={styles.query}>{query}</Text>
        </View>
        <Pressable onPress={tryIt} accessibilityRole="button" style={({ pressed }) => [styles.tryIt, pressed && styles.pressed]}>
          <Text style={styles.tryItText}>Try it</Text>
        </Pressable>
      </View>
      {page ? (
        <View style={styles.cards}>
          {page.cards.map((c) => (
            <Image key={c.id} source={{ uri: cardThumbUrl(c.id, 245) }} style={styles.thumb} contentFit="cover" transition={150} accessibilityLabel={c.name} />
          ))}
        </View>
      ) : failed ? (
        <ThemedText type="small" themeColor="textSecondary">
          The search is taking a moment. Press Try it to run it in Browse.
        </ThemedText>
      ) : (
        <View style={styles.loading}>
          <ActivityIndicator />
        </View>
      )}
      {page ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.caption}>
          {page.clamped
            ? `Top ${page.cards.length} of ${page.total} matches on your plan. ${hidden} more with PRO or VIP.`
            : hidden > 0
              ? `${page.cards.length} of ${page.total} matches.`
              : `${page.total} match${page.total === 1 ? '' : 'es'}.`}
          {note ? ` ${note}` : ''}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
    backgroundColor: Palette.panel,
    flexShrink: 1,
  },
  glyph: { color: Palette.ink2, fontSize: FontSize.control },
  query: { fontFamily: 'monospace', fontSize: FontSize.label, color: Palette.ink, flexShrink: 1 },
  tryIt: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.pill,
    backgroundColor: Palette.accent,
  },
  tryItText: { color: Palette.accentText, fontWeight: Weight.bold, fontSize: FontSize.label },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  thumb: { width: THUMB_W, height: THUMB_H, borderRadius: Radius.sm, backgroundColor: Palette.panelAlt },
  thumbEmpty: { backgroundColor: Palette.panelAlt },
  loading: { height: THUMB_H, justifyContent: 'center' },
  caption: { lineHeight: 18 },
  pressed: { opacity: 0.7 },
  compactRow: { flexDirection: 'row', gap: Spacing.two },
  compactThumb: { borderRadius: Radius.sm, backgroundColor: Palette.panelAlt },
});
