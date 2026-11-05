/**
 * ADD ART, THE SHORT WAY (owner, 2026-10-22: "pull in the art as a one by one and allow dragging
 * and resizing and edits in the Binder Page itself ... advanced/studio button tucked behind a
 * button that says advanced editing").
 *
 * Two ways in, Upload and Free photos (Pexels and Pixabay), plus a paste-a-URL row. Card art
 * (the catalog's own scan as a picture) and Find art (a directory of fan-art and official-art
 * sites with per-page searches and how-to-copy hints) were both removed on 2026-11-05: the user
 * brings the art, the app never supplies a picture to slice and print and never points at where
 * to copy one (docs/roadmap/ART-RIGHTS.md). Choosing a picture is the
 * whole job: the host seats it on the page as one pocket and the sheet closes. Dragging and the
 * corner handle do the rest on the page. The Slice Studio, with its zoom, rotate, flip and cut,
 * is one link away as Advanced editing, with the chosen picture already loaded when there is one.
 *
 * The rights rules are the studio's, unchanged: an upload is 'upload', a remote URL is fetched into the user's own bucket and filed 'external' (private),
 * and a stock photo carries its provider credit.
 */
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ArtistShelf } from '@/components/binder/ArtistShelf';
import { ArtUploadButton } from '@/components/binder/ArtUploadButton';
import { StockArtSearch } from '@/components/binder/StockArtSearch';
import { DialogCard } from '@/components/ui/DialogCard';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { deriveAttribution, type ArtAttribution } from '@/data/artworkLibrary';
import { importRemoteArtToBucket } from '@/lib/importArt';
import { stockAttribution, type StockHit } from '@/lib/stockArt';
import { useArtLead } from '@/hooks/use-art-lead';

