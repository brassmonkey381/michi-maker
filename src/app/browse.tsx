/**
 * "Browse all cards" — the full catalog browser (series → set → card, search, facets) on its
 * own route, moved off the Home feed where it sat as a heavy, collapsed accordion (expanding it
 * pays the ~25 MB catalog load). As a dedicated page the catalog loads on navigation, not on
 * home's first paint, and the browser gets the whole screen.
 *
 * There's no pocket to place into here, so a card tap offers "Add to a binder…" — the same
 * chooser the home feed used. Other surfaces (the Home recent feed, My collection) drive this
 * browser through the shared browse command bus: they sendBrowseCommand and navigate here, and
 * the pending command lands the moment this page's CatalogBrowser subscribes.
 */
import { useRouter } from 'expo-router';
import { type CardAction, type CardActionsFactory } from 'tcgscan-browse';
import { useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AddToBinderSheet } from '@/components/binder/AddToBinderSheet';
import { CardBrowse } from '@/components/binder/CardBrowse';
import { Toast, type ToastSpec } from '@/components/binder/Toast';
import { LanguageToggle } from '@/components/LanguageToggle';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Breakpoints, Fonts, FontSize, MaxContentWidthWide, Palette, Spacing } from '@/constants/theme';
import { pagesForCards } from '@/data/binderTypes';
import { binderLimitMessage, pageLimitMessage } from '@/data/limitMessages';
import { useCatalog } from '@/hooks/use-catalog';
import { useOwnedCards } from '@/hooks/use-owned-cards';
import { useBinders } from '@/store/binders';
import { useLanguagePref } from '@/store/languagePref';

export default function BrowseScreen() {
  const store = useBinders();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const railHidden = Platform.OS !== 'web' || width < Breakpoints.rail;
  const openBinder = (id: string) => router.push(`/binder/${id}`);

  // A dedicated page loads the catalog on mount (the browser runs cold/server-search until it's in).
  const { catalog } = useCatalog(true);

  // EN / JP filter for the browser (cards + series/set drill-down). The app-wide, persisted
  // preference (shared with Home) — EN only by default, remembered per account across devices.
  const [langs, changeLangs] = useLanguagePref();

  // The signed-in user's owned cards → collection overlays in the browser (tile checks, set
  // completion %, the Collection have: filter). Undefined for guests, so the UI stays off.
  const ownedIds = useOwnedCards();

  // One or many cards headed for a binder (single tap → [id]; multi-select → the whole set).
  const [addCardIds, setAddCardIds] = useState<string[] | null>(null);
  const [toast, setToast] = useState<ToastSpec | null>(null);
  const toastId = useRef(0);

  const showAdded = (binderId: string, title: string, count: number) => {
    toastId.current += 1;
    setToast({
      id: toastId.current,
      message: count > 1 ? `Added ${count} cards to ${title}` : `Added to ${title}`,
      actionLabel: 'Open',
      onAction: () => openBinder(binderId),
    });
  };

  const cardActions: CardActionsFactory = (_card, builtins) => {
    const add: CardAction = {
      key: 'add',
      kind: 'primary',
      label: 'Add to a binder…',
      onPress: (c) => setAddCardIds([c.id]),
    };
    return [
      add,
      builtins.moreLikeThis,
      builtins.lessLikeThis,
      builtins.findSimilar,
      builtins.viewSet,
      builtins.viewIllustrator,
    ].filter(Boolean) as CardAction[];
  };

  const showToast = (message: string) => {
    toastId.current += 1;
    setToast({ id: toastId.current, message });
  };

  const addToExisting = (binderId: string) => {
    if (!addCardIds?.length) return;
    const title = store.getBinder(binderId)?.title ?? 'binder';
    const { added, unplaced } = store.addCardsToBinder(binderId, addCardIds);
    setAddCardIds(null);
    // Anything the binder's page cap left out is named, never dropped in silence.
    if (unplaced > 0) showToast(pageLimitMessage(store.tier, store.limits));
    else if (added > 0) showAdded(binderId, title, added);
  };
  const addToNew = () => {
    if (!addCardIds?.length) return;
    // The browser's multi-select is unbounded, but a new binder only gets the tier's page
    // allowance (pagesForCards lays 9 pockets a page) — trim to what fits and say so, rather
    // than seeding a binder over the cap. Unlimited tiers keep the whole selection.
    const ids = addCardIds.slice(0, store.limits.pagesPerBinder * 9);
    const short = addCardIds.length - ids.length;
    const binder = store.createBinder({ title: 'New binder', pages: pagesForCards(ids) });
    setAddCardIds(null);
    // The store refuses past the binder cap — say so instead of silently doing nothing.
    if (!binder) {
      showToast(binderLimitMessage(store.tier, store.limits));
      return;
    }
    if (short > 0) showToast(pageLimitMessage(store.tier, store.limits));
    else showAdded(binder.id, binder.title, ids.length);
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.shell}>
          <View style={styles.headerRow}>
            <ThemedText type="title" style={styles.h1}>
              Browse all cards
            </ThemedText>
            <View style={styles.headerRight}>
              <LanguageToggle value={langs} onChange={changeLangs} />
              {railHidden ? (
                <Pressable onPress={() => router.push('/')} hitSlop={8}>
                  <ThemedText type="smallBold" themeColor="textSecondary">
                    ‹ Home
                  </ThemedText>
                </Pressable>
              ) : null}
            </View>
          </View>

          {/* The browser owns the remaining height; its inner FlatList scrolls (no page ScrollView
              around it, so the list gets a bounded viewport). */}
          <View style={styles.panel}>
            <CardBrowse
              catalog={catalog}
              cardActions={cardActions}
              onPickCards={(cardIds) => setAddCardIds(cardIds)}
              languages={langs}
              ownedIds={ownedIds}
            />
          </View>
        </View>
      </SafeAreaView>

      {addCardIds ? (
        <AddToBinderSheet
          binders={store.userBinders}
          onPick={addToExisting}
          onNew={addToNew}
          onClose={() => setAddCardIds(null)}
        />
      ) : null}
      <Toast spec={toast} onDismiss={() => setToast(null)} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  shell: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidthWide,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.three,
    gap: Spacing.three,
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  h1: { fontFamily: Fonts?.brand, fontSize: FontSize.display, lineHeight: 40 },
  panel: {
    flex: 1,
    borderWidth: 1,
    borderColor: Palette.hairline,
    borderRadius: 12,
    overflow: 'hidden',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    marginBottom: Spacing.four,
  },
});
