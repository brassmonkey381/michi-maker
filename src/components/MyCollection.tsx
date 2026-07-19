/**
 * "My collection" — the signed-in user's card inventory (`user_cards`), fed live by
 * tcgscan-app scans. Lives on the /my-binders page (below Your binders). Renders nothing until
 * the inventory has rows, and updates in real time while the page is open (scan a card in
 * tcgscan, watch it show up here).
 *
 * Each tile shows `(free/owned)` — how many copies are still unplaced vs owned, where "placed"
 * counts that card's pockets across ALL of the user's binders. A card with nothing left to
 * place (0/N) greys out. Tapping selects (multi-select); the action bar places the selection
 * into a chosen binder's next free pockets.
 *
 * Catalog-free: tiles resolve images straight from the card id (cardThumbUrl), so this paints
 * without the big catalog. The header shows count + total value once the price summary resolves.
 */
import { Image } from 'expo-image';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { BuildBinderSheet } from '@/components/BuildBinderSheet';
import { CardPlaceholder } from '@/components/CardPlaceholder';
import { HomeSection } from '@/components/HomeSection';
import { ImportCsvSheet } from '@/components/ImportCsvSheet';
import { TcgscanLink } from '@/components/monetization/BundleOffer';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontSize, Palette, Radii, Radius, Spacing, Weight } from '@/constants/theme';
import { pillChip } from '@/constants/ui';
import {
  deletePortfolio,
  fetchPortfolioGroups,
  fetchUserCards,
  subscribeUserCards,
  type PortfolioGroup,
  type UserCard,
} from '@/data/collectionRepo';
import { EXAMPLE_COLLECTION_CSV, EXAMPLE_COLLECTION_NAME } from '@/data/exampleCollection';
import { CARD_SIZE_SCALE, cardTierFor } from 'tcgscan-browse';

import { isSupabaseConfigured } from '@/lib/env';
import { cardThumbUrl } from '@/lib/catalogConfig';
import { useCardSize } from '@/lib/cardSizePref';
import { useCatalog } from '@/hooks/use-catalog';
import { useAuth } from '@/store/auth';
import { useBinders } from '@/store/binders';

const TILE_W = 96;
const CARD_ASPECT = 88 / 63;

/** How the collection is browsed: one carousel, a series→set drill, or by tcgscan portfolio. */
type ViewMode = 'all' | 'sets' | 'portfolios';
// Session-remembered preference, like the binder double-sided toggle.
let viewModePref: ViewMode = 'all';

export function MyCollection({
  onToast,
  onOpenBinder,
  onFindSimilar,
  onViewSet,
}: {
  onToast?: (message: string) => void;
  onOpenBinder?: (binderId: string) => void;
  /** Drive the home browser: find-similar for one or many cards. */
  onFindSimilar?: (cardIds: string[]) => void;
  /** Drive the home browser: open this card's set. */
  onViewSet?: (cardId: string) => void;
}) {
  const { user } = useAuth();
  const [cards, setCards] = useState<UserCard[] | null>(null);
  // "Try it out!" onboarding: set when the empty state imports the example collection, so the
  // strip that replaces it (once realtime delivers the cards) can guide the user to Build binder.
  const [exampleFlow, setExampleFlow] = useState(false);

  const userId = user?.id ?? null;
  useEffect(() => {
    if (!isSupabaseConfigured || !userId) return;
    let active = true;
    const load = () =>
      fetchUserCards()
        .then((rows) => {
          if (active) setCards(rows);
        })
        .catch(() => {});
    load();
    const unsubscribe = subscribeUserCards(userId, load);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [userId]);

  if (!cards) return null;
  if (cards.length === 0)
    return <EmptyCollection onToast={onToast} onStartExample={() => setExampleFlow(true)} />;
  return (
    <CollectionStrip
      cards={cards}
      onToast={onToast}
      onOpenBinder={onOpenBinder}
      onFindSimilar={onFindSimilar}
      onViewSet={onViewSet}
      exampleFlow={exampleFlow}
      onExampleDone={() => setExampleFlow(false)}
    />
  );
}

/**
 * Signed-in but nothing owned yet: a slim on-ramp — try the example collection, scan with
 * tcgscan, or bootstrap from your own CSV. "Try it out!" prefills the import sheet with a bundled
 * ~200-card sample (see src/data/exampleCollection.ts) so a first-timer can go from nothing to a
 * built binder in two taps. (Guests see nothing here; realtime swaps this for the full strip the
 * moment the first card lands.)
 */
function EmptyCollection({
  onToast,
  onStartExample,
}: {
  onToast?: (message: string) => void;
  onStartExample?: () => void;
}) {
  const { isSignedIn } = useAuth();
  const [importOpen, setImportOpen] = useState(false);
  const [seedExample, setSeedExample] = useState(false);
  if (!isSignedIn) return null;
  const openExample = () => {
    setSeedExample(true);
    onStartExample?.();
    setImportOpen(true);
  };
  const openImport = () => {
    setSeedExample(false);
    setImportOpen(true);
  };
  return (
    <HomeSection title="My collection">
      <View style={styles.emptyRow}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.emptyRowText}>
          New here? Load an example collection to see how it works, or scan cards with{' '}
          <TcgscanLink /> and import your own CSV.
        </ThemedText>
        <Pressable
          onPress={openExample}
          style={({ pressed }) => [styles.buildChip, pressed && styles.pressed]}>
          <Text style={styles.buildChipText}>Try it out</Text>
        </Pressable>
        <Pressable onPress={openImport} style={({ pressed }) => [pillChip.base, pressed && styles.pressed]}>
          <Text style={pillChip.text}>Import CSV</Text>
        </Pressable>
      </View>
      <ImportCsvSheet
        visible={importOpen}
        onClose={() => setImportOpen(false)}
        initialCsv={seedExample ? EXAMPLE_COLLECTION_CSV : ''}
        initialName={seedExample ? EXAMPLE_COLLECTION_NAME : ''}
        intro={
          seedExample
            ? 'Step 1 of 3 · We filled in a sample of about 200 recent cards below. Tap Import to add them to your collection.'
            : undefined
        }
        onImported={(name, cardCount, copies) =>
          onToast?.(`Imported ${copies} cop${copies === 1 ? 'y' : 'ies'} into “${name}”`)
        }
      />
    </HomeSection>
  );
}

