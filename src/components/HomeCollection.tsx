/**
 * "My collection" — the signed-in user's card inventory (`user_cards`), fed live by
 * tcgscan-app scans. Renders nothing until the inventory has rows, and updates in real time
 * while the page is open (scan a card in tcgscan, watch it show up here).
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
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { HomeSection } from '@/components/HomeSection';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontSize, Palette, Radii, Radius, Spacing, Weight } from '@/constants/theme';
import { fetchUserCards, subscribeUserCards, type UserCard } from '@/data/collectionRepo';
import { isSupabaseConfigured } from '@/lib/env';
import { cardThumbUrl } from '@/lib/catalogConfig';
import { formatUsd, usePriceSummary } from '@/lib/prices';
import { useAuth } from '@/store/auth';
import { useBinders } from '@/store/binders';

const TILE_W = 96;
const CARD_ASPECT = 88 / 63;

export function HomeCollection({ onToast }: { onToast?: (message: string) => void }) {
  const { user } = useAuth();
  const [cards, setCards] = useState<UserCard[] | null>(null);

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

  if (!cards || cards.length === 0) return null; // appears with the first scan/import
  return <CollectionStrip cards={cards} onToast={onToast} />;
}

/** Split out so the price summary (a ~MB shared fetch) only loads once rows actually exist. */
function CollectionStrip({
  cards,
  onToast,
}: {
  cards: UserCard[];
  onToast?: (message: string) => void;
}) {
  const store = useBinders();
  const priceSummary = usePriceSummary();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [chooserOpen, setChooserOpen] = useState(false);
  // "+ New binder": the freshly created binder isn't in the store snapshot this render closed
  // over, so the add is parked here and fires once the binder shows up in userBinders.
  const [pendingAdd, setPendingAdd] = useState<{ binderId: string; ids: string[] } | null>(null);
  useEffect(() => {
    if (!pendingAdd) return;
    if (!store.userBinders.some((b) => b.id === pendingAdd.binderId)) return;
    const { added } = store.addCardsToBinder(pendingAdd.binderId, pendingAdd.ids);
    setPendingAdd(null);
    if (added > 0) onToast?.(`Added ${added} card${added === 1 ? '' : 's'} to your new binder`);
  }, [pendingAdd, store, onToast]);

  // How many copies of each card already sit in the user's binders (any slot referencing it).
  const placedCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const binder of store.userBinders) {
      for (const page of binder.pages) {
        for (const slot of page.slots) {
          if (slot.cardId) counts.set(slot.cardId, (counts.get(slot.cardId) ?? 0) + 1);
        }
      }
    }
    return counts;
  }, [store.userBinders]);

  const copies = cards.reduce((n, c) => n + c.quantity, 0);
  const value = priceSummary
    ? cards.reduce((sum, c) => sum + c.quantity * (priceSummary[c.cardId]?.cur ?? 0), 0)
    : 0;
  const headline = [
    `${copies} card${copies === 1 ? '' : 's'}`,
    value > 0 ? formatUsd(value) : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const toggle = (cardId: string) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });

  const addTo = (binderId: string) => {
    const ids = [...selected];
    setChooserOpen(false);
    setSelected(new Set());
    const { added } = store.addCardsToBinder(binderId, ids);
    const title = store.userBinders.find((b) => b.id === binderId)?.title ?? 'binder';
    if (added > 0) onToast?.(`Added ${added} card${added === 1 ? '' : 's'} to ${title}`);
  };

  const addToNew = () => {
    const ids = [...selected];
    setChooserOpen(false);
    setSelected(new Set());
    const binder = store.createBinder({ title: 'My collection picks' });
    setPendingAdd({ binderId: binder.id, ids });
  };

  return (
    <HomeSection
      title="My collection"
      action={
        <ThemedText type="small" themeColor="textSecondary">
          {headline}
        </ThemedText>
      }>
      <FlatList
        horizontal
        data={cards}
        extraData={[selected, placedCounts]}
        keyExtractor={(c) => `${c.cardId}|${c.condition}`}
        renderItem={({ item }) => (
          <CardTile
            card={item}
            placed={placedCounts.get(item.cardId) ?? 0}
            selected={selected.has(item.cardId)}
            onPress={() => toggle(item.cardId)}
          />
        )}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.strip}
      />

      {selected.size > 0 ? (
        <View style={styles.actionRow}>
          <Pressable
            onPress={() => setChooserOpen(true)}
            style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}>
            <Text style={styles.actionBtnText}>
              Add {selected.size} to binder ▸
            </Text>
          </Pressable>
          <Pressable onPress={() => setSelected(new Set())} hitSlop={8}>
            <ThemedText type="small" themeColor="textSecondary">
              Clear
            </ThemedText>
          </Pressable>
        </View>
      ) : null}

      {chooserOpen ? (
        <Modal visible transparent animationType="fade" onRequestClose={() => setChooserOpen(false)}>
          <Pressable style={styles.backdrop} onPress={() => setChooserOpen(false)}>
            <Pressable onPress={(e) => e.stopPropagation()} style={styles.chooserWrap}>
              <ThemedView type="backgroundElement" style={styles.chooser}>
                <ThemedText type="smallBold" style={styles.chooserTitle}>
                  Add {selected.size} card{selected.size === 1 ? '' : 's'} to…
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
    </HomeSection>
  );
}

function CardTile({
  card,
  placed,
  selected,
  onPress,
}: {
  card: UserCard;
  placed: number;
  selected: boolean;
  onPress: () => void;
}) {
  const uri = cardThumbUrl(card.cardId, 245);
  const free = Math.max(0, card.quantity - placed);
  const exhausted = free === 0;
  return (
    <Pressable
      style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${free} of ${card.quantity} copies free to place`}>
      <View style={[styles.imageWrap, selected && styles.imageWrapSelected]}>
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
          <Text style={styles.imageFallback}>?</Text>
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
  strip: { gap: Spacing.two, paddingVertical: Spacing.one },
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
  imageFallback: { fontSize: FontSize.h2, color: Palette.muted },
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
});
