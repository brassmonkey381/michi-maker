/**
 * "Build a binder" wizard — proposes michi-method pages from the FREE copies in the user's
 * collection (see src/data/binderWizard.ts), lets them tick which theme pages to keep and
 * whether to sweep the remainder into colour-blocked bulk pages, then creates the whole binder
 * in one atomic store commit and opens it. Every pocket carries collection provenance.
 *
 * Needs the catalog (a signed-in perk) to read species/artist/set metadata — same gating story
 * as the ✨ Fill sheet.
 */
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { SignInPerk } from '@/components/auth/SignInPerk';
import { TcgscanSynergyNote } from '@/components/monetization/BundleOffer';
import { LogoLoader } from '@/components/brand/LogoLoader';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontSize, Palette, Radii, Radius, Spacing, Weight } from '@/constants/theme';
import { buildPages, capProposals, proposePages, WIZARD_MAX_PAGES, type WizardProposal } from '@/data/binderWizard';
import { useCatalog } from '@/hooks/use-catalog';
import { usePriceSummary } from '@/lib/prices';
import { useBinders } from '@/store/binders';

export function BuildBinderSheet({
  visible,
  freeIds,
  onClose,
  onBuilt,
}: {
  visible: boolean;
  /** Card ids with at least one unplaced copy. */
  freeIds: string[];
  onClose: () => void;
  /** Called with the new binder's id (the parent navigates + toasts). */
  onBuilt: (binderId: string, pageCount: number) => void;
}) {
  const store = useBinders();
  const { catalog, guestGated } = useCatalog(visible);
  // Prices power the Chase board (most-valuable-first page). The summary is a shared
  // load-once fetch that resolves well before the catalog parse; if it ever fails the plan
  // simply proposes without a chase page rather than blocking the wizard.
  const priceSummary = usePriceSummary();

  const rawPlan = useMemo(
    () => (visible && catalog ? proposePages(freeIds, catalog, priceSummary) : null),
    [visible, catalog, priceSummary, freeIds],
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
  // then evolution pages — see capProposals). Keeps a fresh build from ballooning past the
  // free-tier page limit.
  const chosen = capProposals(chosenRaw);
  const trimmed = chosenRaw.length - chosen.length;
  const cardTotal = chosen.reduce((n, p) => n + p.cardIds.length, 0);

  const build = () => {
    if (chosen.length === 0) return;
    const binder = store.createBinder({ title: 'From my collection', pages: buildPages(chosen) });
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
                  Theme pages found in your unplaced cards. Untick any you don’t want. Each page
                  leaves a “Your Art Here” gap for your own art, and Reclaim can take any card
                  back out.
                </ThemedText>

                {trimmed > 0 ? (
                  <ThemedText type="small" themeColor="textSecondary" style={styles.trimNote}>
                    Capped at {WIZARD_MAX_PAGES} pages — {trimmed} extra bulk/evolution page
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

                <Pressable
                  onPress={build}
                  disabled={chosen.length === 0}
                  style={({ pressed }) => [
                    styles.buildBtn,
                    (pressed || chosen.length === 0) && styles.pressed,
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
