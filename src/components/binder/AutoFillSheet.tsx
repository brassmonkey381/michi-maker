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
import { fetchCardDetail } from 'tcgscan-browse';

import { SignInPerk } from '@/components/auth/SignInPerk';
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
import { useCatalog } from '@/hooks/use-catalog';
import { useTier } from '@/hooks/use-tier';
import { isSupabaseConfigured } from '@/lib/env';

// Session-remembered preference: once a collector fills from their collection, keep doing so.
let fromCollectionPref = false;

export function AutoFillSheet({
  visible,
  seedCardId,
  page,
  onClose,
  onPlaced,
}: {
  visible: boolean;
  seedCardId: string | null;
  page: DemoPage;
  onClose: () => void;
  /** Deliver the composed placements (the parent owns the store write + toast). */
  onPlaced: (placements: ComposePlacement[], methodLabel: string) => void;
}) {
  const { catalog, guestGated } = useCatalog(visible);
  const { isPaid } = useTier();
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
      let placements = await composePage(method, enrichedSeed, catalog, page, poolActive ? ownedIds : null);
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

                {/* Restrict every method to cards the user owns (the tcgscan-fed inventory). */}
                {ownedIds && ownedIds.size > 0 ? (
                  <Pressable
                    onPress={toggleFromCollection}
                    style={[pillChip.base, styles.poolChip, poolActive && pillChip.active]}>
                    <Text style={[pillChip.text, poolActive && pillChip.textActive]}>
                      {poolActive ? '✓ ' : ''}From my collection ({ownedIds.size})
                    </Text>
                  </Pressable>
                ) : null}

                {emptyCount === 0 ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    The page is full. Clear a pocket or two first.
                  </ThemedText>
                ) : (
                  COMPOSE_METHODS.filter((m) => methods.includes(m.key)).map((m) => {
                    const locked = !!m.paid && !isPaid;
                    return (
                      <Pressable
                        key={m.key}
                        onPress={() => (locked ? setUpsell(true) : run(m.key))}
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
  center: { paddingVertical: Spacing.four, alignItems: 'center', gap: Spacing.two },
  poolChip: { alignSelf: 'flex-start' },
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
