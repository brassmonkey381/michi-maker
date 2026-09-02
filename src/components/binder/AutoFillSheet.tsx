/**
 * "Fill page" sheet — auto-curate the current page around the selected card (the seed),
 * michi-method style. Lists the compose methods that make sense for this seed (see
 * `availableMethods`); picking one runs the page composer and fills the page's EMPTY pockets,
 * leaving everything already placed untouched. One store commit → one Undo.
 *
 * Forces the catalog load on open (like the CardPicker) — composition scans real metadata.
 */
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { fetchCardDetail, LanguageToggle } from 'tcgscan-browse';

import { SignInPerk } from '@/components/auth/SignInPerk';
import { SimilarityModelPicker } from '@/components/SimilarityModelPicker';
import { UpgradePerk } from '@/components/monetization/UpgradePerk';
import { TriColorUpsell } from '@/components/binder/TriColorUpsell';
import { LogoLoader } from '@/components/brand/LogoLoader';
import { ThemedText } from '@/components/themed-text';
import { DialogCard } from '@/components/ui/DialogCard';
import { FontSize, Palette, Radius, Spacing } from '@/constants/theme';
import { pillChip } from '@/constants/ui';
import { occupiedCells, type DemoPage } from '@/data/binderTypes';
import { fetchUserCards } from '@/data/collectionRepo';
import {
  COMPOSE_METHODS,
  availableMethods,
  composePage,
  loadPartnerData,
  type ComposeMethod,
  type ComposePlacement,
} from '@/data/pageComposer';
import { resolveCatalogCardWith } from '@/data/cardResolver';
import type { CatalogCard } from '@/lib/catalog';
import { useCatalog } from '@/hooks/use-catalog';
import { useTier } from '@/hooks/use-tier';
import { useBrowseTheme } from '@/lib/browseTheme';
import { isSupabaseConfigured } from '@/lib/env';
import { useLanguagePref } from '@/store/languagePref';

// Session-remembered preference: once a collector fills from their collection, keep doing so.
let fromCollectionPref = false;

