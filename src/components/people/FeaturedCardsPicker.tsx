/**
 * CHOOSE FEATURED CARDS (owner 2026-11-17): the collector card's three featured cards come from the
 * whole card browser, not only from the owner's own public binders. Any card works, owned or not.
 * A large pop-up over the profile: a three-slot tray at the top (tap a picked card to drop it), the
 * card browser (name search, filters) below, "Save featured cards" at the bottom.
 *
 * Mounted only while open, so the catalogue loads only when someone actually chooses.
 */
import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { CatalogCard } from 'tcgscan-browse';

import { CardBrowse } from '@/components/binder/CardBrowse';
import { DialogCard } from '@/components/ui/DialogCard';
import { Breakpoints, FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { useCatalog } from '@/hooks/use-catalog';
import { cardThumbUrl, useImageManifest } from '@/lib/catalogConfig';

export function FeaturedCardsPicker({
  initial,
  onClose,
  onSave,
}: {
  /** The card ids shown today, in order. */
  initial: readonly string[];
  onClose: () => void;
  /** Resolves false when the picks could not be kept. */
  onSave: (ids: string[]) => Promise<boolean>;
}) {
  const { width, height } = useWindowDimensions();
  const { catalog } = useCatalog(true);
  const manifestReady = useImageManifest();
  const [picks, setPicks] = useState<string[]>(() => initial.slice(0, 3));
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const toggle = (id: string) => setPicks((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < 3 ? [...p, id] : p));
  const nameOf = (id: string) => catalog?.getCard(id)?.name ?? 'card';

  const save = () => {
    if (saving || !picks.length) return;
    setSaving(true);
    setNote(null);
    onSave(picks)
      .then((ok) => {
        if (ok) onClose();
        else setNote('Featured cards could not be saved yet. Try again later.');
      })
      .finally(() => setSaving(false));
  };

  // The browser needs a real height to lay its grid out in; the dialog caps itself to the viewport.
  const bodyH = Math.max(360, Math.min(820, height - (width < Breakpoints.phone ? 150 : 170)));

  // Desktop: the three picks stand big in a column on the left (the size they read at on the
  // collector card), the browser fills the rest. Phone: the three picks in a row on top.
  const side = width >= Breakpoints.rail;
  const slotW = side ? 132 : Math.min(96, Math.floor((width - 2 * Spacing.four - 2 * Spacing.two) / 3));
  const slotH = Math.round(slotW * 1.396);

  const slots = (
    <View style={[styles.slots, side && styles.slotsSide]}>
      {[0, 1, 2].map((i) => {
        const id = picks[i];
        return (
          <View key={id ?? `empty-${i}`} style={styles.slotWrap}>
            {id ? (
              <Pressable onPress={() => toggle(id)} accessibilityRole="button" accessibilityLabel={`Remove ${nameOf(id)}`}>
                <Image source={{ uri: manifestReady ? cardThumbUrl(id, 640) : '' }} style={[styles.card, { width: slotW, height: slotH }]} contentFit="cover" />
                <View style={styles.remove}><Text style={styles.removeText}>×</Text></View>
              </Pressable>
            ) : (
              <View style={[styles.slot, { width: slotW, height: slotH }]}>
                <Text style={styles.slotNum}>{i + 1}</Text>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );

  const saveBtn = (
    <Pressable
      onPress={save}
      disabled={saving || picks.length === 0}
      accessibilityRole="button"
      testID="featured-save"
      style={[styles.saveBtn, side && styles.saveBtnSide, (saving || picks.length === 0) && styles.dim]}>
      <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save featured cards'}</Text>
    </Pressable>
  );

  const browser = (
    <View style={styles.browse}>
      {catalog ? (
        <CardBrowse
          catalog={catalog}
          compactHeader
          cardSize={width < Breakpoints.phone ? 'S' : undefined}
          onPickCard={(id) => toggle(id)}
          quickAction={(card: CatalogCard) => ({
            key: 'featured-pick',
            label: picks.includes(card.id) ? '✓' : '＋',
            onPress: (c: CatalogCard) => toggle(c.id),
          })}
        />
      ) : (
        <View style={styles.loading}>
          <ActivityIndicator />
          <Text style={styles.loadingText}>Loading cards…</Text>
        </View>
      )}
    </View>
  );

  return (
    <DialogCard visible onClose={onClose} maxWidth={1100} title="Featured cards" scroll={false}>
      <View style={[styles.body, side && styles.bodySide, { height: bodyH }]} testID="featured-picker">
        {side ? (
          <>
            <View style={styles.left}>
              <Text style={styles.hint}>Pick any three cards. Search by name or browse, then tap “＋”. Tap a pick to remove it.</Text>
              {slots}
              {note ? <Text style={styles.note}>{note}</Text> : null}
              {saveBtn}
            </View>
            {browser}
          </>
        ) : (
          <>
            <Text style={styles.hint}>Pick any three cards. Search by name or browse, then tap “＋”.</Text>
            {slots}
            {browser}
            {note ? <Text style={styles.note}>{note}</Text> : null}
            {saveBtn}
          </>
        )}
      </View>
    </DialogCard>
  );
}

const styles = StyleSheet.create({
  body: { gap: Spacing.two },
  bodySide: { flexDirection: 'row', gap: Spacing.four },
  left: { width: 132, gap: Spacing.three },
  hint: { fontSize: FontSize.sm, lineHeight: 18, color: Palette.muted },
  slots: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.two },
  slotsSide: { flexDirection: 'column', gap: Spacing.two },
  slotWrap: { alignItems: 'center' },
  card: { borderRadius: 8, borderWidth: 2, borderColor: Palette.accent },
  slot: { borderRadius: 8, borderWidth: 1.5, borderStyle: 'dashed', borderColor: Palette.hairlineStrong, alignItems: 'center', justifyContent: 'center' },
  slotNum: { fontSize: 22, fontWeight: Weight.bold, color: Palette.hairlineStrong },
  remove: { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  removeText: { color: '#fff', fontSize: 15, lineHeight: 17, fontWeight: Weight.bold },
  browse: { flex: 1, minHeight: 0, minWidth: 0 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
  loadingText: { fontSize: FontSize.sm, color: Palette.muted },
  note: { fontSize: FontSize.sm, color: Palette.muted },
  saveBtn: { alignSelf: 'flex-end', paddingHorizontal: 16, paddingVertical: 10, borderRadius: Radius.pill, backgroundColor: Palette.accent },
  saveBtnSide: { alignSelf: 'stretch', alignItems: 'center' },
  saveText: { fontSize: FontSize.sm, fontWeight: Weight.semibold, color: Palette.accentText },
  dim: { opacity: 0.55 },
});
