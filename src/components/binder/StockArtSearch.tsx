/**
 * STOCK ART SEARCH — Pexels photographs and Pixabay photographs or illustrations, inside the Art
 * dock (cover art) and the Slice Studio. Type a phrase, pick a picture; the caller re-hosts it into
 * the user's bucket and stamps the credit (`stockAttribution`), exactly as the story builder does.
 *
 * Search runs through the `stock-art` edge function so the provider keys never reach the client.
 * Only the picture the user PICKS is downloaded; browsing shows the providers' own thumbnails.
 *
 * This returns to the dock a source that was once removed for looking too photographic beside the
 * cards. It comes back as an opt-in search with an Illustrations mode (Pixabay), and every result
 * shows who made it.
 */
import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { FontSize, Palette, Radius, Weight } from '@/constants/theme';
import { flatChip } from '@/constants/ui';
import { searchStockArt, type StockHit, type StockKind, type StockOrientation } from '@/lib/stockArt';

export function StockArtSearch({
  onPick,
  orientation,
  disabled = false,
  busyId = null,
  testID = 'stock-art',
}: {
  /** The user chose a picture. The caller imports it and reports progress via `busyId`. */
  onPick: (hit: StockHit) => void;
  /** Bias the search to a shape (a wide banner, a tall rail). Omit for any. */
  orientation?: StockOrientation;
  disabled?: boolean;
  /** `${provider}:${id}` of the hit being imported, to spin its tile. */
  busyId?: string | null;
  testID?: string;
}) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<StockKind>('any');
  const [hits, setHits] = useState<StockHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const run = async (k: StockKind = kind) => {
    const q = query.trim();
    if (!q || searching) return;
    setSearching(true);
    setNote(null);
    try {
      const res = await searchStockArt(q, { orientation, kind: k, per: 18 });
      setHits(res.hits);
      if (res.hits.length === 0) {
        const off = Object.entries(res.providers).filter(([, s]) => s === 'no-key' || s === 'error');
        setNote(off.length ? 'Nothing came back. The search service may be unavailable right now.' : 'Nothing for that phrase. Try fewer, plainer words.');
      }
    } catch (e) {
      setHits([]);
      setNote(e instanceof Error ? e.message : 'The search failed.');
    } finally {
      setSearching(false);
    }
  };

  const pickKind = (k: StockKind) => {
    setKind(k);
    if (hits) void run(k);
  };

  return (
    <View style={styles.wrap} testID={`${testID}-section`}>
      <View style={styles.row}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => void run()}
          placeholder="Search photos: snowy forest, sunset over water…"
          placeholderTextColor={Palette.muted}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          editable={!disabled}
          testID={`${testID}-query`}
          style={styles.input}
        />
        <Pressable
          onPress={() => void run()}
          disabled={disabled || searching || !query.trim()}
          accessibilityRole="button"
          testID={`${testID}-go`}
          style={({ pressed }) => [flatChip.base, styles.go, (disabled || searching || !query.trim()) && styles.dim, pressed && styles.pressed]}>
          {searching ? <ActivityIndicator size="small" color={Palette.accentText} /> : <Text style={[flatChip.text, styles.goText]}>Search</Text>}
        </Pressable>
      </View>
      <View style={styles.kinds}>
        {(
          [
            ['any', 'Any'],
            ['photo', 'Photos'],
            ['illustration', 'Illustrations'],
          ] as const
        ).map(([k, label]) => (
          <Pressable
            key={k}
            onPress={() => pickKind(k)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityState={{ selected: kind === k }}
            style={({ pressed }) => [styles.kind, kind === k && styles.kindOn, pressed && styles.pressed]}>
            <Text style={[styles.kindText, kind === k && styles.kindTextOn]}>{label}</Text>
          </Pressable>
        ))}
        <Text style={styles.powered}>Pexels · Pixabay</Text>
      </View>

      {note ? <Text style={styles.hint}>{note}</Text> : null}
      {hits && hits.length > 0 ? (
        <View style={styles.tiles}>
          {hits.map((h) => {
            const key = `${h.provider}:${h.id}`;
            const busy = busyId === key;
            return (
              <Pressable
                key={key}
                onPress={() => onPick(h)}
                disabled={disabled || !!busyId}
                accessibilityRole="button"
                accessibilityLabel={`Use this picture by ${h.author} from ${h.provider === 'pexels' ? 'Pexels' : 'Pixabay'}`}
                testID={`${testID}-hit-${h.provider}-${h.id}`}
                style={({ pressed }) => [styles.tile, pressed && styles.pressed, disabled && styles.dim]}>
                <Image source={{ uri: h.thumb }} style={styles.thumb} contentFit="cover" cachePolicy="memory-disk" transition={0} />
                {busy ? (
                  <View style={styles.busy}>
                    <ActivityIndicator size="small" color={Palette.white} />
                  </View>
                ) : null}
                <Text numberOfLines={1} style={styles.credit}>
                  {h.author}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const TILE = 84;

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  input: { flex: 1, height: 34, paddingHorizontal: 10, borderRadius: Radius.control, backgroundColor: Palette.panel, color: Palette.ink, fontSize: FontSize.label },
  go: { backgroundColor: Palette.accent, minWidth: 64, alignItems: 'center' },
  goText: { color: Palette.accentText, fontWeight: Weight.semibold },
  kinds: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  kind: { paddingVertical: 3, paddingHorizontal: 10, borderRadius: Radius.pill, borderWidth: 1, borderColor: Palette.hairlineStrong },
  kindOn: { backgroundColor: Palette.accent, borderColor: Palette.accent },
  kindText: { fontSize: FontSize.sm, color: Palette.ink2, fontWeight: Weight.semibold },
  kindTextOn: { color: Palette.accentText },
  powered: { marginLeft: 'auto', fontSize: FontSize.xs, color: Palette.muted },
  hint: { fontSize: FontSize.sm, color: Palette.muted },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tile: { width: TILE, gap: 2 },
  thumb: { width: TILE, height: TILE, borderRadius: 6, backgroundColor: Palette.chromeDeepest },
  busy: { position: 'absolute', top: 0, left: 0, width: TILE, height: TILE, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: Palette.scrim45 },
  credit: { fontSize: FontSize.xs, color: Palette.muted },
  pressed: { opacity: 0.6 },
  dim: { opacity: 0.4 },
});