export function AutoFillSheet({
  visible,
  seedCardId,
  page,
  onClose,
  onPlaced,
  onComposeAll,
  onSimilarLocked,
}: {
  visible: boolean;
  seedCardId: string | null;
  page: DemoPage;
  onClose: () => void;
  /** Deliver the composed placements (the parent owns the store write + toast). */
  onPlaced: (placements: ComposePlacement[], methodLabel: string) => void;
  /** VIP "Pages around this card": hand the seed up so the parent can open ComposeAllSheet. */
  onComposeAll?: (seed: CatalogCard, pool: ReadonlySet<string> | null) => void;
  /** Raised when a free/guest user taps the locked "≈ More like this" method. The editor owns a
   *  cap gate, so this is the same wall the browser and the card sheet show for Find similar —
   *  the method IS that search, and being refused two different ways would read as two rules. */
  onSimilarLocked?: () => void;
}) {
  const { catalog, guestGated } = useCatalog(visible);
  const { isPaid, hasFindSimilar, limits } = useTier();
  // VIP's upgraded composer (tiers.ts multiPageCompose). Free/PRO see the sell instead.
  const vipCompose = limits.multiPageCompose && !!onComposeAll;
  // EN/JP bound, shared with the browse surfaces (persisted, account-synced). Passed INTO the
  // composer's ranking RPCs (p_lang) + local scans, so a fill honours the chosen printing language.
  const [languages, setLanguages] = useLanguagePref();
  const browseTheme = useBrowseTheme();
  const [busy, setBusy] = useState<ComposeMethod | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The tri-color upsell (opened when a free user taps the locked paid method).
  const [upsell, setUpsell] = useState(false);
  // Trainer/partner tables come from the tcgscan-data server — load them alongside the catalog
  // so availableMethods sees them (load-once; instant after the first open).
  const [partnersReady, setPartnersReady] = useState(false);
  // "Fill from my collection": the user's inventory ids (tcgscan-fed user_cards). The toggle
  // only appears when the inventory has cards; the choice sticks for the session.
  const [ownedIds, setOwnedIds] = useState<Set<string> | null>(null);
  const [fromCollection, setFromCollection] = useState(fromCollectionPref);
  const toggleFromCollection = () =>
    setFromCollection((v) => {
      fromCollectionPref = !v;
      return !v;
    });
  useEffect(() => {
    if (!visible) return;
    let active = true;
    loadPartnerData().then(() => {
      if (active) setPartnersReady(true);
    });
    if (isSupabaseConfigured) {
      fetchUserCards()
        .then((rows) => {
          if (active) setOwnedIds(new Set(rows.map((r) => r.cardId)));
        })
        .catch(() => {
          if (active) setOwnedIds(new Set());
        });
    }
    return () => {
      active = false;
    };
  }, [visible]);

  const ready = !!catalog && partnersReady;
  const seed = catalog && seedCardId ? resolveCatalogCardWith(catalog, seedCardId) : undefined;

  // Evolution family for the seed. The slim catalog ships evolutionLine: [] in bulk (it's lazy-loaded
  // via rpc/card_detail), which hid the "Evolution line" fill option and broke its composer. Fetch it
  // per seed (cached forever) and merge onto the seed so availableMethods offers the option and
  // composePage can find the family. Keyed by id so switching seeds never shows stale data.
  const [seedEvoById, setSeedEvoById] = useState<ReadonlyMap<string, string[]>>(new Map());
  useEffect(() => {
    if (!visible || !seedCardId || !seed || seed.evolutionLine.length > 0 || seedEvoById.has(seedCardId))
      return;
    let active = true;
    fetchCardDetail([seedCardId])
      .then((d) => {
        if (active) setSeedEvoById((m) => new Map(m).set(seedCardId, d[seedCardId]?.evolutionLine ?? []));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [visible, seedCardId, seed, seedEvoById]);
  const enrichedSeed = useMemo(() => {
    const evo = seedCardId ? seedEvoById.get(seedCardId) : undefined;
    return seed && evo && evo.length > 0 && seed.evolutionLine.length === 0
      ? { ...seed, evolutionLine: evo }
      : seed;
  }, [seed, seedCardId, seedEvoById]);

  const methods = enrichedSeed && catalog && ready ? availableMethods(enrichedSeed, catalog) : [];
  const emptyCount = page.rows * page.cols - occupiedCells(page).size;

  const poolActive = fromCollection && !!ownedIds && ownedIds.size > 0;
  const run = async (method: ComposeMethod) => {
    if (!enrichedSeed || !catalog || busy) return;
    setBusy(method);
    setError(null);
    try {
      let placements = await composePage(
        method,
        enrichedSeed,
        catalog,
        page,
        poolActive ? ownedIds : null,
        languages,
      );
      // Pool fills consume owned copies — tag card pockets with collection provenance so the
      // (free/owned) inventory accounting and Reclaim see them.
      if (poolActive) {
        placements = placements.map((p) => (p.cardId ? { ...p, fromCollection: true } : p));
      }
      if (placements.length === 0) {
        setError(
          poolActive
            ? 'None of your collection fits this method. Try another, or fill from the whole catalog.'
            : 'Nothing suitable found for this method. Try another.',
        );
        return;
      }
      onPlaced(placements, COMPOSE_METHODS.find((m) => m.key === method)?.label ?? method);
      onClose();
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
    <DialogCard visible={visible} onClose={onClose} maxWidth={420} title="Fill page">
            {guestGated ? (
              // The composer scans the full catalog, which is a signed-in perk — say so instead
              // of showing a spinner that would never resolve for a guest.
              <SignInPerk message="Auto-fill curates pages from the full card catalog. Sign in (free) to use it." />
            ) : !ready ? (
              <View style={styles.center}>
                <LogoLoader label="Loading the card catalog…" />
              </View>
            ) : !seed ? (
              <ThemedText type="small" themeColor="textSecondary">
                This pocket’s card isn’t in the catalog, so it can’t seed a page.
              </ThemedText>
            ) : (
              <>
                <ThemedText type="small" themeColor="textSecondary" style={styles.sub}>
                  Curate this page around <ThemedText type="smallBold">{seed.name}</ThemedText>: fills the {emptyCount} empty pocket{emptyCount === 1 ? '' : 's'}, keeps what’s
                  already placed. Undo reverses the whole fill.
                </ThemedText>

                <View style={styles.controls}>
                  {/* Restrict every method to cards the user owns (the tcgscan-fed inventory). */}
                  {ownedIds && ownedIds.size > 0 ? (
                    <Pressable
                      onPress={toggleFromCollection}
                      style={[pillChip.base, poolActive && pillChip.active]}>
                      <Text style={[pillChip.text, poolActive && pillChip.textActive]}>
                        {poolActive ? '✓ ' : ''}From my collection ({ownedIds.size})
                      </Text>
                    </Pressable>
                  ) : null}
                  {/* EN/JP printing language — multi-select, shared with browse. Fills honour it. */}
                  <View style={styles.langRow}>
                    <ThemedText type="small" themeColor="textSecondary">
                      Language
                    </ThemedText>
                    <LanguageToggle value={languages} onChange={setLanguages} theme={browseTheme} />
                  </View>
                </View>

                {/* VIP: run every method at once and choose between finished pages, instead of
                    committing to one method against the page you are standing on. */}
                {methods.length > 1 && enrichedSeed ? (
                  vipCompose ? (
                    <Pressable
                      onPress={() => onComposeAll?.(enrichedSeed, poolActive ? ownedIds : null)}
                      disabled={busy !== null}
                      style={({ pressed }) => [styles.allBtn, pressed && styles.pressed]}>
                      <View style={styles.methodText}>
                        <View style={styles.methodTitleRow}>
                          <ThemedText type="smallBold" style={styles.allTitle}>
                            Pages around this card
                          </ThemedText>
                          <View style={styles.vipPill}>
                            <Text style={styles.proPillText}>VIP</Text>
                          </View>
                        </View>
                        <ThemedText type="small" style={styles.allSub}>
                          Build all {methods.length} as separate pages, then keep the ones you like.
                        </ThemedText>
                      </View>
                    </Pressable>
                  ) : (
                    <UpgradePerk
                      message={`VIP builds all ${methods.length} of these as finished pages at once, so you can pick between them instead of choosing blind.`}
                      cta="See VIP"
                      onBeforePress={onClose}
                    />
                  )
                ) : null}

                <SimilarityModelPicker compact />

                {emptyCount === 0 ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    The page is full. Clear a pocket or two first.
                  </ThemedText>
                ) : (
                  COMPOSE_METHODS.filter((m) => methods.includes(m.key)).map((m) => {
                    // Each paid method against ITS OWN capability, not a shared isPaid: they
                    // line up today, and writing it this way is what stops a future split from
                    // silently locking the wrong one.
                    const locked =
                      m.paid === 'similarity' ? !hasFindSimilar : m.paid === 'triColor' ? !isPaid : false;
                    // And each to its own sell. Tri-colour gets a live demo, which converts better
                    // than a price table; similarity gets the same wall it shows everywhere else,
                    // so a user refused in the browser meets one rule here rather than a second.
                    const refuse = () =>
                      m.paid === 'similarity' && onSimilarLocked ? onSimilarLocked() : setUpsell(true);
                    return (
                      <Pressable
                        key={m.key}
                        onPress={() => (locked ? refuse() : run(m.key))}
                        disabled={busy !== null}
                        style={({ pressed }) => [
                          styles.method,
                          locked && styles.methodLocked,
                          (pressed || busy === m.key) && styles.pressed,
                          busy !== null && busy !== m.key && styles.dimmed,
                        ]}>
                        <View style={styles.methodText}>
                          <View style={styles.methodTitleRow}>
                            <ThemedText type="smallBold">{m.label}</ThemedText>
                            {locked ? (
                              <View style={styles.proPill}>
                                <Text style={styles.proPillText}>PRO</Text>
                              </View>
                            ) : null}
                          </View>
                          <ThemedText type="small" themeColor="textSecondary">
                            {m.description}
                          </ThemedText>
                        </View>
                        {busy === m.key ? <ActivityIndicator /> : null}
                      </Pressable>
                    );
                  })
                )}

                {error ? (
                  <ThemedText type="small" style={styles.error}>
                    {error}
                  </ThemedText>
                ) : null}
              </>
            )}
    </DialogCard>
    <TriColorUpsell
      visible={upsell}
      onClose={() => setUpsell(false)}
      catalog={catalog}
      onBeforeUpgrade={onClose}
    />
    </>
  );
}

const styles = StyleSheet.create({
  sub: { lineHeight: 20 },
  allBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.panel,
    borderWidth: 1,
    borderColor: Palette.accent,
    backgroundColor: Palette.accentSoft,
  },
  allTitle: { color: Palette.link },
  allSub: { color: Palette.link },
  vipPill: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: Radius.tag,
    backgroundColor: Palette.accent,
  },
  center: { paddingVertical: Spacing.four, alignItems: 'center', gap: Spacing.two },
  controls: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.three, rowGap: Spacing.two },
  langRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  method: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.panel,
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
  },
  methodText: { flex: 1, gap: 2 },
  methodTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  methodLocked: { borderStyle: 'dashed' },
  proPill: {
    paddingVertical: 1,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.pill,
    backgroundColor: Palette.panel,
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
  },
  proPillText: { fontSize: FontSize.tag, color: Palette.ink2, fontWeight: '700', letterSpacing: 0.5 },
  pressed: { opacity: 0.7 },
  dimmed: { opacity: 0.4 },
  error: { color: Palette.danger, lineHeight: 20 },
});
