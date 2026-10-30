/**
 * COMPLETE PAGE SHEET (owner, 2026-10-22): the page's empty pockets filled from what the page
 * already holds, one preview per fill (data/pageCompleter), the placed cards never moving. Tapping
 * a preview places exactly the new cards, one Undo. Arrange is a separate tap, by the owner's
 * decision ("arrange comes later").
 *
 * The similarity fill is Find Similar under another name, so it carries the same PRO wall the
 * browser shows; every other fill is free and runs on the device.
 *
 * A GUEST COMPLETES ONCE WITHOUT THE CATALOG (docs/GUEST-FILL-PLAN.md, owner 2026-10-30: "Fill is
 * the same as complete"). The page's cards come by id, each fill's candidates from the server
 * (data/guestFill), into a stub catalogue the unchanged completer reads. The tap that places a fill
 * takes the one `fillPage` taste the Fill sheet shares; after it, the free-account wall.
 */
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { cardThumbUrl, findSimilarToMany, loadColorIndex } from 'tcgscan-browse';

import { SignInPerk } from '@/components/auth/SignInPerk';
import { LogoLoader } from '@/components/brand/LogoLoader';
import { ThemedText } from '@/components/themed-text';
import { DialogCard } from '@/components/ui/DialogCard';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { occupiedCells, type DemoPage } from '@/data/binderTypes';
import { fetchCompleteCandidates, fetchPageCards, guestProviders } from '@/data/guestFill';
import { GUEST_COMPLETE_METHODS } from '@/data/guestFillQuery';
import type { ComposePlacement } from '@/data/pageComposer';
import { cardsOnPage, COMPLETE_METHODS, completeMethodsFor, completePage, emptyPockets, type CompleteMethod } from '@/data/pageCompleter';
import { catalogFromCards, type CardStore } from '@/data/stubCatalog';
import { guestTasteWall, type TasteFeature } from '@/data/tastes';
import type { CatalogCard } from '@/lib/catalog';
import { useCatalog } from '@/hooks/use-catalog';
import { useTier } from '@/hooks/use-tier';
import { useBinders } from '@/store/binders';
import { track } from '@/lib/analytics';
import { themeFill } from '@/lib/themeFill';
import { useLanguagePref } from '@/store/languagePref';

type FillPreview = { method: CompleteMethod; placements: ComposePlacement[] | null; failed?: boolean };

