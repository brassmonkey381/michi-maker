/**
 * "✨ Fill page" sheet — auto-curate the current page around the selected card (the seed),
 * michi-method style. Lists the compose methods that make sense for this seed (see
 * `availableMethods`); picking one runs the page composer and fills the page's EMPTY pockets,
 * leaving everything already placed untouched. One store commit → one Undo.
 *
 * Forces the catalog load on open (like the CardPicker) — composition scans real metadata.
 */
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';

import { SignInPerk } from '@/components/auth/SignInPerk';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontSize, Palette, Radii, Radius, Spacing } from '@/constants/theme';
import { occupiedCells, type DemoPage } from '@/data/binderTypes';
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
  const [busy, setBusy] = useState<ComposeMethod | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Trainer/partner tables come from the tcgscan-data server — load them alongside the catalog
  // so availableMethods sees them (load-once; instant after the first open).
  const [partnersReady, setPartnersReady] = useState(false);
  useEffect(() => {
    if (!visible) return;
    let active = true;
    loadPartnerData().then(() => {
      if (active) setPartnersReady(true);
    });
    return () => {
      active = false;
    };
  }, [visible]);

  const ready = !!catalog && partnersReady;
  const seed = catalog && seedCardId ? resolveCatalogCardWith(catalog, seedCardId) : undefined;
  const methods = seed && catalog && ready ? availableMethods(seed, catalog) : [];
  const emptyCount = page.rows * page.cols - occupiedCells(page).size;

  const run = async (method: ComposeMethod) => {
    if (!seed || !catalog || busy) return;
    setBusy(method);
    setError(null);
    try {
      const placements = await composePage(method, seed, catalog, page);
      if (placements.length === 0) {
        setError('Nothing suitable found for this method — try another.');
        return;
      }
      onPlaced(placements, COMPOSE_METHODS.find((m) => m.key === method)?.label ?? method);
      onClose();
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.cardWrap}>
          <ThemedView type="backgroundElement" style={styles.card}>
            <View style={styles.header}>
              <ThemedText type="subtitle" style={styles.title}>
                ✨ Fill page
              </ThemedText>
              <Pressable onPress={onClose} hitSlop={8}>
                <ThemedText type="link" themeColor="textSecondary">
                  Close
                </ThemedText>
              </Pressable>
            </View>

            {guestGated ? (
              // The composer scans the full catalog, which is a signed-in perk — say so instead
              // of showing a spinner that would never resolve for a guest.
              <SignInPerk message="Auto-fill curates pages from the full card catalog — sign in (free) to use it." />
            ) : !ready ? (
              <View style={styles.center}>
                <ActivityIndicator />
                <ThemedText type="small" themeColor="textSecondary">
                  Loading the card catalog…
                </ThemedText>
              </View>
            ) : !seed ? (
              <ThemedText type="small" themeColor="textSecondary">
                This pocket’s card isn’t in the catalog, so it can’t seed a page.
              </ThemedText>
            ) : (
              <>
                <ThemedText type="small" themeColor="textSecondary" style={styles.sub}>
                  Curate this page around <ThemedText type="smallBold">{seed.name}</ThemedText> —
                  fills the {emptyCount} empty pocket{emptyCount === 1 ? '' : 's'}, keeps what’s
                  already placed. Undo reverses the whole fill.
                </ThemedText>

                {emptyCount === 0 ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    The page is full — clear a pocket or two first.
                  </ThemedText>
                ) : (
                  COMPOSE_METHODS.filter((m) => methods.includes(m.key)).map((m) => (
                    <Pressable
                      key={m.key}
                      onPress={() => run(m.key)}
                      disabled={busy !== null}
                      style={({ pressed }) => [
                        styles.method,
                        (pressed || busy === m.key) && styles.pressed,
                        busy !== null && busy !== m.key && styles.dimmed,
                      ]}>
                      <View style={styles.methodText}>
                        <ThemedText type="smallBold">{m.label}</ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {m.description}
                        </ThemedText>
                      </View>
                      {busy === m.key ? <ActivityIndicator /> : null}
                    </Pressable>
                  ))
                )}

                {error ? (
                  <ThemedText type="small" style={styles.error}>
                    {error}
                  </ThemedText>
                ) : null}
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
  cardWrap: { width: '100%', maxWidth: 420 },
  card: { borderRadius: Radii.page, padding: Spacing.four, gap: Spacing.three },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: FontSize.h2, lineHeight: 26 },
  sub: { lineHeight: 20 },
  center: { paddingVertical: Spacing.four, alignItems: 'center', gap: Spacing.two },
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
  pressed: { opacity: 0.7 },
  dimmed: { opacity: 0.4 },
  error: { color: Palette.danger, lineHeight: 20 },
});
