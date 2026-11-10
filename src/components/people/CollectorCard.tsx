/**
 * THE COLLECTOR CARD (MIC-017 piece 11, the sweep's "collector card" with featured picks). A
 * profile as a holo trading card: the maker's name and level, three featured cards, the bio, and
 * their numbers written as a card's attacks. The owner chooses the three featured cards from their
 * own public binders; until they do (or until the column exists) the card shows the first three
 * cards of their most-liked binder.
 *
 * Behind the 'profile-card' dev flag. The featured picks live in profiles.featured_card_ids, an
 * additive nullable column (migration 20261110160000); reading or saving it fails soft without it.
 */
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { DialogCard } from '@/components/ui/DialogCard';
import { Fonts, FontSize, Palette, Radius, Weight } from '@/constants/theme';
import type { DemoBinder } from '@/data/binderTypes';
import { cardThumbUrl, useImageManifest } from '@/lib/catalogConfig';

const HOLO = ['#ffe48a', '#f7a8ff', '#9be7ff', '#b6ffb0'] as const;

/** Every card id in these binders, most-liked binder first, reading order, no repeats. */
function cardsOf(binders: readonly DemoBinder[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const sorted = [...binders].sort((a, b) => (b.likeCount ?? 0) - (a.likeCount ?? 0));
  for (const b of sorted)
    for (const p of b.pages)
      for (const s of [...p.slots].sort((x, y) => x.row - y.row || x.col - y.col))
        if (s.cardId && !seen.has(s.cardId)) {
          seen.add(s.cardId);
          out.push(s.cardId);
        }
  return out;
}

export function CollectorCard({
  name,
  bio,
  binders,
  featured,
  since,
  wins,
  own,
  onSaveFeatured,
}: {
  name: string;
  bio: string | null;
  binders: readonly DemoBinder[];
  /** The owner's picks, or null when none are saved (or the column is not there yet). */
  featured: string[] | null;
  /** The year they joined, when known. */
  since?: string;
  wins: number;
  /** The viewer is this maker: they may choose the featured cards. */
  own: boolean;
  /** Save new picks; resolves false when they could not be kept. */
  onSaveFeatured: (ids: string[]) => Promise<boolean>;
}) {
  const manifestReady = useImageManifest();
  const pool = useMemo(() => cardsOf(binders), [binders]);
  const shown = (featured && featured.length ? featured : pool).slice(0, 3);
  const cardCount = pool.length;
  const pageCount = binders.reduce((n, b) => n + b.pages.length, 0);
  const likes = binders.reduce((n, b) => n + (b.likeCount ?? 0), 0);
  const level = Math.max(1, Math.min(99, binders.length * 2 + Math.floor(cardCount / 50)));
  const [choosing, setChoosing] = useState(false);
  const [picks, setPicks] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const attacks: [string, string, string][] = [
    ['Binder Builder', `${binders.length} binder${binders.length === 1 ? '' : 's'}`, '◉◉'],
    ['Page Turner', `${pageCount} page${pageCount === 1 ? '' : 's'}`, '◉'],
    wins > 0
      ? ['Champion', `${wins} contest win${wins === 1 ? '' : 's'}`, '◉◉◉']
      : likes > 0
        ? ['Crowd Favourite', `${likes} like${likes === 1 ? '' : 's'}`, '◉◉◉']
        : ['Card Keeper', `${cardCount} card${cardCount === 1 ? '' : 's'}`, '◉◉◉'],
  ];

  const save = () => {
    if (saving) return;
    setSaving(true);
    setNote(null);
    onSaveFeatured(picks)
      .then((ok) => {
        if (ok) setChoosing(false);
        else setNote('Featured picks could not be saved yet. Try again later.');
      })
      .finally(() => setSaving(false));
  };

  return (
    <View style={styles.wrap}>
      <LinearGradient colors={HOLO} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.holo} testID="collector-card">
        <View style={styles.face}>
          <View style={styles.head}>
            <Text style={styles.name} numberOfLines={1}>
              {name}
            </Text>
            <Text style={styles.level}>
              MAKER <Text style={styles.levelNo}>LV {level}</Text>
            </Text>
          </View>
          <View style={styles.strip} testID="collector-featured">
            {shown.length
              ? shown.map((id) => <Image key={id} source={{ uri: manifestReady ? cardThumbUrl(id, 'full') : '' }} style={styles.stripImg} contentFit="cover" />)
              : [0, 1, 2].map((k) => <View key={k} style={[styles.stripImg, styles.stripEmpty]} />)}
          </View>
          {bio ? (
            <Text style={styles.bio} numberOfLines={3}>
              {bio}
            </Text>
          ) : null}
          <View style={styles.attacks}>
            {attacks.map(([a, d, e]) => (
              <View key={a} style={styles.attack}>
                <Text style={styles.attackName}>
                  <Text style={styles.energy}>{e} </Text>
                  {a}
                </Text>
                <Text style={styles.attackValue}>{d}</Text>
              </View>
            ))}
          </View>
          <View style={styles.foot}>
            <Text style={styles.footText}>{since ? `since ${since}` : ''}</Text>
            <Text style={styles.footText}>michi-maker</Text>
          </View>
        </View>
      </LinearGradient>
      {own && pool.length ? (
        <Pressable
          onPress={() => {
            setPicks(shown.slice(0, 3));
            setChoosing(true);
          }}
          accessibilityRole="button"
          testID="collector-choose"
          style={styles.choose}>
          <Text style={styles.chooseText}>Choose featured cards</Text>
        </Pressable>
      ) : null}
      <DialogCard visible={choosing} onClose={() => setChoosing(false)} maxWidth={560} title="Featured cards">
        <Text style={styles.chooserHint}>Pick three cards from your public binders. {picks.length}/3 picked.</Text>
        <ScrollView style={styles.chooser} contentContainerStyle={styles.chooserGrid}>
          {pool.slice(0, 120).map((id) => {
            const on = picks.includes(id);
            return (
              <Pressable
                key={id}
                onPress={() => setPicks((p) => (on ? p.filter((x) => x !== id) : p.length >= 3 ? p : [...p, id]))}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                style={[styles.pickTile, on && styles.pickOn]}>
                <Image source={{ uri: manifestReady ? cardThumbUrl(id, 'full') : '' }} style={styles.pickImg} contentFit="cover" />
              </Pressable>
            );
          })}
        </ScrollView>
        {note ? <Text style={styles.note}>{note}</Text> : null}
        <Pressable onPress={save} disabled={saving || picks.length === 0} accessibilityRole="button" testID="collector-save" style={[styles.saveBtn, (saving || picks.length === 0) && styles.dim]}>
          <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save featured cards'}</Text>
        </Pressable>
      </DialogCard>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 10 },
  holo: { width: 320, maxWidth: '100%', aspectRatio: 63 / 88, borderRadius: 18, padding: 12 },
  face: { flex: 1, borderRadius: 10, backgroundColor: '#1d2340', padding: 14, gap: 10 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  name: { flexShrink: 1, fontFamily: Fonts?.brand, fontSize: 22, fontWeight: Weight.bold, color: '#fff' },
  level: { fontSize: 12, color: 'rgba(255,255,255,0.85)', fontWeight: Weight.semibold },
  levelNo: { fontSize: 18, fontWeight: Weight.bold, color: '#fff' },
  strip: { flexDirection: 'row', gap: 3, height: 128, borderRadius: 6, overflow: 'hidden' },
  stripImg: { flex: 1, height: '100%' },
  stripEmpty: { backgroundColor: 'rgba(255,255,255,0.12)' },
  bio: { fontSize: 12, fontStyle: 'italic', color: 'rgba(255,255,255,0.8)', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.2)' },
  attacks: { gap: 7 },
  attack: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  attackName: { fontSize: 14, fontWeight: Weight.bold, color: '#fff' },
  energy: { fontSize: 11, color: 'rgba(255,255,255,0.65)', fontWeight: Weight.regular },
  attackValue: { fontSize: 14, fontWeight: Weight.bold, color: '#fff' },
  foot: { marginTop: 'auto', flexDirection: 'row', justifyContent: 'space-between' },
  footText: { fontSize: 10.5, color: 'rgba(255,255,255,0.6)' },
  choose: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.pill, borderWidth: 1, borderColor: Palette.hairlineStrong },
  chooseText: { fontSize: FontSize.sm, fontWeight: Weight.semibold, color: Palette.ink },
  chooserHint: { fontSize: FontSize.sm, color: Palette.muted, marginBottom: 8 },
  chooser: { maxHeight: 420 },
  chooserGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pickTile: { width: 76, height: 106, borderRadius: 6, overflow: 'hidden', borderWidth: 3, borderColor: 'transparent' },
  pickOn: { borderColor: Palette.accent },
  pickImg: { width: '100%', height: '100%' },
  note: { fontSize: FontSize.sm, color: Palette.muted, marginTop: 8 },
  saveBtn: { marginTop: 12, alignSelf: 'flex-end', paddingHorizontal: 16, paddingVertical: 10, borderRadius: Radius.pill, backgroundColor: Palette.accent },
  saveText: { fontSize: FontSize.sm, fontWeight: Weight.semibold, color: Palette.accentText },
  dim: { opacity: 0.55 },
});