export function CompletePageSheet({
  visible,
  page,
  onClose,
  onPlaced,
  onSimilarLocked,
  onTasted,
}: {
  visible: boolean;
  page: DemoPage;
  onClose: () => void;
  /** The new cards for the empty pockets; the screen owns the store write and the toast. */
  onPlaced: (placements: ComposePlacement[], methodLabel: string) => void;
  /** A free or guest user tapped the similarity fill: the same wall Find Similar shows. */
  onSimilarLocked?: () => void;
  /** A free taste was just taken by a tap in here; the editor shows its toast. */
  onTasted?: (feature: TasteFeature) => void;
}) {
  const { catalog, guestGated } = useCatalog(visible);
  // The auth-based gate, not the tier, which reads 'guest' for a beat while a member's entitlements load.
  const guest = guestGated;
  const { hasFindSimilar: tierFindSimilar } = useTier();
  const { taste } = useBinders();
  // THE SERVER FILLS, Same theme and Like the whole page, are PRO for a member; a free account
  // spends a fillPage sample on each pick (owner, 2026-10-30: "3 free uses max too for theme
  // complete and similar complete"). Previews run while a sample is left; none left locks both.
  const SERVER: readonly CompleteMethod[] = ['theme', 'similar'];
  const serverFills = tierFindSimilar || taste.offer('fillPage');
  const [languages] = useLanguagePref();
  const pageKey = `${page.id}:${page.slots.map((s) => `${s.id}@${s.row},${s.col}`).join('|')}`;
  // A guest's catalogue: the page's cards by id, then each fill's candidates as they are fetched.
  const [guestStore, setGuestStore] = useState<{ key: string; store: CardStore } | null>(null);
  useEffect(() => {
    if (!visible || !guest || guestStore?.key === pageKey) return;
    let live = true;
    fetchPageCards(page)
      .then((cards) => { if (live) setGuestStore({ key: pageKey, store: catalogFromCards(cards) }); })
      .catch(() => { if (live) setGuestStore({ key: pageKey, store: catalogFromCards([]) }); });
    return () => { live = false; };
  }, [visible, guest, pageKey, guestStore?.key, page]);
  const cat = guest ? (guestStore?.key === pageKey ? guestStore.store : null) : catalog;
  // One fill for a guest, ever on this device: open this visit, or still on offer.
  const guestFillOpen = guest && (taste.active('fillPage') || taste.offer('fillPage'));
  const methods = useMemo(
    () => (cat ? completeMethodsFor(page, cat).filter((m) => !guest || GUEST_COMPLETE_METHODS.includes(m)) : []),
    [cat, page, guest],
  );
  const empties = useMemo(() => emptyPockets(page).length, [page]);
  // A fill with no entry yet is pending; entries land one by one as the fills answer.
  const [previews, setPreviews] = useState<{ key: string; byMethod: Map<CompleteMethod, FillPreview> } | null>(null);

  // Every fill runs as soon as the sheet opens, independently, and lands as it arrives.
  useEffect(() => {
    if (!visible || !cat || !methods.length || (guest && !guestFillOpen)) return;
    let active = true;
    track('complete_open', { pockets: page.slots.length, empties, methods: methods.length, guest });
    const byMethod = new Map<CompleteMethod, FillPreview>();
    // A guest's store learns the ranked fills' cards from their answers (guestProviders) and the
    // scanned fills' candidates from one filter each, before the completer looks anything up.
    const learn = (cards: readonly CatalogCard[]) => (cat as CardStore).add?.(cards);
    const onPage = guest ? cardsOnPage(page, cat) : [];
    for (const m of methods) {
      if (SERVER.includes(m) && !serverFills && !guest) continue;
      const base = {
        similar: (ids: string[], limit: number) => findSimilarToMany(ids, limit, { languages }),
        theme: (ids: string[], limit: number, fullArt: boolean | undefined) => themeFill(ids, limit, { fullArt }),
      };
      const providers = guest ? guestProviders(base, learn) : base;
      const run = m === 'palette'
        ? loadColorIndex().then((index) => completePage(m, page, cat, { ...providers, palette: index ?? undefined }))
        : guest
          ? fetchCompleteCandidates(m, onPage, languages).then((cards) => { learn(cards); return completePage(m, page, cat, providers); })
          : completePage(m, page, cat, providers);
      run
        .then((placements) => {
          if (!active) return;
          byMethod.set(m, { method: m, placements });
          setPreviews({ key: pageKey, byMethod: new Map(byMethod) });
        })
        .catch(() => {
          if (!active) return;
          byMethod.set(m, { method: m, placements: [], failed: true });
          setPreviews({ key: pageKey, byMethod: new Map(byMethod) });
        });
    }
    return () => {
      active = false;
    };
    // The page key stands in for the page object: a page edited while the sheet was closed is read again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, cat, pageKey, methods, serverFills, languages, guest, guestFillOpen]);
  const shown = previews && previews.key === pageKey ? previews.byMethod : null;

  const pick = (m: CompleteMethod, placements: ComposePlacement[]) => {
    // The tap that places a fill spends the sample (a per-use taste): a guest's one fill, or a
    // free account's server fill. The editor shows the toast on the placement.
    if (guest || (SERVER.includes(m) && !tierFindSimilar)) {
      if (!taste.use('fillPage', 'complete_sheet')) return;
      onTasted?.('fillPage');
    }
    const label = COMPLETE_METHODS.find((x) => x.key === m)!.label;
    track('complete_pick', { method: m, placed: placements.length, empties, guest });
    onPlaced(placements, label);
    onClose();
  };

  return (
    <DialogCard visible={visible} title="Complete this page" onClose={onClose} maxWidth={640} scroll={false}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.lede}>
        The cards already here say what the empty pockets should hold. Tap a fill to place it; the placed cards stay where they are, and Undo takes the new ones out.
      </ThemedText>
      {guest && !guestFillOpen ? (
        // The guest's one fill is spent: the free account, and nothing about PRO.
        <SignInPerk surface="complete_wall" message={guestTasteWall('fillPage')} />
      ) : !cat ? (
        <View style={styles.loading}>
          <LogoLoader />
        </View>
      ) : !methods.length ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
          {empties ? 'Place at least one card first; the page needs something to read.' : 'The page is full. Clear a pocket or two first.'}
        </ThemedText>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.grid}>
          {COMPLETE_METHODS.filter((m) => methods.includes(m.key)).map((m) => {
            const p = shown?.get(m.key);
            // A guest's one fill covers the server fills too: no lock, no pill, no PRO.
            const locked = SERVER.includes(m.key) && !serverFills && !guest;
            const ready = !!p?.placements;
            const none = ready && p!.placements!.length === 0 && !locked;
            return (
              <Pressable
                key={m.key}
                disabled={!ready && !locked}
                onPress={() => (locked ? onSimilarLocked?.() : none ? undefined : pick(m.key, p!.placements!))}
                accessibilityRole="button"
                accessibilityLabel={`${m.label}. ${m.description}`}
                style={({ pressed }) => [styles.card, pressed && styles.pressed, none && styles.dimmed]}>
                <Preview page={page} placements={p?.placements ?? []} pending={!ready && !locked} />
                <View style={styles.titleRow}>
                  <ThemedText type="smallBold" numberOfLines={1} style={styles.cardTitle}>
                    {m.label}
                  </ThemedText>
                  {locked ? (
                    <View style={styles.proPill}>
                      <Text style={styles.proPillText}>PRO</Text>
                    </View>
                  ) : null}
                </View>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={2} style={styles.cardDesc}>
                  {locked ? (m.key === 'theme' ? 'The scene these cards share, for the whole page.' : 'Find Similar, for the whole page at once.') : none ? (p?.failed ? 'Could not reach the server.' : m.key === 'theme' ? 'No scene two of these cards share, or the server does not have theme fill yet.' : 'Nothing found for this page.') : m.description}
                </ThemedText>
                {ready && p!.placements!.length > 0 && p!.placements!.length < empties ? (
                  <ThemedText type="small" themeColor="textSecondary" style={styles.cardDesc}>
                    Fills {p!.placements!.length} of {empties} pockets.
                  </ThemedText>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </DialogCard>
  );
}

/** The page as a tiny grid: what is there in place, the new cards ringed, pending pockets hatched. */
function Preview({ page, placements, pending }: { page: DemoPage; placements: readonly ComposePlacement[]; pending: boolean }) {
  const have = new Map<string, string>();
  for (const s of page.slots) if (s.cardId) have.set(`${s.row},${s.col}`, s.cardId);
  const taken = occupiedCells(page);
  const fresh = new Map(placements.map((p) => [`${p.row},${p.col}`, p.cardId ?? '']));
  return (
    <View style={[styles.leaf, { aspectRatio: (page.cols * 2.5) / (page.rows * 3.5) }]}>
      {Array.from({ length: page.rows * page.cols }, (_, i) => {
        const k = `${Math.floor(i / page.cols)},${i % page.cols}`;
        const id = have.get(k) ?? fresh.get(k);
        return (
          <View key={k} style={[styles.cell, { width: `${100 / page.cols}%` }]}>
            {id ? (
              <Image source={{ uri: cardThumbUrl(id, 245) }} style={[styles.cellImg, fresh.has(k) && styles.cellFresh]} contentFit="cover" transition={0} />
            ) : taken.has(k) ? (
              <View style={styles.cellArt} />
            ) : (
              <View style={[styles.cellOpen, pending && styles.cellPending]} />
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  lede: { marginBottom: Spacing.three, lineHeight: 18 },
  empty: { paddingVertical: Spacing.four },
  loading: { paddingVertical: Spacing.five, alignItems: 'center' },
  scroll: { maxHeight: 520 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three, paddingBottom: Spacing.two },
  card: {
    flexGrow: 1,
    flexBasis: 270,
    maxWidth: 300,
    padding: Spacing.two,
    borderRadius: Radius.panel,
    borderWidth: 1,
    borderColor: Palette.controlBorder,
    backgroundColor: Palette.panelAlt,
    gap: Spacing.one,
  },
  pressed: { opacity: 0.85 },
  dimmed: { opacity: 0.55 },
  leaf: { flexDirection: 'row', flexWrap: 'wrap', borderRadius: Radius.sm, overflow: 'hidden', backgroundColor: Palette.hairline },
  cell: { aspectRatio: 2.5 / 3.5, padding: 1 },
  cellImg: { width: '100%', height: '100%', borderRadius: 2 },
  cellFresh: { borderWidth: 2, borderColor: Palette.accent },
  cellArt: { width: '100%', height: '100%', borderRadius: 2, backgroundColor: Palette.accentSoft, opacity: 0.8 },
  cellOpen: { width: '100%', height: '100%', borderRadius: 2, borderWidth: 1, borderStyle: 'dashed', borderColor: Palette.controlBorder },
  cellPending: { backgroundColor: Palette.panel },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginTop: Spacing.one },
  cardTitle: { flexShrink: 1 },
  cardDesc: { lineHeight: 15 },
  proPill: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: Radius.tag, backgroundColor: Palette.accent },
  proPillText: { fontSize: FontSize.tag, fontWeight: Weight.bold, color: Palette.accentText },
});