function CollectionStrip({
  cards,
  onToast,
  onOpenBinder,
  onFindSimilar,
  onViewSet,
  exampleFlow,
  onExampleDone,
}: {
  cards: UserCard[];
  onToast?: (message: string) => void;
  onOpenBinder?: (binderId: string) => void;
  onFindSimilar?: (cardIds: string[]) => void;
  onViewSet?: (cardId: string) => void;
  /** True right after the "Try it out!" example import — show the Build-binder next step. */
  exampleFlow?: boolean;
  /** Clear the onboarding flow (called once the example binder is built). */
  onExampleDone?: () => void;
}) {
  const store = useBinders();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Tap behaviour mirrors the card browser: a tap opens the card's ACTION MODAL; flip on
  // "Select multiple" and taps toggle a selection for the bulk action bar instead.
  const [multiMode, setMultiMode] = useState(false);
  const [actionCard, setActionCard] = useState<UserCard | null>(null);
  // Browse / search state: one carousel, the series→set drill, or by tcgscan portfolio.
  const [mode, setMode] = useState<ViewMode>(viewModePref);
  const switchMode = (m: ViewMode) =>
    setMode(() => {
      viewModePref = m; // session-sticky, mirrors the double-sided toggle pattern
      return m;
    });
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  // The catalog powers name/set search, the Sets drill, and the action modal's metadata —
  // loaded only when one of those is actually in play.
  const { catalog } = useCatalog(mode === 'sets' || q.length > 0 || actionCard != null);
  // tcgscan portfolios, fetched the first time that view opens.
  const [portfolios, setPortfolios] = useState<PortfolioGroup[] | null>(null);
  useEffect(() => {
    if (mode !== 'portfolios' || portfolios) return;
    let active = true;
    fetchPortfolioGroups()
      .then((g) => {
        if (active) setPortfolios(g);
      })
      .catch(() => {
        if (active) setPortfolios([]);
      });
    return () => {
      active = false;
    };
  }, [mode, portfolios]);
  // Which chooser is open: pick a binder to ADD the placeable selection to, or to RECLAIM the
  // single selected card from.
  const [chooser, setChooser] = useState<'add' | 'reclaim' | null>(null);
  // "+ New binder": the freshly created binder isn't in the store snapshot this render closed
  // over, so the add is parked here and fires once the binder shows up in userBinders.
  const [pendingAdd, setPendingAdd] = useState<{ binderId: string; ids: string[] } | null>(null);
  /* eslint-disable react-hooks/set-state-in-effect -- one-shot deferred store write, then cleared */
  useEffect(() => {
    if (!pendingAdd) return;
    if (!store.userBinders.some((b) => b.id === pendingAdd.binderId)) return;
    const { added } = store.addCardsToBinder(pendingAdd.binderId, pendingAdd.ids, {
      fromCollection: true,
    });
    setPendingAdd(null);
    if (added > 0) onToast?.(`Added ${added} card${added === 1 ? '' : 's'} to your new binder`);
  }, [pendingAdd, store, onToast]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // How many owned copies of each card sit in binders — only pockets placed FROM the
  // collection count (slot.fromCollection); cards added through general browsing are
  // aspirational and don't consume owned copies.
  const placedCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const binder of store.userBinders) {
      for (const page of binder.pages) {
        for (const slot of page.slots) {
          if (slot.cardId && slot.fromCollection)
            counts.set(slot.cardId, (counts.get(slot.cardId) ?? 0) + 1);
        }
      }
    }
    return counts;
  }, [store.userBinders]);

  const freeOf = (c: UserCard) => Math.max(0, c.quantity - (placedCounts.get(c.cardId) ?? 0));
  const copies = cards.reduce((n, c) => n + c.quantity, 0);
  const available = cards.reduce((n, c) => n + freeOf(c), 0);
  const headline = `${copies} card${copies === 1 ? '' : 's'} · ${available} available to place`;
  const [wizardOpen, setWizardOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  // Portfolio pending deletion (confirm dialog) — e.g. the "Try it out!" example cards.
  const [pfDelete, setPfDelete] = useState<{ id: string; name: string } | null>(null);
  const runDeletePortfolio = async () => {
    if (!pfDelete) return;
    const { id } = pfDelete;
    setPfDelete(null);
    try {
      await deletePortfolio(id);
      setPortfolios(null); // refetch the portfolio list; user_cards realtime refreshes the strip
      onToast?.('Portfolio deleted');
    } catch (e) {
      onToast?.((e as Error).message);
    }
  };
  const freeIds = cards.filter((c) => freeOf(c) > 0).map((c) => c.cardId);

  const toggle = (cardId: string) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });

  // A tap either opens the card's action modal (browser-style) or toggles the multi-selection.
  const pressTile = (card: UserCard) => {
    if (multiMode) toggle(card.cardId);
    else setActionCard(card);
  };

  // Search filter — name/set/series come from the catalog once it's in (id matching works cold).
  const filtered = useMemo(() => {
    if (!q) return cards;
    return cards.filter((c) => {
      if (c.cardId.includes(q)) return true;
      const cc = catalog?.getCard(c.cardId);
      if (!cc) return false;
      return (
        cc.name.toLowerCase().includes(q) ||
        cc.setName.toLowerCase().includes(q) ||
        cc.seriesId.toLowerCase().includes(q)
      );
    });
  }, [cards, q, catalog]);

  // The series → set drill (needs the catalog for the grouping metadata).
  const setGroups = useMemo(() => {
    if (mode !== 'sets' || !catalog) return null;
    const bySeries = new Map<
      string,
      { latest: string; sets: Map<string, { name: string; latest: string; cards: UserCard[] }> }
    >();
    for (const c of filtered) {
      const cc = catalog.getCard(c.cardId);
      const series = cc?.seriesId || 'Other';
      const setKey = cc?.setId || 'other';
      const rel = cc?.releaseDate || '';
      let s = bySeries.get(series);
      if (!s) {
        s = { latest: '', sets: new Map() };
        bySeries.set(series, s);
      }
      if (rel > s.latest) s.latest = rel;
      let st = s.sets.get(setKey);
      if (!st) {
        st = { name: cc?.setName || 'Unknown set', latest: '', cards: [] };
        s.sets.set(setKey, st);
      }
      if (rel > st.latest) st.latest = rel;
      st.cards.push(c);
    }
    return [...bySeries.entries()]
      .sort((a, b) => b[1].latest.localeCompare(a[1].latest))
      .map(([series, s]) => ({
        series,
        sets: [...s.sets.values()].sort((a, b) => b.latest.localeCompare(a.latest)),
      }));
  }, [mode, catalog, filtered]);

  // The by-portfolio view: each tcgscan collection's owned cards, plus an "unsorted" bucket
  // for inventory that isn't in any portfolio (CSV imports, manual adds).
  const portfolioGroups = useMemo(() => {
    if (mode !== 'portfolios' || !portfolios) return null;
    const byId = new Map(filtered.map((c) => [c.cardId, c]));
    const claimed = new Set<string>();
    const groups = portfolios
      .map((p) => {
        const members = [...p.quantities.keys()]
          .map((id) => byId.get(id))
          .filter((c): c is UserCard => !!c);
        for (const m of members) claimed.add(m.cardId);
        return { id: p.id, name: p.name, cards: members };
      })
      .filter((g) => g.cards.length > 0);
    const unsorted = filtered.filter((c) => !claimed.has(c.cardId));
    if (unsorted.length > 0) groups.push({ id: '__unsorted', name: 'Not in a portfolio', cards: unsorted });
    return groups;
  }, [mode, portfolios, filtered]);

  // Only cards with a free copy can be placed — an exhausted (0/n) selection is reclaim-only.
  const placeableIds = [...selected].filter((id) => {
    const card = cards.find((c) => c.cardId === id);
    return card ? freeOf(card) > 0 : false;
  });
  // Reclaim works on exactly one selected card that has copies sitting in binders.
  const reclaimId =
    selected.size === 1 && (placedCounts.get([...selected][0]) ?? 0) > 0 ? [...selected][0] : null;
  /** Binders holding collection-sourced copies of the reclaim card, with how many each. */
  const reclaimSources = reclaimId
    ? store.userBinders
        .map((b) => ({
          binder: b,
          count: b.pages.reduce(
            (n, p) =>
              n + p.slots.filter((s) => s.cardId === reclaimId && s.fromCollection).length,
            0,
          ),
        }))
        .filter((r) => r.count > 0)
    : [];

  const addTo = (binderId: string) => {
    const ids = placeableIds;
    setChooser(null);
    setSelected(new Set());
    const { added } = store.addCardsToBinder(binderId, ids, { fromCollection: true });
    const title = store.userBinders.find((b) => b.id === binderId)?.title ?? 'binder';
    if (added > 0) onToast?.(`Added ${added} card${added === 1 ? '' : 's'} to ${title}`);
  };

  const addToNew = () => {
    const ids = placeableIds;
    setChooser(null);
    setSelected(new Set());
    const binder = store.createBinder({ title: 'My collection picks' });
    setPendingAdd({ binderId: binder.id, ids });
  };

  /** Take one copy of the selected card back out of `binderId` (its last placed pocket). */
  const reclaimFrom = (binderId: string) => {
    const cardId = reclaimId;
    setChooser(null);
    setSelected(new Set());
    if (!cardId) return;
    const binder = store.userBinders.find((b) => b.id === binderId);
    if (!binder) return;
    for (let pi = binder.pages.length - 1; pi >= 0; pi -= 1) {
      const page = binder.pages[pi];
      const slot = [...page.slots].reverse().find((s) => s.cardId === cardId && s.fromCollection);
      if (slot) {
        store.removeSlot(binder.id, page.id, slot.id);
        onToast?.(`Reclaimed from ${binder.title}. 1 more available to place`);
        return;
      }
    }
  };

  return (
    <HomeSection
      title="My collection"
      action={
        <View style={styles.headerAction}>
          <ThemedText type="small" themeColor="textSecondary">
            {headline}
          </ThemedText>
          {freeIds.length > 0 ? (
            <Pressable
              onPress={() => setWizardOpen(true)}
              style={({ pressed }) => [styles.buildChip, pressed && styles.pressed]}>
              <Text style={styles.buildChipText}>Build binder</Text>
            </Pressable>
          ) : null}
        </View>
      }>
      {exampleFlow && freeIds.length > 0 ? (
        <View style={styles.guideBanner}>
          <Text style={styles.guideText}>
            Step 2 of 3 · Your example cards are in. Build a binder to see them arranged into
            curated pages.
          </Text>
          <Pressable
            onPress={() => setWizardOpen(true)}
            style={({ pressed }) => [styles.buildChip, pressed && styles.pressed]}>
            <Text style={styles.buildChipText}>Build binder</Text>
          </Pressable>
        </View>
      ) : null}
      {/* Browse controls: view mode · multi-select toggle · search. */}
      <View style={styles.controlsRow}>
        {(
          [
            ['all', 'All'],
            ['sets', 'By set'],
            ['portfolios', 'Portfolios'],
          ] as const
        ).map(([m, label]) => (
          <Pressable
            key={m}
            onPress={() => switchMode(m)}
            style={[pillChip.base, mode === m && pillChip.active]}>
            <Text style={[pillChip.text, mode === m && pillChip.textActive]}>{label}</Text>
          </Pressable>
        ))}
        <Pressable
          onPress={() => {
            setMultiMode((v) => !v);
            setSelected(new Set());
          }}
          style={[pillChip.base, multiMode && pillChip.active]}>
          <Text style={[pillChip.text, multiMode && pillChip.textActive]}>
            {multiMode ? '✓ Select multiple' : '⊕ Select multiple'}
          </Text>
        </Pressable>
        <Pressable onPress={() => setImportOpen(true)} style={pillChip.base}>
          <Text style={pillChip.text}>Import</Text>
        </Pressable>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search your cards…"
          placeholderTextColor={Palette.muted3}
          autoCorrect={false}
          autoCapitalize="none"
          style={styles.search}
        />
      </View>
      {q && !catalog ? (
        <ThemedText type="small" themeColor="textSecondary">
          Loading card names for search…
        </ThemedText>
      ) : null}

      {mode === 'all' ? (
        filtered.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.emptyNote}>
            No cards match “{query.trim()}”.
          </ThemedText>
        ) : (
          <TileStrip
            cards={filtered}
            placedCounts={placedCounts}
            selected={selected}
            onPress={pressTile}
          />
        )
      ) : null}

      {mode === 'sets' ? (
        !setGroups ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.emptyNote}>
            Loading set data…
          </ThemedText>
        ) : (
          setGroups.map((sg) => (
            <View key={sg.series}>
              <ThemedText type="smallBold" style={styles.groupSeries}>
                {sg.series}
              </ThemedText>
              {sg.sets.map((st) => (
                <View key={`${sg.series}|${st.name}`}>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.groupSet}>
                    {st.name} · {st.cards.length}
                  </ThemedText>
                  <TileStrip
                    cards={st.cards}
                    placedCounts={placedCounts}
                    selected={selected}
                    onPress={pressTile}
                  />
                </View>
              ))}
            </View>
          ))
        )
      ) : null}

      {mode === 'portfolios' ? (
        !portfolioGroups ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.emptyNote}>
            Loading your portfolios…
          </ThemedText>
        ) : portfolioGroups.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.emptyNote}>
            No portfolios yet. Collections you make in <TcgscanLink /> appear here.
          </ThemedText>
        ) : (
          portfolioGroups.map((g) => (
            <View key={g.id}>
              <View style={styles.portfolioHead}>
                <ThemedText type="smallBold" style={styles.groupSeries}>
                  {g.name}
                  <ThemedText type="small" themeColor="textSecondary">
                    {'  '}· {g.cards.length} card{g.cards.length === 1 ? '' : 's'}
                  </ThemedText>
                </ThemedText>
                <Pressable onPress={() => setPfDelete({ id: g.id, name: g.name })} hitSlop={6}>
                  <Text style={styles.portfolioDelete}>Delete</Text>
                </Pressable>
              </View>
              <TileStrip
                cards={g.cards}
                placedCounts={placedCounts}
                selected={selected}
                onPress={pressTile}
              />
            </View>
          ))
        )
      ) : null}

      {selected.size > 0 ? (
        <View style={styles.actionRow}>
          {placeableIds.length > 0 ? (
            <Pressable
              onPress={() => setChooser('add')}
              style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}>
              <Text style={styles.actionBtnText}>
                Add {placeableIds.length} to binder ▸
              </Text>
            </Pressable>
          ) : null}
          {onFindSimilar ? (
            <Pressable
              onPress={() => {
                const ids = [...selected];
                setSelected(new Set());
                setMultiMode(false);
                onFindSimilar(ids);
              }}
              style={({ pressed }) => [styles.actionBtn, styles.reclaimBtn, pressed && styles.pressed]}>
              <Text style={styles.reclaimBtnText}>≈ Find similar</Text>
            </Pressable>
          ) : null}
          {reclaimId ? (
            <Pressable
              onPress={() => setChooser('reclaim')}
              style={({ pressed }) => [styles.actionBtn, styles.reclaimBtn, pressed && styles.pressed]}>
              <Text style={styles.reclaimBtnText}>Reclaim ▸</Text>
            </Pressable>
          ) : null}
          {placeableIds.length === 0 && !reclaimId && !onFindSimilar ? (
            <ThemedText type="small" themeColor="textSecondary">
              No free copies to place.
            </ThemedText>
          ) : null}
          <Pressable onPress={() => setSelected(new Set())} hitSlop={8}>
            <ThemedText type="small" themeColor="textSecondary">
              Clear
            </ThemedText>
          </Pressable>
        </View>
      ) : null}

      {actionCard ? (
        <CollectionCardModal
          card={actionCard}
          free={freeOf(actionCard)}
          placed={placedCounts.get(actionCard.cardId) ?? 0}
          catalogCard={catalog?.getCard(actionCard.cardId)}
          onAddToBinder={() => {
            setSelected(new Set([actionCard.cardId]));
            setActionCard(null);
            setChooser('add');
          }}
          onFindSimilar={
            onFindSimilar
              ? () => {
                  const id = actionCard.cardId;
                  setActionCard(null);
                  onFindSimilar([id]);
                }
              : undefined
          }
          onViewSet={
            onViewSet
              ? () => {
                  const id = actionCard.cardId;
                  setActionCard(null);
                  onViewSet(id);
                }
              : undefined
          }
          onReclaim={
            (placedCounts.get(actionCard.cardId) ?? 0) > 0
              ? () => {
                  setSelected(new Set([actionCard.cardId]));
                  setActionCard(null);
                  setChooser('reclaim');
                }
              : undefined
          }
          onClose={() => setActionCard(null)}
        />
      ) : null}

      {chooser === 'add' ? (
        <Modal visible transparent animationType="fade" onRequestClose={() => setChooser(null)}>
          <Pressable style={styles.backdrop} onPress={() => setChooser(null)}>
            <Pressable onPress={(e) => e.stopPropagation()} style={styles.chooserWrap}>
              <ThemedView type="backgroundElement" style={styles.chooser}>
                <ThemedText type="smallBold" style={styles.chooserTitle}>
                  Add {placeableIds.length} card{placeableIds.length === 1 ? '' : 's'} to…
                </ThemedText>
                {store.userBinders.map((b) => (
                  <Pressable
                    key={b.id}
                    onPress={() => addTo(b.id)}
                    style={({ pressed }) => [styles.chooserRow, pressed && styles.pressed]}>
                    <ThemedText type="small" numberOfLines={1}>
                      {b.title}
                    </ThemedText>
                  </Pressable>
                ))}
                <Pressable
                  onPress={addToNew}
                  style={({ pressed }) => [styles.chooserRow, pressed && styles.pressed]}>
                  <Text style={styles.chooserNew}>+ New binder</Text>
                </Pressable>
              </ThemedView>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}

      {pfDelete ? (
        <Modal visible transparent animationType="fade" onRequestClose={() => setPfDelete(null)}>
          <Pressable style={styles.backdrop} onPress={() => setPfDelete(null)}>
            <Pressable onPress={(e) => e.stopPropagation()} style={styles.chooserWrap}>
              <ThemedView type="backgroundElement" style={styles.chooser}>
                <ThemedText type="smallBold" style={styles.chooserTitle}>
                  Delete “{pfDelete.name}”?
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.pfDeleteBody}>
                  This removes the portfolio and its cards from your collection. Cards you already
                  placed in a binder stay there. This can’t be undone.
                </ThemedText>
                <View style={styles.pfDeleteBtns}>
                  <Pressable
                    onPress={() => setPfDelete(null)}
                    style={({ pressed }) => [styles.pfBtn, pressed && styles.pressed]}>
                    <ThemedText type="smallBold">Cancel</ThemedText>
                  </Pressable>
                  <Pressable
                    onPress={runDeletePortfolio}
                    style={({ pressed }) => [styles.pfBtn, styles.pfBtnDanger, pressed && styles.pressed]}>
                    <Text style={styles.pfBtnDangerText}>Delete</Text>
                  </Pressable>
                </View>
              </ThemedView>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}

      <BuildBinderSheet
        visible={wizardOpen}
        freeIds={freeIds}
        asDemo={exampleFlow}
        onClose={() => setWizardOpen(false)}
        onBuilt={(binderId, pageCount) => {
          onToast?.(
            exampleFlow
              ? `Step 3 of 3 · Built ${pageCount} page${pageCount === 1 ? '' : 's'}. Here is your first binder, curated from your collection.`
              : `Built ${pageCount} page${pageCount === 1 ? '' : 's'} from your collection`,
          );
          onExampleDone?.();
          onOpenBinder?.(binderId);
        }}
      />

      <ImportCsvSheet
        visible={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={(name, cardCount, copies) => {
          setPortfolios(null); // the new portfolio appears on the next Portfolios view
          onToast?.(`Imported ${copies} cop${copies === 1 ? 'y' : 'ies'} into “${name}”`);
        }}
      />

      {chooser === 'reclaim' ? (
        <Modal visible transparent animationType="fade" onRequestClose={() => setChooser(null)}>
          <Pressable style={styles.backdrop} onPress={() => setChooser(null)}>
            <Pressable onPress={(e) => e.stopPropagation()} style={styles.chooserWrap}>
              <ThemedView type="backgroundElement" style={styles.chooser}>
                <ThemedText type="smallBold" style={styles.chooserTitle}>
                  Reclaim one copy from…
                </ThemedText>
                {reclaimSources.map(({ binder, count }) => (
                  <Pressable
                    key={binder.id}
                    onPress={() => reclaimFrom(binder.id)}
                    style={({ pressed }) => [styles.chooserRow, pressed && styles.pressed]}>
                    <ThemedText type="small" numberOfLines={1}>
                      {binder.title}
                      <ThemedText type="small" themeColor="textSecondary">
                        {'  '}· {count} placed
                      </ThemedText>
                    </ThemedText>
                  </Pressable>
                ))}
              </ThemedView>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </HomeSection>
  );
}

/**
 * One strip of tiles — the building block of every view mode. A paging CAROUSEL when the tiles
 * overflow the width (‹ › arrows that wrap, dots, wheel paging on web — the BinderCarousel
 * pattern); a plain row when everything fits.
 */
function TileStrip({
  cards,
  placedCounts,
  selected,
  onPress,
}: {
  cards: UserCard[];
  placedCounts: Map<string, number>;
  selected: Set<string>;
  onPress: (card: UserCard) => void;
}) {
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const containerRef = useRef<View>(null);
  const [cardSize] = useCardSize();
  const gap = Spacing.two;
  // Tile width follows the app-wide card size (S/M/L) so the collection strip matches other surfaces.
  const tileW = Math.round(TILE_W * CARD_SIZE_SCALE[cardSize]);

  // Whole tiles per page from the measured width; each page spans exactly the container so
  // paging snaps cleanly.
  const perPage = width > 0 ? Math.max(2, Math.floor((width + gap) / (tileW + gap))) : 2;
  const pages: UserCard[][] = [];
  for (let i = 0; i < cards.length; i += perPage) pages.push(cards.slice(i, i + perPage));
  const pageCount = pages.length;
  const safePage = Math.min(page, Math.max(0, pageCount - 1));

  const goTo = (p: number) => {
    if (pageCount === 0) return;
    const next = ((p % pageCount) + pageCount) % pageCount; // wrap both directions
    scrollRef.current?.scrollTo({ x: next * width, animated: true });
    setPage(next);
  };

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width > 0) setPage(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  // Web: wheel pages the strip; at either end it falls through to normal page scroll.
  useEffect(() => {
    if (Platform.OS !== 'web' || pageCount <= 1 || width === 0) return;
    const el = containerRef.current as unknown as HTMLElement | null;
    if (!el) return;
    let cooldown = -Infinity;
    const onWheel = (e: WheelEvent) => {
      const delta = Math.abs(e.deltaX) >= Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (Math.abs(delta) < 2) return;
      const next = safePage + (delta > 0 ? 1 : -1);
      if (next < 0 || next >= pageCount) return;
      e.preventDefault();
      if (e.timeStamp - cooldown < 300) return;
      cooldown = e.timeStamp;
      scrollRef.current?.scrollTo({ x: next * width, animated: true });
      setPage(next);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [safePage, pageCount, width]);

  return (
    <View ref={containerRef} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumEnd}
        scrollEventThrottle={16}>
        {width > 0 &&
          pages.map((pg, pi) => (
            <View key={pi} style={[styles.carouselPage, { width, gap }]}>
              {pg.map((item) => (
                <CardTile
                  key={`${item.cardId}|${item.condition}`}
                  card={item}
                  placed={placedCounts.get(item.cardId) ?? 0}
                  selected={selected.has(item.cardId)}
                  tileW={tileW}
                  onPress={() => onPress(item)}
                />
              ))}
            </View>
          ))}
      </ScrollView>

      {pageCount > 1 ? (
        <>
          <Pressable
            onPress={() => goTo(safePage - 1)}
            hitSlop={8}
            accessibilityLabel="Previous cards"
            style={[styles.carouselArrow, styles.carouselArrowLeft]}>
            <Text style={styles.carouselArrowText}>‹</Text>
          </Pressable>
          <Pressable
            onPress={() => goTo(safePage + 1)}
            hitSlop={8}
            accessibilityLabel="More cards"
            style={[styles.carouselArrow, styles.carouselArrowRight]}>
            <Text style={styles.carouselArrowText}>›</Text>
          </Pressable>
          <View style={styles.carouselDots}>
            {pages.map((_, i) => (
              <View key={i} style={[styles.carouselDot, i === safePage && styles.carouselDotActive]} />
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

/**
 * The browser-style card sheet for a collection tile: image, metadata (once the catalog is in),
 * inventory line, then Add to a binder… / ≈ Find similar / View set / Reclaim… / Cancel.
 */
function CollectionCardModal({
  card,
  free,
  placed,
  catalogCard,
  onAddToBinder,
  onFindSimilar,
  onViewSet,
  onReclaim,
  onClose,
}: {
  card: UserCard;
  free: number;
  placed: number;
  catalogCard?: { name: string; setName: string; number: string; rarity: string; stage: string } | null;
  onAddToBinder: () => void;
  onFindSimilar?: () => void;
  onViewSet?: () => void;
  onReclaim?: () => void;
  onClose: () => void;
}) {
  const uri = cardThumbUrl(card.cardId, 245);
  const meta = catalogCard
    ? [catalogCard.setName, catalogCard.number].filter(Boolean).join(' · ')
    : 'Loading card details…';
  const sub = catalogCard
    ? [catalogCard.rarity, catalogCard.stage].filter(Boolean).join(' · ')
    : '';
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.cardModalWrap}>
          <ThemedView type="backgroundElement" style={styles.cardModal}>
            <View style={styles.cardModalImageWrap}>
              {uri ? (
                <Image
                  source={{ uri }}
                  style={styles.cardModalImage}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                  transition={100}
                  draggable={false}
                />
              ) : null}
            </View>
            <ThemedText type="smallBold" numberOfLines={1} style={styles.cardModalTitle}>
              {catalogCard?.name ?? `Card ${card.cardId}`}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {meta}
            </ThemedText>
            {sub ? (
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {sub}
              </ThemedText>
            ) : null}
            <ThemedText type="small" themeColor="textSecondary">
              You own {card.quantity} · {free} free to place
              {placed > 0 ? ` · ${placed} in binders` : ''}
            </ThemedText>

            <Pressable
              onPress={onAddToBinder}
              disabled={free === 0}
              style={({ pressed }) => [
                styles.actionBtn,
                styles.cardModalBtn,
                (pressed || free === 0) && styles.pressed,
              ]}>
              <Text style={styles.actionBtnText}>
                {free === 0 ? 'No free copies to place' : 'Add to a binder…'}
              </Text>
            </Pressable>
            {onFindSimilar ? (
              <Pressable
                onPress={onFindSimilar}
                style={({ pressed }) => [styles.cardModalSecondary, pressed && styles.pressed]}>
                <Text style={styles.cardModalSecondaryText}>≈ Find similar</Text>
              </Pressable>
            ) : null}
            {onViewSet ? (
              <Pressable
                onPress={onViewSet}
                style={({ pressed }) => [styles.cardModalSecondary, pressed && styles.pressed]}>
                <Text style={styles.cardModalSecondaryText}>View set</Text>
              </Pressable>
            ) : null}
            {onReclaim ? (
              <Pressable
                onPress={onReclaim}
                style={({ pressed }) => [styles.cardModalSecondary, pressed && styles.pressed]}>
                <Text style={styles.cardModalSecondaryText}>Reclaim from a binder…</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [styles.cardModalSecondary, pressed && styles.pressed]}>
              <Text style={styles.cardModalCancel}>Cancel</Text>
            </Pressable>
          </ThemedView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function CardTile({
  card,
  placed,
  selected,
  tileW,
  onPress,
}: {
  card: UserCard;
  placed: number;
  selected: boolean;
  tileW: number;
  onPress: () => void;
}) {
  const uri = cardThumbUrl(card.cardId, cardTierFor(tileW));
  const free = Math.max(0, card.quantity - placed);
  const exhausted = free === 0;
  return (
    <Pressable
      style={({ pressed }) => [styles.tile, { width: tileW }, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${free} of ${card.quantity} copies free to place`}>
      <View
        style={[
          styles.imageWrap,
          { width: tileW, height: Math.round(tileW * CARD_ASPECT) },
          selected && styles.imageWrapSelected,
        ]}>

        {uri ? (
          <Image
            source={{ uri }}
            style={[
              styles.image,
              exhausted && styles.imageExhausted,
              // Web: desaturate exhausted cards ("nothing left to place"). No-op on native.
              exhausted && Platform.OS === 'web' ? ({ filter: 'grayscale(1)' } as object) : null,
            ]}
            contentFit="contain"
            cachePolicy="memory-disk"
            recyclingKey={card.cardId}
            transition={100}
            draggable={false}
          />
        ) : (
          <CardPlaceholder radius={Radius.control} />
        )}
        <View style={[styles.countBadge, exhausted && styles.countBadgeExhausted]}>
          <Text style={styles.countText}>
            {free}/{card.quantity}
          </Text>
        </View>
        {selected ? (
          <View style={styles.checkBadge}>
            <Text style={styles.checkText}>✓</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  carouselPage: { flexDirection: 'row', paddingVertical: Spacing.one },
  carouselArrow: {
    position: 'absolute',
    top: '50%',
    marginTop: -22,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.scrim40,
  },
  carouselArrowLeft: { left: 2 },
  carouselArrowRight: { right: 2 },
  carouselArrowText: { color: Palette.white, fontSize: FontSize.nav, lineHeight: 28, fontWeight: Weight.semibold },
  carouselDots: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.one, marginTop: 2 },
  carouselDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Palette.hairlineStrong },
  carouselDotActive: { backgroundColor: Palette.accent },
  tile: { width: TILE_W },
  pressed: { opacity: 0.8 },
  imageWrap: {
    width: TILE_W,
    height: TILE_W * CARD_ASPECT,
    borderRadius: Radius.control,
    backgroundColor: Palette.panel,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  imageWrapSelected: { borderColor: Palette.accent },
  image: { width: '100%', height: '100%' },
  imageExhausted: { opacity: 0.45 },
  countBadge: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.pill,
    backgroundColor: Palette.scrim62,
  },
  countBadgeExhausted: { backgroundColor: Palette.scrim45 },
  countText: { color: Palette.white, fontSize: FontSize.xs, fontWeight: Weight.bold },
  checkBadge: {
    position: 'absolute',
    left: 4,
    top: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkText: { color: Palette.accentText, fontSize: FontSize.xs, fontWeight: Weight.bold },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, marginTop: Spacing.two },
  actionBtn: {
    backgroundColor: Palette.accent,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  actionBtnText: { color: Palette.accentText, fontSize: FontSize.control, fontWeight: Weight.semibold },
  reclaimBtn: { backgroundColor: Palette.panel },
  reclaimBtnText: { color: Palette.ink2, fontSize: FontSize.control, fontWeight: Weight.semibold },
  headerAction: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  buildChip: {
    backgroundColor: Palette.accent,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.three,
    paddingVertical: 5,
  },
  buildChipText: { color: Palette.accentText, fontSize: FontSize.sm, fontWeight: Weight.semibold },
  backdrop: {
    flex: 1,
    backgroundColor: Palette.scrim45,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  chooserWrap: { width: '100%', maxWidth: 360 },
  chooser: { borderRadius: Radii.page, padding: Spacing.four, gap: Spacing.one },
  chooserTitle: { marginBottom: Spacing.two },
  chooserRow: { paddingVertical: Spacing.two },
  chooserNew: { color: Palette.accent, fontSize: FontSize.control, fontWeight: Weight.semibold },
  controlsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.two,
    marginBottom: Spacing.one,
  },
  search: {
    flex: 1,
    minWidth: 150,
    borderWidth: 1,
    borderColor: Palette.controlBorder,
    borderRadius: Radius.control,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: FontSize.control,
    color: Palette.ink,
  },
  emptyNote: { paddingVertical: Spacing.two },
  emptyRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.three },
  emptyRowText: { flexShrink: 1, minWidth: 220 },
  guideBanner: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.three,
    marginBottom: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.control,
    borderLeftWidth: 3,
    borderLeftColor: Palette.accent,
    backgroundColor: Palette.panel,
  },
  guideText: { flex: 1, minWidth: 200, color: Palette.accent, fontSize: FontSize.sm, lineHeight: 18, fontWeight: Weight.semibold },
  portfolioHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  portfolioDelete: { color: Palette.danger, fontSize: FontSize.sm, fontWeight: Weight.semibold },
  pfDeleteBody: { lineHeight: 18, marginTop: Spacing.one },
  pfDeleteBtns: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.two, marginTop: Spacing.three },
  pfBtn: { paddingVertical: Spacing.two, paddingHorizontal: Spacing.four, borderRadius: Radius.control },
  pfBtnDanger: { backgroundColor: Palette.danger },
  pfBtnDangerText: { color: Palette.white, fontSize: FontSize.sm, fontWeight: Weight.semibold },
  groupSeries: { marginTop: Spacing.three },
  groupSet: { marginTop: Spacing.one },
  cardModalWrap: { width: '100%', maxWidth: 320 },
  cardModal: { borderRadius: Radii.page, padding: Spacing.four, gap: Spacing.two },
  cardModalImageWrap: { alignItems: 'center' },
  cardModalImage: { width: 180, height: 180 * CARD_ASPECT },
  cardModalTitle: { marginTop: Spacing.one },
  cardModalBtn: { alignItems: 'center', marginTop: Spacing.two },
  cardModalSecondary: {
    borderWidth: 1,
    borderColor: Palette.controlBorder,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.two,
    alignItems: 'center',
  },
  cardModalSecondaryText: { color: Palette.accent, fontSize: FontSize.control, fontWeight: Weight.semibold },
  cardModalCancel: { color: Palette.muted, fontSize: FontSize.control, fontWeight: Weight.semibold },
});
