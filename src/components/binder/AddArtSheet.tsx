/**
 * ADD ART, THE SHORT WAY (owner, 2026-10-22: "pull in the art as a one by one and allow dragging
 * and resizing and edits in the Binder Page itself ... advanced/studio button tucked behind a
 * button that says advanced editing").
 *
 * Three ways in, Card art, Upload, Find art, plus a paste-a-URL row. Choosing a picture is the
 * whole job: the host seats it on the page as one pocket and the sheet closes. Dragging and the
 * corner handle do the rest on the page. The Slice Studio, with its zoom, rotate, flip and cut,
 * is one link away as Advanced editing, with the chosen picture already loaded when there is one.
 *
 * The rights rules are the studio's, unchanged: catalog art is 'card' (public-eligible), an upload
 * is 'upload', a remote URL is fetched into the user's own bucket and filed 'external' (private),
 * and a stock photo carries its provider credit.
 */
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ArtUploadButton } from '@/components/binder/ArtUploadButton';
import { CardBrowse } from '@/components/binder/CardBrowse';
import { FindArtSheet, openArtSearch, useArtLead } from '@/components/binder/FindArtSheet';
import { artSearchLinks } from '@/data/pageArtSubject';
import { StockArtSearch } from '@/components/binder/StockArtSearch';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { DialogCard } from '@/components/ui/DialogCard';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { sheet } from '@/constants/ui';
import { deriveAttribution, type ArtAttribution } from '@/data/artworkLibrary';
import { useCatalog } from '@/hooks/use-catalog';
import { cardThumbUrl } from '@/lib/catalogConfig';
import { importRemoteArtToBucket } from '@/lib/importArt';
import { stockAttribution, type StockHit } from '@/lib/stockArt';

export function AddArtSheet({
  cardIds,
  pageTitle,
  onPick,
  onAdvanced,
  onClose,
}: {
  /** The page's cards, for what Find art starts on. */
  cardIds: readonly string[];
  pageTitle?: string | null;
  /** A picture was chosen: seat it on the page. The host closes the sheet. */
  onPick: (imageUrl: string, attribution: ArtAttribution) => void;
  /** Open the Slice Studio instead, with this picture when one was chosen. */
  onAdvanced: () => void;
  onClose: () => void;
}) {
  const [cardPickOpen, setCardPickOpen] = useState(false);
  // Open on arrival (owner, 2026-10-27): an empty panel should be one tap from art of what the
  // page shows, with the species already typed and every site one tap away.
  const [findOpen, setFindOpen] = useState(true);
  const [sitesOpen, setSitesOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { catalog } = useCatalog(cardPickOpen);
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
          <Pressable
            onPress={() => setCardPickOpen(true)}
            accessibilityRole="button"
            testID="add-art-card"
            style={({ pressed }) => [styles.tile, styles.tilePrimary, pressed && styles.pressed]}>
            <Text style={[styles.tileTitle, styles.tileTitlePrimary]}>Card art</Text>
            <Text style={[styles.tileSub, styles.tileSubPrimary]}>A card from the catalog</Text>
          </Pressable>
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
            <Text style={styles.tileTitle}>{findOpen ? 'Find art ▴' : 'Find art'}</Text>
            <Text style={styles.tileSub}>Free photos, and where to look</Text>
          </Pressable>
        </View>

        {findOpen ? (
          <View style={styles.find}>
            <View style={styles.findHead}>
              <Text style={styles.findTitle}>{lead.label ? `Art of ${lead.label}` : 'Find art'}</Text>
              <Pressable onPress={() => setSitesOpen(true)} hitSlop={6}>
                <Text style={styles.link}>About the sites ↗</Text>
              </Pressable>
            </View>
            {lead.query ? (
              <View style={styles.siteRow} testID="add-art-sites">
                {artSearchLinks(lead.query).map((l) => (
                  <Pressable key={l.title} onPress={() => openArtSearch(l.url)} accessibilityRole="link" hitSlop={4} style={({ pressed }) => [styles.siteChip, pressed && styles.pressed]}>
                    <Text style={styles.siteChipText}>{l.title} ↗</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            <Text style={styles.findSub}>Free photos</Text>
            <StockArtSearch
              initialQuery={lead.query}
              busyId={busy}
              onPick={(hit: StockHit) => void bringIn(hit.url, stockAttribution(hit), `${hit.provider}:${hit.id}`)}
              testID="add-art-stock"
            />
          </View>
        ) : null}

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

      {sitesOpen ? <FindArtSheet cardIds={cardIds} pageTitle={pageTitle} onClose={() => setSitesOpen(false)} /> : null}

      {cardPickOpen ? (
        <Modal visible transparent animationType="slide" onRequestClose={() => setCardPickOpen(false)}>
          <View style={sheet.bottomBackdrop}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setCardPickOpen(false)} />
            <ThemedView type="backgroundElement" style={[sheet.bottomSheet, styles.cardPick]}>
              <View style={styles.cardPickHead}>
                <ThemedText type="subtitle">Choose card art</ThemedText>
                <Pressable onPress={() => setCardPickOpen(false)} hitSlop={10}>
                  <Text style={styles.link}>Close</Text>
                </Pressable>
              </View>
              <CardBrowse
                catalog={catalog}
                onPickCard={(id) => {
                  // Catalog art is 'card': public-eligible, as the app already shows it publicly.
                  setCardPickOpen(false);
                  onPick(cardThumbUrl(id, 'full'), { sourceName: 'official card art', origin: 'card' });
                }}
              />
            </ThemedView>
          </View>
        </Modal>
      ) : null}
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
  findHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  findTitle: { fontSize: FontSize.control, fontWeight: Weight.bold, color: Palette.ink },
  link: { fontSize: FontSize.label, fontWeight: Weight.semibold, color: Palette.accent },
  siteRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  siteChip: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, backgroundColor: Palette.selectionSoft },
  siteChipText: { fontSize: FontSize.label, fontWeight: Weight.semibold, color: Palette.accent },
  findSub: { fontSize: FontSize.label, fontWeight: Weight.semibold, color: Palette.muted3, marginTop: 4 },
  urlRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { flex: 1, minWidth: 0, height: 36, paddingHorizontal: 10, borderRadius: Radius.control, backgroundColor: Palette.panel, color: Palette.ink, fontSize: FontSize.label },
  loadBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: Radius.control, backgroundColor: Palette.panel },
  loadText: { fontSize: FontSize.label, fontWeight: Weight.semibold, color: Palette.ink2 },
  busyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  note: { flexShrink: 1, fontSize: FontSize.xs, color: Palette.muted2, lineHeight: 15 },
  error: { fontSize: FontSize.sm, color: Palette.danger, lineHeight: 17 },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 4 },
  cardPick: { height: '82%' },
  cardPickHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
});