export function AddArtSheet({
  cardIds,
  pageTitle,
  onPick,
  onAdvanced,
  onClose,
}: {
  /** The page's cards, for what the free-photo search starts on. */
  cardIds: readonly string[];
  pageTitle?: string | null;
  /** A picture was chosen: seat it on the page. The host closes the sheet. */
  onPick: (imageUrl: string, attribution: ArtAttribution) => void;
  /** Open the Slice Studio instead, with this picture when one was chosen. */
  onAdvanced: () => void;
  onClose: () => void;
}) {
  // Open on arrival (owner, 2026-10-27): an empty panel should be one tap from pictures of what
  // the page shows, with the subject already typed.
  const [findOpen, setFindOpen] = useState(true);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lead = useArtLead(cardIds, pageTitle, findOpen);

  /** A remote picture: a copy goes to the user's bucket, the original stays as the credit. */
  const bringIn = async (remote: string, attribution: ArtAttribution, key: string) => {
    if (busy) return;
    setBusy(key);
    setError(null);
    try {
      const hosted = await importRemoteArtToBucket(remote);
      onPick(hosted, attribution);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That picture would not download. Try another one, or Upload it.');
    } finally {
      setBusy(null);
    }
  };

  const loadUrl = () => {
    const u = url.trim();
    if (!/^https?:\/\/\S+$/i.test(u)) {
      setError('Paste a full image address, starting with https://');
      return;
    }
    const derived = deriveAttribution(u);
    void bringIn(u, { ...derived, sourceUrl: derived.sourceUrl ?? u, origin: 'external' }, 'url');
  };

  return (
    <DialogCard title="Add art" onClose={onClose} maxWidth={560}>
      <View style={styles.body}>
        <Text style={styles.lead}>Pick a picture and it lands on this page. Drag its corner there to make it bigger.</Text>

        <View style={styles.tiles}>
          <View style={styles.tile}>
            <ArtUploadButton onUploaded={(hosted) => onPick(hosted, { sourceName: 'your upload', origin: 'upload' })} onError={setError} />
            <Text style={styles.tileSub}>A picture of your own</Text>
          </View>
          <Pressable
            onPress={() => setFindOpen((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: findOpen }}
            testID="add-art-find"
            style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
            <Text style={styles.tileTitle}>{findOpen ? 'Free photos ▴' : 'Free photos'}</Text>
            <Text style={styles.tileSub}>Pexels and Pixabay</Text>
          </Pressable>
        </View>

        {findOpen ? (
          <View style={styles.find}>
            <Text style={styles.findTitle}>{lead.label ? `Photos for ${lead.label}` : 'Free photos'}</Text>
            <StockArtSearch
              initialQuery={lead.query}
              busyId={busy}
              onPick={(hit: StockHit) => void bringIn(hit.url, stockAttribution(hit), `${hit.provider}:${hit.id}`)}
              testID="add-art-stock"
            />
          </View>
        ) : null}

        {/* THE ARTISTS SHELF (owner, 2026-11-03): real artists' pieces, placed straight from the
            shelf (already hosted, no copy needed), credited to the artist, preview only. */}
        <ArtistShelf surface="slot" onPick={(hosted, attribution) => onPick(hosted, attribution)} testID="add-art-artists" />

        <View style={styles.urlRow}>
          <TextInput
            value={url}
            onChangeText={setUrl}
            onSubmitEditing={loadUrl}
            placeholder="…or paste an image address"
            placeholderTextColor={Palette.muted3}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
            testID="add-art-url"
          />
          <Pressable onPress={loadUrl} disabled={busy === 'url'} style={({ pressed }) => [styles.loadBtn, pressed && styles.pressed]}>
            <Text style={styles.loadText}>{busy === 'url' ? '…' : 'Load'}</Text>
          </Pressable>
        </View>

        {busy ? (
          <View style={styles.busyRow}>
            <ActivityIndicator />
            <Text style={styles.note}>Saving a copy to your account…</Text>
          </View>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.foot}>
          <Text style={styles.note}>Only art you have the right to use. We keep a copy with your binder, credited.</Text>
          <Pressable onPress={onAdvanced} hitSlop={6} testID="add-art-advanced">
            <Text style={styles.link}>Advanced editing ▸</Text>
          </Pressable>
        </View>
      </View>

    </DialogCard>
  );
}

const styles = StyleSheet.create({
  body: { gap: Spacing.three },
  lead: { fontSize: FontSize.label, color: Palette.ink3, lineHeight: 18 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { flexGrow: 1, flexBasis: 140, paddingVertical: 10, paddingHorizontal: 12, borderRadius: Radius.control, backgroundColor: Palette.panel, gap: 3, justifyContent: 'center' },
  tilePrimary: { backgroundColor: Palette.accent },
  tileTitle: { fontSize: FontSize.control, fontWeight: Weight.bold, color: Palette.ink },
  tileTitlePrimary: { color: Palette.accentText },
  tileSub: { fontSize: FontSize.xs, lineHeight: 15, color: Palette.ink3 },
  tileSubPrimary: { color: Palette.accentText, opacity: 0.85 },
  pressed: { opacity: 0.75 },
  find: { gap: 6 },
  findTitle: { fontSize: FontSize.control, fontWeight: Weight.bold, color: Palette.ink },
  link: { fontSize: FontSize.label, fontWeight: Weight.semibold, color: Palette.accent },
  urlRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { flex: 1, minWidth: 0, height: 36, paddingHorizontal: 10, borderRadius: Radius.control, backgroundColor: Palette.panel, color: Palette.ink, fontSize: FontSize.label },
  loadBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: Radius.control, backgroundColor: Palette.panel },
  loadText: { fontSize: FontSize.label, fontWeight: Weight.semibold, color: Palette.ink2 },
  busyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  note: { flexShrink: 1, fontSize: FontSize.xs, color: Palette.muted2, lineHeight: 15 },
  error: { fontSize: FontSize.sm, color: Palette.danger, lineHeight: 17 },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 4 },
});
