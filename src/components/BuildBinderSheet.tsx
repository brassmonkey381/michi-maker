/**
 * "Build a binder" wizard — proposes michi-method pages from the FREE copies in the user's
 * collection (see src/data/binderWizard.ts), lets them tick which theme pages to keep and
 * whether to sweep the remainder into colour-blocked bulk pages, then creates the whole binder
 * in one atomic store commit and opens it. Every pocket carries collection provenance.
 *
 * Needs the catalog (a signed-in perk) to read species/artist/set metadata — same gating story
 * as the ✨ Fill sheet.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { fetchCardDetail, type CardDetail } from 'tcgscan-browse';

import { SignInPerk } from '@/components/auth/SignInPerk';
import { TcgscanSynergyNote } from '@/components/monetization/BundleOffer';
import { CapGateOffer } from '@/components/monetization/CapGateOffer';
import { trialOfferVisible } from '@/components/monetization/TrialCta';
import { LogoLoader } from '@/components/brand/LogoLoader';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontSize, Palette, Radii, Radius, Spacing, Weight } from '@/constants/theme';
import {
  DEFAULT_SHAPE,
  WIZARD_SHAPES,
  buildPages,
  capProposals,
  proposePages,
  wizardMaxPages,
  type FreeCard,
  type PageShape,
  type WizardProposal,
} from '@/data/binderWizard';
import { binderLimitMessage, binderTrialMessage } from '@/data/limitMessages';
import { useCatalog } from '@/hooks/use-catalog';
import { useTrial } from '@/hooks/use-trial';
import { track, trackCapGate, trackCapGateDismissed } from '@/lib/analytics';
import { usePriceSummary } from '@/lib/prices';
import { useBinders } from '@/store/binders';

export function BuildBinderSheet({
  visible,
  freeCards,
  onClose,
  onBuilt,
  asDemo = false,
}: {
  visible: boolean;
  /** Cards with at least one unplaced copy, paired with their free-copy count. Curated pages take
   *  one copy each; extra copies flow into the bulk sweep. */
  freeCards: FreeCard[];
  onClose: () => void;
  /** Called with the new binder's id (the parent navigates + toasts). */
  onBuilt: (binderId: string, pageCount: number) => void;
  /** Build a read-only DEMO binder (the "Try it out!" showcase) — free of the binder cap, not
   *  editable or shareable, at most one per account. Defaults to a normal, editable binder. */
  asDemo?: boolean;
}) {
  const store = useBinders();
  const { catalog, guestGated } = useCatalog(visible);
  // Prices power the Chase board (most-valuable-first page). The summary is a shared
  // load-once fetch that resolves well before the catalog parse; if it ever fails the plan
  // simply proposes without a chase page rather than blocking the wizard.
  const priceSummary = usePriceSummary();

  // Evolution families (id → ordered species) for the free pool. The slim catalog no longer ships
  // evolutionLine in bulk (it's lazy-loaded via rpc/card_detail), so without this every card reads
  // evolutionLine: [] and the wizard proposes NO evolution pages. Fetch it here — chunked at the
  // RPC's 50-id cap, cached forever — and feed it into proposePages. Fails soft to an empty map.
  const freeIdsKey = useMemo(() => freeCards.map((f) => f.id).join(','), [freeCards]);
  const [evoLines, setEvoLines] = useState<ReadonlyMap<string, string[]>>(new Map());
  useEffect(() => {
    if (!visible) return;
    const ids = freeIdsKey ? freeIdsKey.split(',') : [];
    if (ids.length === 0) return;
    let active = true;
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += 50) chunks.push(ids.slice(i, i + 50));
    Promise.all(chunks.map((c) => fetchCardDetail(c).catch((): Record<string, CardDetail> => ({}))))
      .then((results) => {
        if (!active) return;
        const m = new Map<string, string[]>();
        for (const r of results)
          for (const [id, d] of Object.entries(r)) if (d.evolutionLine.length > 0) m.set(id, d.evolutionLine);
        if (m.size > 0) setEvoLines(m);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [visible, freeIdsKey]);

  // The page the binder is being built for. It changes the plan, not just the drawing: a cluster
  // fills one page, so a 3×4 gathers twelve-card themes where a 3×3 gathers nine.
  const [shape, setShape] = useState<PageShape>(DEFAULT_SHAPE);

  const rawPlan = useMemo(
    () =>
      visible && catalog
        ? proposePages(freeCards, catalog, priceSummary, evoLines, shape)
        : null,
    [visible, catalog, priceSummary, freeCards, evoLines, shape],
  );
  // Hold the "Reading your collection…" state for a deliberate minimum so the build
  // animation is actually seen — the plan itself computes near-instantly on a warm catalog.
  // (Effective wait = max(catalog load, this floor).) Tune or drop MIN_LOADER_MS freely.
  const MIN_LOADER_MS = 3500;
  const [minElapsed, setMinElapsed] = useState(false);
  useEffect(() => {
    if (!visible) return;
    const id = setTimeout(() => setMinElapsed(true), MIN_LOADER_MS);
    return () => {
      clearTimeout(id);
      setMinElapsed(false);
    };
  }, [visible]);
  const plan = rawPlan && minElapsed ? rawPlan : null;

  // Ticked theme pages (default: all proposed) + the bulk sweep toggle.
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [bulkOn, setBulkOn] = useState(true);
  const togglePage = (key: string) =>
    setExcluded((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const chosenThemes = plan ? plan.proposals.filter((p) => !excluded.has(p.key)) : [];
  const chosenRaw: WizardProposal[] = [...chosenThemes, ...(bulkOn && plan ? plan.bulk : [])];
  // Cap the build at a sensible page ceiling (grass bulk goes first, then the rest of the bulk,
  // then evolution pages — see capProposals). The ceiling is the wizard's own taste call capped
  // by THIS user's per-binder page limit, so a build never lands over the tier's cap.
  const maxPages = wizardMaxPages(store.limits.pagesPerBinder);
  const chosen = capProposals(chosenRaw, maxPages);
  const trimmed = chosenRaw.length - chosen.length;
  const cardTotal = chosen.reduce((n, p) => n + p.cardIds.length, 0);
  // A build adds a binder — demo builds ("Try it out!") sit outside the cap, like the store's own
  // createBinder guard. At the cap the button goes quiet and the perk note explains why.
  const atBinderLimit = !asDemo && store.atBinderLimit;

  // Read only for the `offer` prop on the impression below: what a wall put in front of someone is
  // not recoverable after the fact. Held as the boolean rather than the object so the effect does
  // not re-run on every render (useTrial returns a fresh object each time).
  const offersTrial = trialOfferVisible(useTrial());

  // The wizard is the one michi gate with a real "backed out" signal: the wall is a persistent
  // perk inside a sheet the user can close, rather than a toast that always auto-expires. So this
  // is the only place a shown/dismissed pair carries information — see the note in ANALYTICS-
  // CAP-GATES.md about not emitting dismissals for non-interactive toasts.
  const capShown = useRef(false);
  useEffect(() => {
    if (!visible || !atBinderLimit) return;
    if (capShown.current) return; // once per appearance, not once per re-render
    capShown.current = true;
    trackCapGate({
      limit: 'binders',
      surface: 'build_wizard',
      tier: store.tier,
      used: store.binderCount,
      cap: store.limits.binders,
      // Neither a dialog nor a toast: a note inside a sheet they already had open. See `as`.
      as: 'inline',
      is_guest: store.tier === 'guest',
      // The same three-way branch the markup below draws, from the same predicate, so the event
      // and the screen cannot disagree about what was offered.
      offer: store.tier === 'guest' ? 'signin' : offersTrial ? 'trial' : 'upgrade',
    });
  }, [visible, atBinderLimit, store.tier, store.binderCount, store.limits.binders, offersTrial]);
  useEffect(() => {
    if (visible) return;
    // Closed. If the wall was shown and no binder was built, that is a dismissal; a successful
    // build clears the flag first (see build()), so this cannot fire on the converting path.
    if (capShown.current) trackCapGateDismissed({ limit: 'binders', surface: 'build_wizard', via: 'close' });
    capShown.current = false;
  }, [visible]);

  const build = () => {
    if (chosen.length === 0) return;
    const binder = store.createBinder({
      title: asDemo ? 'Example binder' : 'From my collection',
      pages: buildPages(chosen, shape),
      isDemo: asDemo || undefined,
    });
    // The store refuses past the binder cap — leave the sheet open on the perk note below.
    if (!binder) return;
    capShown.current = false; // built successfully; the close below is not a dismissal
    if (asDemo) track('demo.curation', { pages: chosen.length });
    onBuilt(binder.id, chosen.length);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.cardWrap}>
          <ThemedView type="backgroundElement" style={styles.card}>
            <View style={styles.header}>
              <ThemedText type="subtitle" style={styles.title}>
                Build a binder
              </ThemedText>
              <Pressable onPress={onClose} hitSlop={8}>
                <ThemedText type="link" themeColor="textSecondary">
                  Close
                </ThemedText>
              </Pressable>
            </View>

            {guestGated ? (
              <SignInPerk message="Building from your collection reads the full card catalog. Sign in (free) to use it." />
            ) : !plan ? (
              <View style={styles.center}>
                <LogoLoader label="Reading your collection…" />
              </View>
            ) : plan.proposals.length === 0 && plan.bulk.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                Nothing left to place. Every owned copy is already in a binder.
              </ThemedText>
            ) : (
              <>
                <ThemedText type="small" themeColor="textSecondary" style={styles.sub}>
                  Theme pages found in your unplaced cards, evolution lines, single species,
                  artists, colours and more. Untick any you don’t want. Each page is composed
                  around its cards, with room set aside for your own art, and Reclaim can take any
                  card back out. Where a theme runs out of cards the pockets stay open — tap one
                  later to browse, or use Fill to finish the page.
                </ThemedText>

                {/* THE PAGE, chosen before the pages are read — a 12-pocket binder should be
                    planned for twelve, not laid out for nine and left short. Above the list
                    because changing it re-plans everything below. */}
                <View style={styles.shapeRow}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Page
                  </ThemedText>
                  {WIZARD_SHAPES.map((opt) => {
                    const on = opt.shape.rows === shape.rows && opt.shape.cols === shape.cols;
                    return (
                      <Pressable
                        key={opt.label}
                        onPress={() => setShape(opt.shape)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: on }}
                        style={({ pressed }) => [
                          styles.shapeChip,
                          on && styles.shapeChipOn,
                          pressed && styles.shapePressed,
                        ]}>
                        <ThemedText
                          type="small"
                          style={[styles.shapeChipText, on && styles.shapeChipTextOn]}>
                          {opt.label}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </View>

                {trimmed > 0 ? (
                  <ThemedText type="small" themeColor="textSecondary" style={styles.trimNote}>
                    Capped at {maxPages} pages, {trimmed} extra bulk/evolution page
                    {trimmed === 1 ? '' : 's'} left out. Untick pages above to swap which ones make it in.
                  </ThemedText>
                ) : null}

                <TcgscanSynergyNote />

                <ScrollView style={styles.list}>
                  {plan.proposals.map((p) => {
                    const on = !excluded.has(p.key);
                    return (
                      <Pressable
                        key={p.key}
                        onPress={() => togglePage(p.key)}
                        style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
                        <View style={[styles.check, on && styles.checkOn]}>
                          {on ? <Text style={styles.checkMark}>✓</Text> : null}
                        </View>
                        <View style={styles.rowText}>
                          <ThemedText type="smallBold" numberOfLines={1}>
                            {p.title}
                            <ThemedText type="small" themeColor="textSecondary">
                              {'  '}· {p.cardIds.length} cards
                            </ThemedText>
                          </ThemedText>
                          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                            {p.blurb}
                          </ThemedText>
                        </View>
                      </Pressable>
                    );
                  })}

                  {plan.bulk.length > 0 ? (
                    <Pressable
                      onPress={() => setBulkOn((v) => !v)}
                      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
                      <View style={[styles.check, bulkOn && styles.checkOn]}>
                        {bulkOn ? <Text style={styles.checkMark}>✓</Text> : null}
                      </View>
                      <View style={styles.rowText}>
                        <ThemedText type="smallBold" numberOfLines={1}>
                          Bulk sweep
                          <ThemedText type="small" themeColor="textSecondary">
                            {'  '}· {plan.bulk.length} page{plan.bulk.length === 1 ? '' : 's'}
                          </ThemedText>
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                          Everything else, colour-blocked by energy type.
                        </ThemedText>
                      </View>
                    </Pressable>
                  ) : null}
                </ScrollView>

                {atBinderLimit ? (
                  store.tier === 'guest' ? (
                    <SignInPerk message={binderLimitMessage(store.tier, store.limits)} />
                  ) : (
                    <CapGateOffer
                      message={binderLimitMessage(store.tier, store.limits)}
                      trialMessage={binderTrialMessage(store.limits)}
                      surface="build_wizard"
                      onBeforePress={() => {
                        // They pressed the offer. Clear the flag BEFORE closing, or the close
                        // effect above records a dismissal against someone who converted --
                        // the same mistake the cap dialog's single onClose used to make.
                        capShown.current = false;
                        onClose();
                      }}
                    />
                  )
                ) : null}

                <Pressable
                  onPress={build}
                  disabled={chosen.length === 0 || atBinderLimit}
                  style={({ pressed }) => [
                    styles.buildBtn,
                    (pressed || chosen.length === 0 || atBinderLimit) && styles.pressed,
                  ]}>
                  <Text style={styles.buildBtnText}>
                    Build binder · {chosen.length} page{chosen.length === 1 ? '' : 's'}, {cardTotal}{' '}
                    cards
                  </Text>
                </Pressable>
              </>
            )}
          </ThemedView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  shapeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginBottom: Spacing.three,
  },
  shapeChip: {
    paddingVertical: 5,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
  },
  shapeChipOn: { backgroundColor: Palette.accent, borderColor: Palette.accent },
  shapeChipText: { color: Palette.ink2, fontWeight: Weight.semibold },
  shapeChipTextOn: { color: Palette.accentText },
  shapePressed: { opacity: 0.7 },
  backdrop: {
    flex: 1,
    backgroundColor: Palette.scrim45,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  cardWrap: { width: '100%', maxWidth: 460 },
  card: { borderRadius: Radii.page, padding: Spacing.four, gap: Spacing.three, maxHeight: '100%' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: FontSize.h2, lineHeight: 26 },
  sub: { lineHeight: 20 },
  trimNote: { lineHeight: 18, fontStyle: 'italic' },
  center: { paddingVertical: Spacing.four, alignItems: 'center', gap: Spacing.two },
  list: { maxHeight: 380 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
  },
  rowText: { flex: 1, gap: 1 },
  check: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: Palette.hairlineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: Palette.accent, borderColor: Palette.accent },
  checkMark: { color: Palette.accentText, fontSize: FontSize.sm, fontWeight: Weight.bold },
  pressed: { opacity: 0.7 },
  buildBtn: {
    backgroundColor: Palette.accent,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  buildBtnText: { color: Palette.accentText, fontSize: FontSize.md, fontWeight: Weight.semibold },
});
