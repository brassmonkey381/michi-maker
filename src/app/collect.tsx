/**
 * COLLECTOR BINDERS (owner, 2026-10-26): ask for a set or a binder type and get it built. A
 * complete set, a master set, every card of one Pokémon, an evolution line, or the living Pokédex,
 * 1 to 1025. Two ways out: print the placeholders free (no art, no customising), or make it a
 * digital binder in the account, laid into the michi layouts at random (one per page) if wanted,
 * which then prints like any other binder. Controls (owner, 2026-10-26): EN / JP / both, secret
 * rares, where the reverse holos sit, cameo cards from the data server's cameo tags, a sort and
 * filters for every shape. Pages are IN ORDER or CURATED (owner, 2026-10-26, one or the other):
 * curated runs the Story Binder page planner over the result, pass after pass, one idea a page,
 * and the cards no page took follow in order; every in-order page is titled by the span it
 * covers (data/collectorCurate.ts). Art panels can be filled from stock art on the way out, and
 * an ART WINDOW choice shows every page in the art view, whose mats print from the binder's Print
 * sheet (the free print here stays placeholders only).
 *
 * The rules are in data/collectorBinders.ts (pure, tested); this page is the asking and the
 * handing over. Research behind the shapes: the 2026-10-26 binder-types sweep (master sets, the
 * living dex and species binders lead every list).
 */
import { useRouter, type Href } from 'expo-router';
import { Image } from 'expo-image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { type CatalogCard, type CatalogSet, findSimilarToMany, getBrowseLanguages, loadColorIndex, parseQuery, searchCards } from 'tcgscan-browse';

import { Seg } from '@/components/binder/inspector/controls';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Breakpoints, FontSize, MaxContentWidthDoc, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { type DemoBinder, type DemoPage, type DemoSlot, uuidv4 } from '@/data/binderTypes';
import {
  COLLECTOR_KINDS, type CollectorFilters, type CollectorKind, type CollectorLanguage, type CollectorPocket, type CollectorResult,
  type CollectorSort, type CollectorSortKey, completeSet, DEFAULT_DIR, evolutionFamilies, evolutionLineSet, type FacetKey, FACETS, facetOptions, filterPockets,
  inLanguage, livingDex, masterSet, michiPages, naturalSortKey, NO_FILTERS, pagesNeeded, searchSpecies, sortChangesOrder, sortKeysFor, sortPockets, speciesCounts, speciesSet, withCameos,
} from '@/data/collectorBinders';
import { collectorPool, curateMaxPages, leftoverPockets, type TailOrder, titleTailPages } from '@/data/collectorCurate';
import { saveFillSheetFiles, fileStem } from '@/data/fillSheetSave';
import { moodQuery, pageMood } from '@/data/pageMood';
import { buildFillSheetPdfs } from '@/data/placeholderPdf';
import { planPages, type PagesProviders } from '@/data/storyPages';
import { LIMITS_ENFORCED } from '@/data/tiers';
import { useCatalog } from '@/hooks/use-catalog';
import { useOwnedCards } from '@/hooks/use-owned-cards';
import { useTier } from '@/hooks/use-tier';
import { track } from '@/lib/analytics';
import { cardThumbUrl, useImageManifest } from '@/lib/catalogConfig';
import { depthOfCards } from '@/lib/depth';
import { getPriceSummary, type PriceSummary } from '@/lib/prices';
import { similarityAmong } from '@/lib/similarity';
import { fetchStockArtForPanel } from '@/lib/stockArt';
import { useAuth } from '@/store/auth';
import { useBinders } from '@/store/binders';

