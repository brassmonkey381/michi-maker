/**
 * COLLECTOR BINDERS (owner, 2026-10-26): ask for a set or a binder type and get it built. A
 * complete set, a master set, every card of one Pokémon, an evolution line, or the living Pokédex,
 * 1 to 1025. Two ways out: print the placeholders free (no art, no customising), or make it a
 * digital binder in the account, with a pocket on every page kept for michi art if wanted, which
 * then prints like any other binder.
 *
 * The rules are in data/collectorBinders.ts (pure, tested); this page is the asking and the
 * handing over. Research behind the shapes: the 2026-10-26 binder-types sweep (master sets, the
 * living dex and species binders lead every list).
 */
import { useRouter, type Href } from 'expo-router';
import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { CatalogSet } from 'tcgscan-browse';

import { Seg } from '@/components/binder/inspector/controls';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Breakpoints, FontSize, MaxContentWidthDoc, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { type DemoBinder, type DemoPage, type DemoSlot, uuidv4 } from '@/data/binderTypes';
import {
  COLLECTOR_KINDS, type CollectorKind, type CollectorPocket, type CollectorResult, completeSet, evolutionLineSet,
  livingDex, masterSet, pagesNeeded, searchSpecies, speciesSet,
} from '@/data/collectorBinders';
import { saveFillSheetFiles, fileStem } from '@/data/fillSheetSave';
import { buildFillSheetPdfs } from '@/data/placeholderPdf';
import { LIMITS_ENFORCED } from '@/data/tiers';
import { useCatalog } from '@/hooks/use-catalog';
import { useOwnedCards } from '@/hooks/use-owned-cards';
import { useTier } from '@/hooks/use-tier';
import { track } from '@/lib/analytics';
import { cardThumbUrl, useImageManifest } from '@/lib/catalogConfig';
import { getPriceSummary, type PriceSummary } from '@/lib/prices';
import { useAuth } from '@/store/auth';
import { useBinders } from '@/store/binders';

const KIND_OPTIONS = COLLECTOR_KINDS.map((k) => ({ id: k.id, label: k.label, blurb: k.blurb }));
const DEX_PICKS = [
  { id: 'newest', label: 'Newest print', blurb: 'The most recent card of each Pokémon.' },
  { id: 'oldest', label: 'Oldest print', blurb: 'The first card of each Pokémon.' },
] as const;

/** The centre pocket of a 3x3 page, kept for art when asked. */
const ART_CELL = { row: 1, col: 1 };

/**
 * Pages for the pockets, nine to a page, or eight with the centre left open for michi art. The
 * finish rides the slot so a reverse-holo pocket prints and shows as one.
 */
export function pagesForPockets(pockets: readonly CollectorPocket[], roomForArt: boolean): DemoPage[] {
  const cells: { row: number; col: number }[] = [];
  for (let r = 0; r < 3; r += 1) for (let c = 0; c < 3; c += 1) if (!roomForArt || r !== ART_CELL.row || c !== ART_CELL.col) cells.push({ row: r, col: c });
  const pages: DemoPage[] = [];
  for (let i = 0; i < pockets.length; i += cells.length) {
    const chunk = pockets.slice(i, i + cells.length);
    const slots: DemoSlot[] = chunk.map((p, j) => ({
      id: uuidv4(),
      row: cells[j].row,
      col: cells[j].col,
      rowSpan: 1,
      colSpan: 1,
      type: 'card',
      cardId: p.cardId,
      ...(p.finish ? { finish: p.finish } : {}),
    }));
    pages.push({ id: uuidv4(), rows: 3, cols: 3, slots });
  }
  return pages;
}

