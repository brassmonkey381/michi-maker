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
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Breakpoints, Fonts, FontSize, MaxContentWidthWide, Palette, Spacing } from '@/constants/theme';
import { pagesForCards } from '@/data/binderTypes';
import { useCatalog } from '@/hooks/use-catalog';
import { useBinders } from '@/store/binders';

export default function BrowseScreen() {
  const store = useBinders();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const railHidden = Platform.OS !== 'web' || width < Breakpoints.rail;
  const openBinder = (id: string) => router.push(`/binder/${id}`);

  // A dedicated page loads the catalog on mount (the browser runs cold/server-search until it's in).
  const { catalog } = useCatalog(true);

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
    ].filter(Boolean) as CardAction[];
  };

  const addToExisting = (binderId: string) => {
    if (!addCardIds?.length) return;
    const title = store.getBinder(binderId)?.title ?? 'binder';
    const { added } = store.addCardsToBinder(binderId, addCardIds);
    setAddCardIds(null);
    if (added > 0) showAdded(binderId, title, added);
  };
  const addToNew = () => {
    if (!addCardIds?.length) return;
    const binder = store.createBinder({ title: 'New binder', pages: pagesForCards(addCardIds) });
    const count = addCardIds.length;
    setAddCardIds(null);
    showAdded(binder.id, binder.title, count);
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.shell}>
          <View style={styles.headerRow}>
            <ThemedText type="title" style={styles.h1}>
              Browse all cards
            </ThemedText>
            {railHidden ? (
              <Pressable onPress={() => router.push('/')} hitSlop={8}>
                <ThemedText type="smallBold" themeColor="textSecondary">
                  ‹ Home
                </ThemedText>
              </Pressable>
            ) : null}
          </View>

          {/* The browser owns the remaining height; its inner FlatList scrolls (no page ScrollView
              around it, so the list gets a bounded viewport). */}
          <View style={styles.panel}>
            <CardBrowse
              catalog={catalog}
              cardActions={cardActions}
              onPickCards={(cardIds) => setAddCardIds(cardIds)}
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