const KIND_OPTIONS = COLLECTOR_KINDS.map((k) => ({ id: k.id, label: k.label, blurb: k.blurb }));
const DEX_PICKS = [
  { id: 'newest', label: 'Newest print', blurb: 'The most recent card of each Pokémon.' },
  { id: 'oldest', label: 'Oldest print', blurb: 'The first card of each Pokémon.' },
] as const;
const PAGE_MODES = [
  { id: 'order', label: 'In order', blurb: 'Pages follow the sort, nine or so a page.' },
  { id: 'curate', label: 'Curated', blurb: 'One idea a page, the rest in order after.' },
] as const;
const ART_WINDOWS = [
  { id: 'off', label: 'Card view', blurb: 'Pages show the whole card.' },
  { id: 'black', label: 'Art window, black', blurb: 'Pages show the art window on black. Black mats print from the binder.' },
  { id: 'white', label: 'Art window, white', blurb: 'Pages show the art window. White mats print from the binder.' },
] as const;
/** Stock-art panels filled on the way out, at most: each is a search and a re-host. */
const ART_FILL_CAP = 60;
const LANGS = [
  { id: 'en', label: 'EN', blurb: 'English cards only.' },
  { id: 'ja', label: 'JP', blurb: 'Japanese cards only.' },
  { id: 'both', label: 'EN + JP', blurb: 'Both languages.' },
] as const;
const REVERSE = [
  { id: 'after', label: 'Reverse holos after', blurb: 'The run first, then every reverse holo.' },
  { id: 'beside', label: 'Reverse holos beside', blurb: 'Each reverse holo next to its card.' },
] as const;

/** Thumbnails shown before "Show all". Two rows of nine on a wide screen. */
const PREVIEW = 18;

/** The language the browser is set to, as this page's starting bound. */
function startLanguage(): CollectorLanguage {
  const langs = getBrowseLanguages();
  return langs.length === 1 ? langs[0] : 'both';
}

/** A counter id for a dry build: pages are only being counted, not kept. */
function countingId() {
  let n = 0;
  return () => `n${(n += 1)}`;
}

/**
 * Pages for the pockets, nine to a page, plain. The finish rides the slot so a reverse-holo pocket
 * prints and shows as one. The michi layouts are data/collectorBinders.ts → michiPages.
 */
