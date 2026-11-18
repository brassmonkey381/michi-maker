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

  return (
    <DialogCard visible onClose={onClose} maxWidth={1040} title="Featured cards" scroll={false}>
      <View style={[styles.body, { height: bodyH }]} testID="featured-picker">
        <View style={styles.head}>
          <Text style={styles.hint} numberOfLines={2}>
            Pick any three cards. Search by name or browse.
          </Text>
          <View style={styles.tray}>
            {[0, 1, 2].map((i) => {
              const id = picks[i];
              return id ? (
                <Pressable key={id} onPress={() => toggle(id)} accessibilityRole="button" accessibilityLabel={`Remove ${nameOf(id)}`}>
                  <Image source={{ uri: manifestReady ? cardThumbUrl(id, 245) : '' }} style={styles.thumb} contentFit="cover" />
                </Pressable>
              ) : (
                <View key={i} style={styles.slot} />
              );
            })}
            <Text style={styles.count}>{picks.length}/3</Text>
          </View>
        </View>

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
            </View>
          )}
        </View>

        <View style={styles.foot}>
          {note ? <Text style={styles.note}>{note}</Text> : <View />}
          <Pressable
            onPress={save}
            disabled={saving || picks.length === 0}
            accessibilityRole="button"
            testID="featured-save"
            style={[styles.saveBtn, (saving || picks.length === 0) && styles.dim]}>
            <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save featured cards'}</Text>
          </Pressable>
        </View>
      </View>
    </DialogCard>
  );
}

const styles = StyleSheet.create({
  body: { gap: Spacing.two },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two, minHeight: 48 },
  hint: { flexShrink: 1, fontSize: FontSize.sm, color: Palette.muted },
  tray: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  thumb: { width: 32, height: 45, borderRadius: 4, borderWidth: 2, borderColor: Palette.accent },
  slot: { width: 32, height: 45, borderRadius: 4, borderWidth: 1.5, borderStyle: 'dashed', borderColor: Palette.hairlineStrong },
  count: { fontSize: FontSize.sm, fontWeight: Weight.bold, color: Palette.ink2, minWidth: 28, textAlign: 'right' },
  browse: { flex: 1, minHeight: 0 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  note: { flexShrink: 1, fontSize: FontSize.sm, color: Palette.muted },
  saveBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: Radius.pill, backgroundColor: Palette.accent },
  saveText: { fontSize: FontSize.sm, fontWeight: Weight.semibold, color: Palette.accentText },
  dim: { opacity: 0.55 },
});
