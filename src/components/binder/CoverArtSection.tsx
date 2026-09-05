/**
 * COVER ART — the two ways a picture reaches a cover that are not the upload button: a link, and
 * a piece already cut in the studio and sitting in the tray.
 *
 * A PHOTO SEARCH (Pexels, Pixabay) works like a link the user did not have to find: the picked
 * picture is pulled into the bucket and credited to its photographer (stockAttribution).
 *
 * A LINK is pulled into the user's own bucket before it is placed (importRemoteArtToBucket), so
 * the cover never hotlinks; the provenance is derived from the URL and stamped 'external', which
 * is exactly what the studio does with the same input. The credit is recorded either way; the
 * sharing gate decides what it means.
 *
 * A TRAY PIECE keeps its crop, its flips, its quarter-turn (folded into the free-degree rotation)
 * and its provenance — sliceToDecoration is the one function that knows that mapping. Tapping a
 * tile places it centred; dragging one out of the Artwork tab and dropping it on the cover lands
 * it where it was dropped, through the same ghost the pockets use.
 */
import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { FontSize, Palette, Radius, Weight } from '@/constants/theme';
import { flatChip } from '@/constants/ui';
import { deriveAttribution } from '@/data/artworkLibrary';
import type { CoverImageDecoration } from '@/data/binderTypes';
import { uuidv4 } from '@/data/binderTypes';
import { NEW_DECORATION_W, sliceToDecoration } from '@/data/coverDecorations';
import { windowedImageStyle } from '@/data/imageWindow';
import { useSavedSlices } from '@/data/savedSlices';
import { StockArtSearch } from '@/components/binder/StockArtSearch';
import { importRemoteArtToBucket } from '@/lib/importArt';
import { stockAttribution, type StockHit } from '@/lib/stockArt';

export function CoverArtSection({
  onAdd,
  onToast,
  disabled,
}: {
  onAdd: (d: CoverImageDecoration) => void;
  onToast: (message: string) => void;
  /** True at the twelve-per-surface cap. */
  disabled: boolean;
}) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [stockBusy, setStockBusy] = useState<string | null>(null);
  const slices = useSavedSlices();

  const pickStock = async (hit: StockHit) => {
    if (stockBusy) return;
    setStockBusy(`${hit.provider}:${hit.id}`);
    try {
      const hosted = await importRemoteArtToBucket(hit.url);
      // Sized to the picture's own proportions so it lands undistorted; w and h are both fractions
      // of the surface width in the cover model.
      const ratio = hit.width && hit.height ? hit.height / hit.width : 1;
      onAdd({
        id: uuidv4(),
        kind: 'art',
        imageUrl: hosted,
        x: 0.5,
        y: 0.5,
        w: NEW_DECORATION_W,
        h: NEW_DECORATION_W * ratio,
        aspect: ratio ? 1 / ratio : undefined,
        attribution: stockAttribution(hit),
      });
    } catch {
      onToast('That picture would not download. Try another one.');
    } finally {
      setStockBusy(null);
    }
  };

  const importLink = async () => {
    const u = url.trim();
    if (!/^https?:\/\//i.test(u)) {
      onToast('Paste a full image link, starting with http.');
      return;
    }
    setBusy(true);
    try {
      const hosted = await importRemoteArtToBucket(u);
      const derived = deriveAttribution(u);
      onAdd({
        id: uuidv4(),
        kind: 'art',
        imageUrl: hosted,
        x: 0.5,
        y: 0.5,
        w: NEW_DECORATION_W,
        attribution: { ...derived, sourceUrl: derived.sourceUrl ?? u, origin: 'external' },
      });
      setUrl('');
    } catch {
      onToast('That site would not let us fetch the image. Save it and use Upload instead.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.section} testID="cover-art-section">
      <Text style={styles.label}>From a link</Text>
      <View style={styles.row}>
        <TextInput
          value={url}
          onChangeText={setUrl}
          onSubmitEditing={importLink}
          placeholder="https://…"
          placeholderTextColor={Palette.muted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          editable={!busy && !disabled}
          testID="cover-art-url"
          style={styles.input}
        />
        <Pressable
          onPress={importLink}
          disabled={busy || disabled || !url.trim()}
          accessibilityRole="button"
          testID="cover-art-import"
          style={({ pressed }) => [flatChip.base, styles.go, (busy || disabled || !url.trim()) && styles.dim, pressed && styles.pressed]}>
          {busy ? <ActivityIndicator size="small" color={Palette.accentText} /> : <Text style={[flatChip.text, styles.goText]}>Add</Text>}
        </Pressable>
      </View>

      <Text style={styles.label}>From a photo search</Text>
      <StockArtSearch onPick={(h) => void pickStock(h)} disabled={disabled} busyId={stockBusy} testID="cover-stock" />

      <Text style={styles.label}>From your tray</Text>
      {slices.length === 0 ? (
        <Text style={styles.hint}>Pieces you cut in the studio will appear here. Tap one to put it on the cover.</Text>
      ) : (
        <View style={styles.tiles}>
          {slices.map((slice) => (
            <Pressable
              key={slice.id}
              disabled={disabled}
              onPress={() => onAdd(sliceToDecoration(slice))}
              accessibilityRole="button"
              accessibilityLabel={`Place ${slice.label ?? 'this piece'} on the cover`}
              testID={`cover-tray-${slice.id}`}
              style={({ pressed }) => [styles.tile, pressed && styles.pressed, disabled && styles.dim]}>
              <Image
                source={{ uri: slice.imageUrl }}
                style={windowedImageStyle(TILE, TILE, slice.crop, slice.transform)}
                contentFit="fill"
                cachePolicy="memory-disk"
                transition={0}
              />
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const TILE = 64;

const styles = StyleSheet.create({
  section: { gap: 6 },
  label: { fontSize: FontSize.sm, color: Palette.muted, fontWeight: Weight.medium, textTransform: 'uppercase', letterSpacing: 0.4 },
  hint: { fontSize: FontSize.sm, color: Palette.muted },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  input: { flex: 1, height: 34, paddingHorizontal: 10, borderRadius: Radius.control, backgroundColor: Palette.panel, color: Palette.ink, fontSize: FontSize.label },
  go: { backgroundColor: Palette.accent, minWidth: 48, alignItems: 'center' },
  goText: { color: Palette.accentText, fontWeight: Weight.semibold },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tile: { width: TILE, height: TILE, borderRadius: 6, overflow: 'hidden', backgroundColor: Palette.chromeDeepest },
  pressed: { opacity: 0.6 },
  dim: { opacity: 0.4 },
});