export function pagesForPockets(pockets: readonly CollectorPocket[]): DemoPage[] {
  const cells: { row: number; col: number }[] = [];
  for (let r = 0; r < 3; r += 1) for (let c = 0; c < 3; c += 1) cells.push({ row: r, col: c });
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
  const { catalog, loading, guestGated } = useCatalog(true);

  const [kind, setKind] = useState<CollectorKind>('complete');
  const [query, setQuery] = useState('');
  const [set, setSet] = useState<CatalogSet | null>(null);
  const [species, setSpecies] = useState<string | null>(null);
  const [dexPick, setDexPick] = useState<'newest' | 'oldest'>('newest');
  const [roomForArt, setRoomForArt] = useState(false);
  const [pageMode, setPageMode] = useState<'order' | 'curate'>('order');
  const curate = pageMode === 'curate';
  const [fillArt, setFillArt] = useState(false);
  const [artWindow, setArtWindow] = useState<'off' | 'black' | 'white'>('off');
  // The store as of the latest render, for the art fill that runs across awaits after the binder
  // is created (the render-time closure would not know the new binder).
  const storeRef = useRef(store);
  useEffect(() => {
    storeRef.current = store;
  }, [store]);
  const [lang, setLang] = useState<CollectorLanguage>(startLanguage);
  const [secrets, setSecrets] = useState(true);
  const [reverse, setReverse] = useState<'after' | 'beside'>('after');
  const [cameos, setCameos] = useState(false);
  const [sort, setSort] = useState<CollectorSort>({ key: naturalSortKey('complete'), dir: 'asc' });
  const [filters, setFilters] = useState<CollectorFilters>(NO_FILTERS);
  const [openFacet, setOpenFacet] = useState<FacetKey | null>(null);
  const toggleFacet = (facet: FacetKey, id: string) =>
    setFilters((f) => ({ ...f, [facet]: f[facet].includes(id) ? f[facet].filter((x) => x !== id) : [...f[facet], id] }));
  const activeFilters = FACETS.filter((f) => filters[f.id].length).length + (filters.fullArt ? 1 : 0) + (filters.pokemonOnly ? 1 : 0) + (filters.owned !== 'all' ? 1 : 0);
  const pickSort = (key: CollectorSortKey) =>
    setSort((cur) => (cur.key === key ? { key, dir: cur.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: DEFAULT_DIR[key] }));
  const [showAll, setShowAll] = useState(false);
  const [building, setBuilding] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const needs = COLLECTOR_KINDS.find((k) => k.id === kind)?.needs ?? 'none';
  const wide = width >= Breakpoints.phone;

  // Every card once, for the species and dex shapes. The catalogue is load-once, so this is too.
  const allCards = useMemo(() => (catalog ? inLanguage(catalog.allSets().flatMap((s) => catalog.listCards(s.id)), lang) : []), [catalog, lang]);

  const setHits = useMemo(() => {
    if (!catalog || needs !== 'set' || query.trim().length < 2) return [];
    const q = query.trim().toLowerCase();
    return inLanguage(catalog.allSets(), lang).filter((s) => s.name.toLowerCase().includes(q) || s.code.toLowerCase() === q).slice(0, 8);
  }, [catalog, needs, query, lang]);
  const speciesHits = useMemo(() => (needs === 'pokemon' && query.trim().length >= 2 ? searchSpecies(query) : []), [needs, query]);

  // THE MASTER SET reads the price summary for which cards were printed reverse holo. Loaded once
  // when first asked for, into state from the promise's callback; everything else is the
  // catalogue alone and is derived below.
  const [priced, setPriced] = useState<PriceSummary | null>(null);
  const wantPrices = kind === 'master' || sort.key === 'value';
  useEffect(() => {
    if (!wantPrices || priced) return;
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
  }, [wantPrices, priced]);

  // CAMEOS come from the data server's cameo tags through the kit's own search (`cameo:<species>`),
  // the same metered path the browser takes: a free plan gets the top few, PRO and VIP get them
  // all, and the note under the result says which happened. Fetched when asked for, into state.
  const [cameoHits, setCameoHits] = useState<{ species: string; lang: CollectorLanguage; cards: CatalogCard[]; clamped: boolean } | null>(null);
  const wantCameos = cameos && (kind === 'species' || kind === 'line') && !!species;
  useEffect(() => {
    if (!wantCameos || !species) return;
    if (cameoHits && cameoHits.species === species && cameoHits.lang === lang) return;
    let live = true;
    const languages = lang === 'both' ? undefined : [lang];
    searchCards(parseQuery(`cameo:${species}`), { limit: 200, languages })
      .then((page) => {
        if (live) setCameoHits({ species, lang, cards: page.cards, clamped: page.clamped });
      })
      .catch(() => {
        if (live) setCameoHits({ species, lang, cards: [], clamped: false });
      });
    return () => {
      live = false;
    };
  }, [wantCameos, species, lang, cameoHits]);
  const cameoReady = !wantCameos || (cameoHits?.species === species && cameoHits.lang === lang);

  // The result before filters, so the facet chips can name every value the binder has.
  const unfiltered = useMemo<CollectorResult | null>(() => {
    if (!catalog) return null;
    const setOpts = { secrets, reverse };
    let r: CollectorResult | null = null;
    if (kind === 'complete' && set) r = completeSet(catalog.listCards(set.id), setOpts);
    else if (kind === 'master' && set) r = priced ? masterSet(catalog.listCards(set.id), (id) => !!priced[id]?.variants?.['Reverse Holofoil'], setOpts) : null;
    else if (kind === 'species' && species) r = speciesSet(allCards, species);
    else if (kind === 'line' && species) r = evolutionLineSet(allCards, species);
    else if (kind === 'dex') r = livingDex(allCards, dexPick);
    if (r && wantCameos && cameoReady && cameoHits) r = withCameos(r, cameoHits.cards);
    return r;
  }, [catalog, allCards, kind, set, species, dexPick, priced, secrets, reverse, wantCameos, cameoReady, cameoHits]);
  const filterCtx = useMemo(() => ({
    seriesOf: (setId: string) => catalog?.getSet(setId)?.seriesId ?? '',
    ownedIds,
    labelOf: (facet: FacetKey, id: string) =>
      facet === 'series' ? catalog?.getSeries(id)?.name ?? id : facet === 'sets' ? catalog?.getSet(id)?.name ?? id : id || 'Unknown',
  }), [catalog, ownedIds]);
  const facets = useMemo(() => (unfiltered && catalog ? facetOptions(unfiltered, (id) => catalog.getCard(id), filterCtx) : null), [unfiltered, catalog, filterCtx]);
  const result = useMemo<CollectorResult | null>(() => {
    if (!unfiltered || !catalog) return null;
    let r = filterPockets(unfiltered, (id) => catalog.getCard(id), filters, filterCtx);
    // A Pokémon or line is always sorted (its result has no order of its own); a set or the dex
    // only when the sort leaves its natural order, so a master set's reverse run stays put.
    if (kind === 'species' || kind === 'line' || sortChangesOrder(kind, sort)) r = sortPockets(r, (id) => catalog.getCard(id), sort, (id) => priced?.[id]?.cur ?? 0);
    return r;
  }, [unfiltered, catalog, filters, filterCtx, kind, sort, priced]);
  const perSpecies = useMemo(() => (result && catalog && kind === 'line' ? speciesCounts(result, (id) => catalog.getCard(id)) : []), [result, catalog, kind]);

  const title = kind === 'dex'
    ? 'Living Pokédex'
    : kind === 'complete' && set ? `${set.name}: complete set`
      : kind === 'master' && set ? `${set.name}: master set`
        : kind === 'species' && species ? `Every ${species}`
          : kind === 'line' && species ? `${species} evolution line`
            : '';
  // The michi layouts seat five to seven cards a page, so the count comes from a dry build with
  // the same seed the real build uses.
  const seed = `${title}:${result?.pockets.length ?? 0}`;
  const pages = !result ? 0 : roomForArt ? michiPages(result.pockets, countingId(), seed).length : pagesNeeded(result.pockets.length, 9);
  const cameoCount = result ? result.pockets.filter((p) => p.cameo).length : 0;
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
      const binder: DemoBinder = { id: `collector-${kind}`, title, layoutStyle: 'freeform', isExample: false, pages: pagesForPockets(result.pockets) };
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

  /**
   * CURATED PAGES: the result as the Story Binder planner's pool. Likeness from the data server
   * (Find Similar to many for the fill, Find Similar per card for the page), palettes from the
   * on-device colour index, depth words from the depth RPC. The pockets no page took follow on the
   * plain or michi pages, so nothing is dropped.
   */
  const tailOrder: TailOrder = { kind, sort, subject: title };
  const curatedPages = async (r: CollectorResult): Promise<{ pages: DemoPage[]; curated: number }> => {
    if (!catalog) return { pages: [], curated: 0 };
    const cardOf = (id: string) => catalog.getCard(id);
    const index = await loadColorIndex();
    const providers: PagesProviders = {
      likenessToCentre: async (seedIds, poolIds) => {
        const want = new Set(poolIds);
        const hits = await findSimilarToMany([...seedIds], 400);
        const out = new Map<string, number>();
        for (const h of hits) if (want.has(h.id)) out.set(h.id, Math.max(0, Math.min(1, h.similarity)));
        return out;
      },
      pairwise: (ids) => similarityAmong(ids),
      depthWords: (ids) => depthOfCards(ids),
    };
    const familyOf = evolutionFamilies(allCards);
    const sources = { familyOf, paletteOf: (id: string) => (index?.has(id) ? index.colors(id, 'art') : undefined) };
    // PASS AFTER PASS (owner, 2026-10-26: "curate pages just gave up after page 6"). The planner
    // finds its cliques among a pool's forty strongest cards and stops when its identities run
    // dry, so one pass over a big result leaves most of it. Each pass plans the cards no page has
    // taken yet, as a pool of its own, until a pass yields nothing or the page budget is spent.
    const budget = curateMaxPages(r.pockets.length);
    const curated: DemoPage[] = [];
    let rest = r;
    for (let pass = 0; pass < 4 && curated.length < budget; pass += 1) {
      const pool = collectorPool(rest, cardOf, sources);
      if (pool.length < 5) break;
      const plan = await planPages(pool, providers, { shape: { rows: 3, cols: 3 }, maxPages: budget - curated.length, minPage: 5, mkId: uuidv4 });
      if (!plan.pages.length) break;
      curated.push(...plan.pages.map((p) => p.page));
      rest = { ...rest, pockets: leftoverPockets(rest, new Set(plan.pages.flatMap((p) => p.cards.map((c) => c.id)))) };
    }
    const tail = titleTailPages(roomForArt ? michiPages(rest.pockets, uuidv4, seed) : pagesForPockets(rest.pockets), cardOf, tailOrder);
    return { pages: [...curated, ...tail], curated: curated.length };
  };

  /**
   * ART ON THE WAY OUT: every reserved panel of the new binder dressed from stock art, searched by
   * the page's subject (its species, else the binder's title), one panel at a time with the note
   * as the progress line. Capped, because a living dex in the michi layouts is a few hundred
   * panels; the rest stay as panels to fill by hand.
   */
  const fillArtPanels = async (binderId: string, pages: readonly DemoPage[]) => {
    if (!catalog) return 0;
    const jobs = pages.flatMap((p) => p.slots.filter((s) => s.type === 'artwork' && !s.cardId && !s.imageUrl).map((s) => ({ page: p, slot: s }))).slice(0, ART_FILL_CAP);
    const used = new Set<string>();
    const panelOnPage = new Map<string, number>();
    let placed = 0;
    for (const [i, { page, slot }] of jobs.entries()) {
      setNote(`Finding photos, panel ${i + 1} of ${jobs.length}…`);
      // Stock sites do not know Pokémon, so the search is the page's mood: the sea for a Water
      // page, embers for Fire, read off the cards' energy types. Two scenes a type, alternating.
      const cardTypes: string[][] = [];
      for (const s of page.slots) {
        const x = s.type === 'card' && s.cardId ? catalog.getCard(s.cardId) : undefined;
        if (x) cardTypes.push(x.types ?? []);
      }
      const nth = panelOnPage.get(page.id) ?? 0;
      panelOnPage.set(page.id, nth + 1);
      const mood = pageMood(cardTypes);
      const queries = [moodQuery(mood, nth), moodQuery(mood, nth + 1)];
      const art = await fetchStockArtForPanel(queries, slot.rowSpan, slot.colSpan, 'photo', used);
      if (!art) continue;
      storeRef.current.placeArtPanels(binderId, page.id, slot.row, slot.col, [
        { r: 0, c: 0, rs: slot.rowSpan, cs: slot.colSpan, imageUrl: art.imageUrl, crop: art.crop, attribution: art.attribution },
      ]);
      placed += 1;
    }
    return placed;
  };

  const makeBinder = async () => {
    if (!result || building) return;
    if (!isSignedIn) {
      setNote('Sign in to keep a binder.');
      return;
    }
    if (overPageCap) {
      setNote(`${pages} pages; your plan allows ${limits.pagesPerBinder}. PRO has no page limit.`);
      return;
    }
    setBuilding(true);
    setNote(null);
    let built: DemoPage[];
    let curated = 0;
    try {
      if (curate) {
        const planned = await curatedPages(result);
        built = planned.pages;
        curated = planned.curated;
      } else {
        built = titleTailPages(roomForArt ? michiPages(result.pockets, uuidv4, seed) : pagesForPockets(result.pockets), (id) => catalog?.getCard(id), tailOrder);
      }
    } catch (e) {
      setBuilding(false);
      setNote(e instanceof Error ? e.message : 'The pages did not plan. Try again.');
      return;
    }
    if (LIMITS_ENFORCED && built.length > limits.pagesPerBinder) {
      setBuilding(false);
      setNote(`${built.length} pages; your plan allows ${limits.pagesPerBinder}. PRO has no page limit.`);
      return;
    }
    // The art window shows every page in the art view; its mats print from the binder's Print
    // sheet, where mats are on by default for such a binder.
    if (artWindow !== 'off') built = built.map((p) => ({ ...p, artView: 'window' as const }));
    const created = store.createBinder({ title, pages: built, ...(curated ? { description: `${curated} pages each one idea, then the rest in order.` } : {}) });
    if (!created) {
      setBuilding(false);
      setNote(tier === 'guest' || tier === 'free' ? `Your plan's ${limits.binders} binders are used. PRO has no limit.` : 'That did not save. Try again.');
      return;
    }
    let artPlaced = 0;
    if (fillArt && (roomForArt || curate)) {
      try {
        artPlaced = await fillArtPanels(created.id, built);
      } catch {
        // The binder exists; the panels it did not reach stay as panels.
      }
    }
    setBuilding(false);
    setNote(null);
    track('collector.binder', { kind, pockets: result.pockets.length, roomForArt, curate, curated, fillArt, artPlaced, artWindow, sort: sort.key, lang, cameos: cameoCount });
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
              Print the placeholders free, or make it your binder. Sign in first.
            </ThemedText>
          </View>

          <View style={styles.panel}>
            <Seg options={KIND_OPTIONS} value={kind} onChange={(k) => { setKind(k); setQuery(''); setSet(null); setSpecies(null); setNote(null); setFilters(NO_FILTERS); setOpenFacet(null); setSort({ key: naturalSortKey(k), dir: DEFAULT_DIR[naturalSortKey(k)] }); }} />
            <ThemedText type="small" themeColor="textSecondary">{KIND_OPTIONS.find((k) => k.id === kind)?.blurb}</ThemedText>
            <Seg options={LANGS} value={lang} onChange={(l) => { setLang(l); setSet(null); if (needs === 'set') setQuery(''); }} />

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
            {needs === 'set' ? (
              <Check on={secrets} onPress={() => setSecrets((v) => !v)} testID="collect-secrets">Include secret rares, numbered past the set total.</Check>
            ) : null}
            {kind === 'master' ? <Seg options={REVERSE} value={reverse} onChange={setReverse} /> : null}
            <View style={styles.sortRow} testID="collect-sort">
              <ThemedText type="small" themeColor="textSecondary">Sort</ThemedText>
              {sortKeysFor(kind).map((k) => {
                const on = sort.key === k.id;
                return (
                  <Pressable key={k.id} onPress={() => pickSort(k.id)} style={[styles.sortChip, on && styles.sortChipOn]} accessibilityRole="button" accessibilityLabel={`${k.label}: ${k.blurb} Tap again to flip.`} testID={`collect-sort-${k.id}`}>
                    <ThemedText type="small" style={[styles.sortText, on && styles.sortTextOn]}>{on ? `${k.label} ${sort.dir === 'asc' ? '\u25B2' : '\u25BC'}` : k.label}</ThemedText>
                  </Pressable>
                );
              })}
            </View>
            {needs === 'pokemon' ? (
              <Check on={cameos} onPress={() => setCameos((v) => !v)} testID="collect-cameos">Add cameo cards: this Pokémon inside other cards.</Check>
            ) : null}
            {unfiltered && facets ? (
              <>
                <View style={styles.sortRow} testID="collect-filters">
                  <ThemedText type="small" themeColor="textSecondary">Filter</ThemedText>
                  {FACETS.filter((f) => (needs === 'set' ? f.id !== 'series' && f.id !== 'sets' : true)).map((f) => {
                    const n = filters[f.id].length;
                    const open = openFacet === f.id;
                    return (
                      <Pressable key={f.id} onPress={() => setOpenFacet(open ? null : f.id)} style={[styles.sortChip, (n > 0 || open) && styles.sortChipOn]} accessibilityRole="button" accessibilityState={{ expanded: open }} testID={`collect-facet-${f.id}`}>
                        <ThemedText type="small" style={[styles.sortText, (n > 0 || open) && styles.sortTextOn]}>{n ? `${f.label} · ${n}` : f.label}</ThemedText>
                      </Pressable>
                    );
                  })}
                  <Pressable onPress={() => setFilters((v) => ({ ...v, fullArt: !v.fullArt }))} style={[styles.sortChip, filters.fullArt && styles.sortChipOn]} accessibilityRole="switch" accessibilityState={{ checked: filters.fullArt }} testID="collect-full-art">
                    <ThemedText type="small" style={[styles.sortText, filters.fullArt && styles.sortTextOn]}>Full art</ThemedText>
                  </Pressable>
                  <Pressable onPress={() => setFilters((v) => ({ ...v, pokemonOnly: !v.pokemonOnly }))} style={[styles.sortChip, filters.pokemonOnly && styles.sortChipOn]} accessibilityRole="switch" accessibilityState={{ checked: filters.pokemonOnly }} testID="collect-pokemon-only">
                    <ThemedText type="small" style={[styles.sortText, filters.pokemonOnly && styles.sortTextOn]}>Pokémon only</ThemedText>
                  </Pressable>
                  {ownedIds ? (
                    <Pressable onPress={() => setFilters((v) => ({ ...v, owned: v.owned === 'all' ? 'owned' : v.owned === 'owned' ? 'missing' : 'all' }))} style={[styles.sortChip, filters.owned !== 'all' && styles.sortChipOn]} accessibilityRole="button" testID="collect-owned-filter">
                      <ThemedText type="small" style={[styles.sortText, filters.owned !== 'all' && styles.sortTextOn]}>{filters.owned === 'all' ? 'Owned: all' : filters.owned === 'owned' ? 'Owned only' : 'Missing only'}</ThemedText>
                    </Pressable>
                  ) : null}
                  {activeFilters ? (
                    <Pressable onPress={() => { setFilters(NO_FILTERS); setOpenFacet(null); }} style={styles.sortChip} accessibilityRole="button" testID="collect-clear-filters">
                      <ThemedText type="small" style={styles.sortText}>Clear</ThemedText>
                    </Pressable>
                  ) : null}
                </View>
                {openFacet ? (
                  <View style={styles.facetBox} testID={`collect-facet-options-${openFacet}`}>
                    {facets[openFacet].length === 0 ? <ThemedText type="small" themeColor="textSecondary">Nothing to pick here.</ThemedText> : null}
                    {facets[openFacet].slice(0, 60).map((o) => {
                      const on = filters[openFacet].includes(o.id);
                      return (
                        <Pressable key={o.id} onPress={() => toggleFacet(openFacet, o.id)} style={[styles.sortChip, on && styles.sortChipOn]} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
                          <ThemedText type="small" style={[styles.sortText, on && styles.sortTextOn]}>{`${o.label} ${o.count}`}</ThemedText>
                        </Pressable>
                      );
                    })}
                    {facets[openFacet].length > 60 ? <ThemedText type="small" themeColor="textSecondary">{`${facets[openFacet].length - 60} more not shown.`}</ThemedText> : null}
                  </View>
                ) : null}
              </>
            ) : null}
            {guestGated ? (
              <ThemedText type="small" style={styles.note}>Sign in free to build. Guests see nothing here.</ThemedText>
            ) : null}
            {(loading && !catalog) || (wantPrices && !priced) || (wantCameos && !cameoReady) ? <ActivityIndicator style={styles.loading} /> : null}
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
                {`${result.pockets.length} pockets · ${pages} ${pages === 1 ? 'page' : 'pages'}`}
                {activeFilters && unfiltered ? ` · of ${unfiltered.pockets.length}` : ''}
                {owned != null ? ` · you own ${owned}` : ''}
                {cameoCount ? ` · ${cameoCount} cameos` : ''}
                {result.missing.length ? ` · ${result.missing.length} Pokémon have no card` : ''}
              </ThemedText>
              {perSpecies.length > 1 ? (
                <ThemedText type="small" themeColor="textSecondary">{perSpecies.map((s) => `${s.count} ${s.species}`).join(' · ')}</ThemedText>
              ) : null}
              {wantCameos && cameoHits?.clamped ? (
                <ThemedText type="small" themeColor="textSecondary">Free plans get the top cameos only. PRO gets all.</ThemedText>
              ) : null}
              {result.pockets.length === 0 ? (
                <ThemedText type="small" themeColor="textSecondary">Nothing matched. Try another name.</ThemedText>
              ) : (
                <View style={styles.preview}>
                  {(showAll ? result.pockets : result.pockets.slice(0, PREVIEW)).map((p, i) => (
                    <View key={`${p.cardId}-${i}`} style={[styles.previewCell, { width: cell, height: Math.round(cell * 1.396) }]}>
                      <Image source={{ uri: cardThumbUrl(p.cardId, 245) }} style={StyleSheet.absoluteFill} contentFit="cover" transition={120} />
                      {p.finish || p.cameo ? (
                        <View style={styles.reverse}><ThemedText type="small" style={styles.reverseText}>{p.finish ? 'R' : 'C'}</ThemedText></View>
                      ) : null}
                      {ownedIds?.has(p.cardId) ? <View style={styles.ownedDot} /> : null}
                    </View>
                  ))}
                  {result.pockets.length > PREVIEW ? (
                    <Pressable onPress={() => setShowAll((v) => !v)} accessibilityRole="button" style={styles.more} testID="collect-show-all">
                      <ThemedText type="smallBold" style={styles.moreText}>{showAll ? 'Show fewer' : `Show all ${result.pockets.length}`}</ThemedText>
                    </Pressable>
                  ) : null}
                </View>
              )}

              {result.pockets.length > 0 ? (
                <>
                  <Seg options={PAGE_MODES} value={pageMode} onChange={setPageMode} />
                  {curate ? (
                    <ThemedText type="small" themeColor="textSecondary">Curated pages carry art panels. Curating reads likeness from the server. Allow a minute.</ThemedText>
                  ) : null}
                  <Check on={roomForArt} onPress={() => setRoomForArt((v) => !v)} testID="collect-room-for-art">{curate ? 'Michi layouts for the pages in order too.' : 'Michi layouts: random art panels on every page.'}</Check>
                  {roomForArt || curate ? (
                    <Check on={fillArt} onPress={() => setFillArt((v) => !v)} testID="collect-fill-art">Fill the art panels with stock photos.</Check>
                  ) : null}
                  <Seg options={ART_WINDOWS} value={artWindow} onChange={setArtWindow} />
                  <View style={styles.actions}>
                    {artWindow === 'off' ? (
                      <Pressable onPress={() => void printFree()} disabled={printing} style={[styles.btn, styles.btnOutline, printing && styles.dim]} accessibilityRole="button" testID="collect-print">
                        {printing ? <ActivityIndicator size="small" color={Palette.accent} /> : null}
                        <ThemedText type="smallBold" style={styles.btnOutlineText}>{printing ? 'Building the PDF…' : 'Print placeholders, free'}</ThemedText>
                      </Pressable>
                    ) : null}
                    <Pressable onPress={() => void makeBinder()} disabled={building} style={[styles.btn, styles.btnPrimary, building && styles.dim]} accessibilityRole="button" testID="collect-make">
                      {building ? <ActivityIndicator size="small" color={Palette.accentText} /> : null}
                      <ThemedText type="smallBold" style={styles.btnPrimaryText}>{building ? (curate ? 'Curating the pages…' : 'Building…') : 'Make it a binder'}</ThemedText>
                    </Pressable>
                  </View>
                  <ThemedText type="small" themeColor="textSecondary">
                    {artWindow === 'off'
                      ? 'Free print: placeholders only. Your binder prints like any other.'
                      : `Mats print from the binder: Print, then ${artWindow} mats are on. One unlock covers the binder.`}
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

/** A labelled tick box. The label is the whole target. */
function Check({ on, onPress, testID, children }: { on: boolean; onPress: () => void; testID: string; children: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="switch" accessibilityState={{ checked: on }} style={styles.toggleRow} hitSlop={4} testID={testID}>
      <View style={[styles.box, on && styles.boxOn]}>{on ? <ThemedText type="small" style={styles.tick}>✓</ThemedText> : null}</View>
      <ThemedText type="small" themeColor="textSecondary" style={styles.toggleText}>{children}</ThemedText>
    </Pressable>
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
  sortRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.one },
  facetBox: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one, padding: Spacing.two, borderRadius: Radius.control, backgroundColor: Palette.panel },
  sortChip: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: Radius.pill, backgroundColor: Palette.panel },
  sortChipOn: { backgroundColor: Palette.accent },
  sortText: { color: Palette.muted },
  sortTextOn: { color: Palette.accentText, fontWeight: Weight.semibold },
  more: { marginLeft: Spacing.one, paddingVertical: Spacing.one, paddingHorizontal: Spacing.two, borderRadius: Radius.control, borderWidth: 1, borderColor: Palette.hairlineStrong },
  moreText: { color: Palette.accent },
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