export default function CollectScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { isSignedIn } = useAuth();
  const store = useBinders();
  const { limits, tier } = useTier();
  const ownedIds = useOwnedCards();
  useImageManifest();
  const { catalog, loading } = useCatalog(true);

  const [kind, setKind] = useState<CollectorKind>('complete');
  const [query, setQuery] = useState('');
  const [set, setSet] = useState<CatalogSet | null>(null);
  const [species, setSpecies] = useState<string | null>(null);
  const [dexPick, setDexPick] = useState<'newest' | 'oldest'>('newest');
  const [roomForArt, setRoomForArt] = useState(false);
  const [building, setBuilding] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const needs = COLLECTOR_KINDS.find((k) => k.id === kind)?.needs ?? 'none';
  const wide = width >= Breakpoints.phone;

  // Every card once, for the species and dex shapes. The catalogue is load-once, so this is too.
  const allCards = useMemo(() => (catalog ? catalog.allSets().flatMap((s) => catalog.listCards(s.id)) : []), [catalog]);

  const setHits = useMemo(() => {
    if (!catalog || needs !== 'set' || query.trim().length < 2) return [];
    const q = query.trim().toLowerCase();
    return catalog.allSets().filter((s) => s.name.toLowerCase().includes(q) || s.code.toLowerCase() === q).slice(0, 8);
  }, [catalog, needs, query]);
  const speciesHits = useMemo(() => (needs === 'pokemon' && query.trim().length >= 2 ? searchSpecies(query) : []), [needs, query]);

  // THE MASTER SET reads the price summary for which cards were printed reverse holo. Loaded once
  // when first asked for, into state from the promise's callback; everything else is the
  // catalogue alone and is derived below.
  const [priced, setPriced] = useState<PriceSummary | null>(null);
  useEffect(() => {
    if (kind !== 'master' || priced) return;
    let live = true;
    getPriceSummary()
      .then((p) => {
        if (live) setPriced(p);
      })
      .catch(() => {
        if (live) setPriced({} as PriceSummary);
      });
    return () => {
      live = false;
    };
  }, [kind, priced]);

  const result = useMemo<CollectorResult | null>(() => {
    if (!catalog) return null;
    if (kind === 'complete' && set) return completeSet(catalog.listCards(set.id));
    if (kind === 'master' && set) return priced ? masterSet(catalog.listCards(set.id), (id) => !!priced[id]?.variants?.['Reverse Holofoil']) : null;
    if (kind === 'species' && species) return speciesSet(allCards, species);
    if (kind === 'line' && species) return evolutionLineSet(allCards, species);
    if (kind === 'dex') return livingDex(allCards, dexPick);
    return null;
  }, [catalog, allCards, kind, set, species, dexPick, priced]);

  const title = kind === 'dex'
    ? 'Living Pokédex'
    : kind === 'complete' && set ? `${set.name}: complete set`
      : kind === 'master' && set ? `${set.name}: master set`
        : kind === 'species' && species ? `Every ${species}`
          : kind === 'line' && species ? `${species} evolution line`
            : '';
  const perPage = roomForArt ? 8 : 9;
  const pages = result ? pagesNeeded(result.pockets.length, perPage) : 0;
  const owned = result && ownedIds ? result.pockets.filter((p) => ownedIds.has(p.cardId)).length : null;
  const overPageCap = LIMITS_ENFORCED && pages > limits.pagesPerBinder;

  const printFree = async () => {
    if (!catalog || !result || printing) return;
    if (Platform.OS !== 'web') {
      setNote('Printing is on the web app for now. Open michi-maker.com to download the placeholders.');
      return;
    }
    setPrinting(true);
    setNote(null);
    try {
      const binder: DemoBinder = { id: `collector-${kind}`, title, layoutStyle: 'freeform', isExample: false, pages: pagesForPockets(result.pockets, false) };
      const files = await buildFillSheetPdfs(binder, catalog, { ownedIds });
      if (!files.length) throw new Error('Nothing to print.');
      await saveFillSheetFiles(files, fileStem(title));
      track('collector.print', { kind, pockets: result.pockets.length });
      setNote('Placeholders downloaded. Plain paper, true to size: the instructions file says how.');
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'That did not build.');
    } finally {
      setPrinting(false);
    }
  };

  const makeBinder = () => {
    if (!result || building) return;
    if (!isSignedIn) {
      setNote('Sign in to keep a binder. Printing the placeholders needs no account.');
      return;
    }
    if (overPageCap) {
      setNote(`This binder needs ${pages} pages and your plan allows ${limits.pagesPerBinder}. PRO has no page limit. The free print has no limit either.`);
      return;
    }
    setBuilding(true);
    const created = store.createBinder({ title, pages: pagesForPockets(result.pockets, roomForArt) });
    setBuilding(false);
    if (!created) {
      setNote(tier === 'guest' || tier === 'free' ? `You are at your plan's ${limits.binders} binder limit. PRO has no limit.` : 'That did not save. Try again in a moment.');
      return;
    }
    track('collector.binder', { kind, pockets: result.pockets.length, roomForArt });
    router.push(`/binder/${created.id}?edit=1` as Href);
  };

  const cell = wide ? 96 : Math.floor((Math.min(width, MaxContentWidthDoc) - Spacing.four * 2 - Spacing.one * 2) / 3) - 2;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <ThemedText type="small" style={styles.eyebrow}>COLLECTOR BINDERS</ThemedText>
            <ThemedText type="subtitle" style={styles.h1}>Ask for a set, get the binder</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.lead}>
              A complete set, a master set, one Pokémon, an evolution line or the whole Pokédex. Print the placeholders free, or make it a binder of your own.
            </ThemedText>
          </View>

          <View style={styles.panel}>
            <Seg options={KIND_OPTIONS} value={kind} onChange={(k) => { setKind(k); setQuery(''); setSet(null); setSpecies(null); setNote(null); }} />
            <ThemedText type="small" themeColor="textSecondary">{KIND_OPTIONS.find((k) => k.id === kind)?.blurb}</ThemedText>

            {needs !== 'none' ? (
              <View style={styles.askRow}>
                <TextInput
                  value={query}
                  onChangeText={(t) => { setQuery(t); if (needs === 'set') setSet(null); else setSpecies(null); }}
                  placeholder={needs === 'set' ? 'Set name or code, like 151 or sv3pt5' : 'A Pokémon, like Pikachu'}
                  placeholderTextColor={Palette.muted}
                  style={styles.input}
                  autoCapitalize="none"
                  autoCorrect={false}
                  testID="collect-query"
                />
              </View>
            ) : (
              <Seg options={DEX_PICKS} value={dexPick} onChange={setDexPick} />
            )}
            {(loading && !catalog) || (kind === 'master' && set && !priced) ? <ActivityIndicator style={styles.loading} /> : null}
            {setHits.length && !set ? (
              <View style={styles.hits}>
                {setHits.map((s) => (
                  <Pressable key={s.id} onPress={() => { setSet(s); setQuery(s.name); setNote(null); }} style={styles.hit} accessibilityRole="button" testID={`collect-set-${s.id}`}>
                    <ThemedText type="smallBold">{s.name}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">{`${s.code} · ${s.cardCount} cards · ${s.releaseDate.slice(0, 4)}`}</ThemedText>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {speciesHits.length && !species ? (
              <View style={styles.hits}>
                {speciesHits.map((name) => (
                  <Pressable key={name} onPress={() => { setSpecies(name); setQuery(name); setNote(null); }} style={styles.hit} accessibilityRole="button" testID={`collect-species-${name}`}>
                    <ThemedText type="smallBold">{name}</ThemedText>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>

          {result ? (
            <View style={styles.panel} testID="collect-result">
              <ThemedText type="subtitle">{title}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {`${result.pockets.length} pockets · ${pages} ${pages === 1 ? 'page' : 'pages'} at ${perPage} a page`}
                {owned != null ? ` · you own ${owned} of ${result.pockets.length}` : ''}
                {result.missing.length ? ` · ${result.missing.length} Pokémon have no card yet` : ''}
              </ThemedText>
              {result.pockets.length === 0 ? (
                <ThemedText type="small" themeColor="textSecondary">Nothing matched. Try another name.</ThemedText>
              ) : (
                <View style={styles.preview}>
                  {result.pockets.slice(0, 9).map((p, i) => (
                    <View key={`${p.cardId}-${i}`} style={[styles.previewCell, { width: cell, height: Math.round(cell * 1.396) }]}>
                      <Image source={{ uri: cardThumbUrl(p.cardId, 245) }} style={StyleSheet.absoluteFill} contentFit="cover" transition={120} />
                      {p.finish ? (
                        <View style={styles.reverse}><ThemedText type="small" style={styles.reverseText}>R</ThemedText></View>
                      ) : null}
                      {ownedIds?.has(p.cardId) ? <View style={styles.ownedDot} /> : null}
                    </View>
                  ))}
                  {result.pockets.length > 9 ? (
                    <ThemedText type="small" themeColor="textSecondary" style={styles.more}>{`and ${result.pockets.length - 9} more`}</ThemedText>
                  ) : null}
                </View>
              )}

              {result.pockets.length > 0 ? (
                <>
                  <Pressable onPress={() => setRoomForArt((v) => !v)} accessibilityRole="switch" accessibilityState={{ checked: roomForArt }} style={styles.toggleRow} hitSlop={4} testID="collect-room-for-art">
                    <View style={[styles.box, roomForArt && styles.boxOn]}>{roomForArt ? <ThemedText type="small" style={styles.tick}>✓</ThemedText> : null}</View>
                    <ThemedText type="small" themeColor="textSecondary" style={styles.toggleText}>
                      Keep the centre pocket of every page for michi art, 8 cards a page. Arrange each page from its Arrange button once the binder is made.
                    </ThemedText>
                  </Pressable>
                  <View style={styles.actions}>
                    <Pressable onPress={() => void printFree()} disabled={printing} style={[styles.btn, styles.btnOutline, printing && styles.dim]} accessibilityRole="button" testID="collect-print">
                      {printing ? <ActivityIndicator size="small" color={Palette.accent} /> : null}
                      <ThemedText type="smallBold" style={styles.btnOutlineText}>{printing ? 'Building the PDF…' : 'Print placeholders, free'}</ThemedText>
                    </Pressable>
                    <Pressable onPress={makeBinder} disabled={building} style={[styles.btn, styles.btnPrimary, building && styles.dim]} accessibilityRole="button" testID="collect-make">
                      <ThemedText type="smallBold" style={styles.btnPrimaryText}>Make it a binder</ThemedText>
                    </Pressable>
                  </View>
                  <ThemedText type="small" themeColor="textSecondary">
                    The free print is placeholders only, no art and no customising. A binder of your own takes sleeves, art and a backdrop, and prints like any other binder.
                  </ThemedText>
                </>
              ) : null}
              {note ? <ThemedText type="small" style={styles.note}>{note}</ThemedText> : null}
            </View>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  scroll: { padding: Spacing.four, paddingTop: Spacing.two, paddingBottom: BottomTabInset + Spacing.four, maxWidth: MaxContentWidthDoc, width: '100%', alignSelf: 'center', gap: Spacing.three },
  hero: { gap: Spacing.one, alignItems: 'center' },
  eyebrow: { letterSpacing: 2, color: Palette.accent, fontWeight: Weight.bold },
  h1: { textAlign: 'center' },
  lead: { textAlign: 'center', maxWidth: 460 },
  panel: { borderWidth: 1, borderColor: Palette.hairline, borderRadius: Radius.control, padding: Spacing.three, gap: Spacing.two, width: '100%', maxWidth: 640, alignSelf: 'center' },
  askRow: { flexDirection: 'row', gap: Spacing.two },
  input: { flex: 1, borderWidth: 1, borderColor: Palette.hairline, borderRadius: Radius.control, paddingVertical: Spacing.two, paddingHorizontal: Spacing.two, color: Palette.ink, fontSize: FontSize.body },
  loading: { alignSelf: 'flex-start' },
  hits: { gap: Spacing.one },
  hit: { paddingVertical: Spacing.one, paddingHorizontal: Spacing.two, borderRadius: Radius.control, backgroundColor: Palette.panel },
  preview: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one, alignItems: 'center' },
  previewCell: { borderRadius: 6, overflow: 'hidden', backgroundColor: Palette.panel },
  reverse: { position: 'absolute', right: 3, top: 3, backgroundColor: '#1f1f24', borderRadius: 999, paddingHorizontal: 5, paddingVertical: 1 },
  reverseText: { color: '#fff', fontWeight: Weight.bold, fontSize: 10, lineHeight: 12 },
  ownedDot: { position: 'absolute', left: 3, top: 3, width: 10, height: 10, borderRadius: 5, backgroundColor: '#2e9e5b', borderWidth: 1, borderColor: '#fff' },
  more: { marginLeft: Spacing.one },
  toggleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  box: { width: 18, height: 18, borderRadius: 4, borderWidth: 1, borderColor: Palette.hairlineStrong, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  boxOn: { backgroundColor: Palette.accent, borderColor: Palette.accent },
  tick: { color: Palette.accentText, fontSize: 12, lineHeight: 14 },
  toggleText: { flex: 1, lineHeight: 18 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  btn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two, paddingHorizontal: Spacing.four, borderRadius: Radius.control },
  btnPrimary: { backgroundColor: Palette.accent },
  btnPrimaryText: { color: Palette.accentText },
  btnOutline: { borderWidth: 1, borderColor: Palette.accent },
  btnOutlineText: { color: Palette.accent },
  dim: { opacity: 0.6 },
  note: { color: Palette.accent },
});
