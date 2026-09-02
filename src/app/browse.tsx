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
import { useRouter, type Href } from 'expo-router';
import { productUrl, type CardAction, type CardActionsFactory } from 'tcgscan-browse';
import { useRef, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ebayCardQuery, ebaySearchLink } from '@/lib/ebay';

import { AddToBinderSheet } from '@/components/binder/AddToBinderSheet';
import { SimilarityModelPicker } from '@/components/SimilarityModelPicker';
import { CardBrowse } from '@/components/binder/CardBrowse';
import { Toast, type ToastSpec } from '@/components/binder/Toast';
import { CapGateDialog } from '@/components/monetization/CapGateDialog';
import { useCapGate } from '@/hooks/use-cap-gate';
import { similarityWall } from '@/data/similarityGate';
import { hasFindSimilar } from '@/data/tiers';
import { CopyPickerSheet } from '@/components/binder/CopyPickerSheet';
import { catalogArtNote, type OwnedEntry } from '@/data/ownedCopies';
import { useAvailableCopies, useCopyAssigner, useOwnedCopies } from '@/hooks/use-owned-copies';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Breakpoints, Fonts, FontSize, MaxContentWidthWide, Palette, Spacing } from '@/constants/theme';
import { pagesForCards } from '@/data/binderTypes';
import { binderLimitMessage, binderTrialMessage, limitCta, pageLimitMessage, pageTrialMessage } from '@/data/limitMessages';

import { useCatalog } from '@/hooks/use-catalog';
import { useOwnedCards } from '@/hooks/use-owned-cards';
import { useBinders } from '@/store/binders';

export default function BrowseScreen() {
  const store = useBinders();
  // Which of the user's physical cards each placement claims (see use-owned-copies): every
  // add path resolves it the same way, so what a pocket costs no longer depends on the screen
  // it was added from.
  const assignCopies = useCopyAssigner();
  const availableCopies = useAvailableCopies();
  const ownedCopies = useOwnedCopies();
  // Aspirational-by-choice (never owned: no warning) vs ran-out-of-free-copies (say so).
  const ownsCard = (cardId: string) => !!ownedCopies?.some((c) => c.cardId === cardId);
  const router = useRouter();
  const { width } = useWindowDimensions();
  const railHidden = Platform.OS !== 'web' || width < Breakpoints.rail;
  const openBinder = (id: string) => router.push(`/binder/${id}`);

  // A dedicated page loads the catalog on mount (the browser runs cold/server-search until it's in).
  const { catalog } = useCatalog(true);

  // The signed-in user's owned cards → collection overlays in the browser (tile checks, set
  // completion %, the Collection have: filter). Undefined for guests, so the UI stays off.
  const ownedIds = useOwnedCards();

  // One or many cards headed for a binder (single tap → [id]; multi-select → the whole set).
  const [addCardIds, setAddCardIds] = useState<string[] | null>(null);
  const [toast, setToast] = useState<ToastSpec | null>(null);
  const toastId = useRef(0);

  const showAdded = (binderId: string, title: string, count: number, note = '') => {
    toastId.current += 1;
    setToast({
      id: toastId.current,
      message: (count > 1 ? `Added ${count} cards to ${title}` : `Added to ${title}`) + note,
      link: { text: title, onPress: () => openBinder(binderId) },
    });
  };

  const cardActions: CardActionsFactory = (_card, builtins) => {
    const add: CardAction = {
      key: 'add',
      kind: 'primary',
      label: 'Add to a binder…',
      onPress: (c) => setAddCardIds([c.id]),
    };
    // Both affiliate destinations, every card: TCGPlayer (affiliate-deeplinked via
    // productUrl) for market/NM buying, eBay for singles + deals.
    const viewOnTcgplayer: CardAction = {
      key: 'tcgplayer',
      label: 'View on TCGPlayer ↗',
      onPress: (c) => void Linking.openURL(productUrl(c.id)).catch(() => {}),
    };
    const findOnEbay: CardAction = {
      key: 'ebay',
      label: 'Find on eBay ↗',
      onPress: (c) =>
        void Linking.openURL(
          ebaySearchLink(ebayCardQuery(c.name, c.setName, c.number), 'michi-browse'),
        ).catch(() => {}),
    };
    // FIND SIMILAR IS PRO (see TierLimits.findSimilar), and the three similarity actions stay in
    // the list at every tier: an action that silently disappears teaches nobody what a plan buys,
    // where one that answers the tap names the wall and offers the way out. More/less-like-this
    // only appear mid-session, which a free account can no longer start — they are wrapped anyway,
    // because "unreachable" is a property of today's UI and not of this list.
    const paywalled = (action?: CardAction): CardAction | undefined =>
      !action || hasFindSimilar(store.tier)
        ? action
        : { ...action, onPress: () => capGate.hit(similarityWall(store.tier, 'browse')) };
    return [
      add,
      paywalled(builtins.moreLikeThis),
      paywalled(builtins.lessLikeThis),
      paywalled(builtins.findSimilar),
      builtins.viewSet,
      builtins.viewIllustrator,
      viewOnTcgplayer,
      findOnEbay,
    ].filter(Boolean) as CardAction[];
  };

  // Hitting a cap ends the action the user was mid-way through, so every cap toast gets the
  // prominent tone and a button out. Which way out depends on the tier (see limitCta): the plans
  // page for accounts that can pay, the auth sheet for guests, whose cap is lifted by the free
  // tier rather than by a plan.
  const showLimitToast = (message: string) => {
    toastId.current += 1;
    setToast({ id: toastId.current, message, tone: 'limit', cta: limitCta(store.tier) });
  };
  // One wall, one report: a dialog on its first hit today, the toast after that.
  const capGate = useCapGate(showLimitToast);

  // ONE card, and copies of it unplaced: the pocket could mean "my card" or "one I want", and
  // only the user knows which. A MULTI-card add resolves automatically instead - a sheet per card
  // for a selection of forty would be unusable, and every pocket can still be changed afterwards.
  const [copyChoice, setCopyChoice] = useState<{
    binderId: string;
    cardId: string;
    copies: OwnedEntry[];
  } | null>(null);

  const addToExisting = (binderId: string, entryIds?: (string | undefined)[]) => {
    if (!addCardIds?.length) return;
    const title = store.getBinder(binderId)?.title ?? 'binder';
    if (!entryIds && addCardIds.length === 1) {
      const copies = availableCopies(addCardIds[0]);
      if (copies.length > 0) {
        setCopyChoice({ binderId, cardId: addCardIds[0], copies });
        return;
      }
    }
    // Claim one of the user's actual cards where they have a free one. Browsing used to place
    // a card you own without it costing anything, so the collection kept calling it free.
    const resolved = entryIds ?? assignCopies(addCardIds);
    const { added, unplaced, droppedClaims } = store.addCardsToBinder(binderId, addCardIds, {
      entryIds: resolved,
    });
    // Owned cards whose free copies ran out land as catalogue-art pockets - named in the toast,
    // never dropped in silence. Never-owned cards are aspirational by choice: no warning. And an
    // undefined that CopyPickerSheet handed in explicitly (entryIds present) is the user choosing
    // the catalogue image with copies free - counting it would scold the sanctioned choice, so
    // only assigner-resolved undefineds count. droppedClaims stays unconditional: a picked copy
    // the guard refused is a real shortfall whichever way it was chosen.
    const short =
      droppedClaims +
      (entryIds
        ? 0
        : addCardIds.filter((id, i) => resolved[i] === undefined && ownsCard(id)).length);
    setAddCardIds(null);
    // Anything the binder's page cap left out is named, never dropped in silence.
    if (unplaced > 0) {
      capGate.hit({
        limit: 'pagesPerBinder',
        surface: 'browse',
        isGuest: store.tier === 'guest',
        title: 'This binder is full',
        message: pageLimitMessage(store.tier, store.limits),
        trialMessage: pageTrialMessage(store.limits),
        tier: store.tier,
        used: store.getBinder(binderId)?.pages.length ?? 0,
        cap: store.limits.pagesPerBinder,
      });
    } else if (added > 0) showAdded(binderId, title, added, catalogArtNote(short, added));
  };
  const addToNew = () => {
    if (!addCardIds?.length) return;
    // The browser's multi-select is unbounded, but a new binder only gets the tier's page
    // allowance (pagesForCards lays 9 pockets a page) — trim to what fits and say so, rather
    // than seeding a binder over the cap. Unlimited tiers keep the whole selection.
    const ids = addCardIds.slice(0, store.limits.pagesPerBinder * 9);
    const short = addCardIds.length - ids.length;
    const entryIds = assignCopies(ids);
    const binder = store.createBinder({
      title: 'New binder',
      pages: pagesForCards(ids, entryIds),
    });
    setAddCardIds(null);
    // The store refuses past the binder cap — say so instead of silently doing nothing.
    if (!binder) {
      capGate.hit({
        limit: 'binders',
        surface: 'browse',
        isGuest: store.tier === 'guest',
        title: 'You are at your binder limit',
        message: binderLimitMessage(store.tier, store.limits),
        trialMessage: binderTrialMessage(store.limits),
        tier: store.tier,
        used: store.binderCount,
        cap: store.limits.binders,
      });
      return;
    }
    if (short > 0) {
      capGate.hit({
        limit: 'pagesPerBinder',
        surface: 'browse',
        isGuest: store.tier === 'guest',
        title: 'This binder is full',
        message: pageLimitMessage(store.tier, store.limits),
        trialMessage: pageTrialMessage(store.limits),
        tier: store.tier,
        used: binder.pages.length,
        cap: store.limits.pagesPerBinder,
      });
    } else {
      const ownedShort = ids.filter((id, i) => entryIds[i] === undefined && ownsCard(id)).length;
      showAdded(binder.id, binder.title, ids.length, catalogArtNote(ownedShort, ids.length));
    }
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
              <Pressable onPress={() => router.push('/search-guide' as Href)} hitSlop={8}>
                <ThemedText type="smallBold" themeColor="textSecondary">
                  Cheatsheet ↗
                </ThemedText>
              </Pressable>
              {/* The EN/JP toggle used to sit here. It now lives INSIDE the browser (kit
                  `showLanguageToggle`, on by default) so every entry point that opens a browser —
                  this page, the binder card picker, Slice Studio — has the same control in the
                  same place, instead of only the one surface whose header happened to carry it. */}
              {railHidden ? (
                <Pressable onPress={() => router.push('/')} hitSlop={8}>
                  <ThemedText type="smallBold" themeColor="textSecondary">
                    ‹ Home
                  </ThemedText>
                </Pressable>
              ) : null}
            </View>
          </View>

          {/* Admin-only, and renders nothing for everyone else. Above the browser rather than
              inside it: the kit owns the result list, and the control has to sit where it is
              visible BEFORE a find-similar action rather than appearing with the results. */}
          <SimilarityModelPicker />

          {/* The browser owns the remaining height; its inner FlatList scrolls (no page ScrollView
              around it, so the list gets a bounded viewport). */}
          <View style={styles.panel}>
            <CardBrowse
              catalog={catalog}
              cardActions={cardActions}
              onPickCards={(cardIds) => setAddCardIds(cardIds)}
              // No `languages` pin: the browser reads the SHARED preference itself, which is the
              // same value this page used to thread through. Pinning it would suppress the
              // in-browser toggle (a pinned browser must not show a control that does nothing).
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
      {/* Sits over the binder chooser: the binder is already decided, the copy is not. Closing it
          without answering cancels the add and leaves the chooser open behind it. */}
      {copyChoice ? (
        <CopyPickerSheet
          visible
          cardId={copyChoice.cardId}
          copies={copyChoice.copies}
          onClose={() => setCopyChoice(null)}
          onPick={(entryId) => {
            const c = copyChoice;
            setCopyChoice(null);
            addToExisting(c.binderId, [entryId ?? undefined]);
          }}
        />
      ) : null}
      <Toast spec={toast} onDismiss={() => setToast(null)} />
      <CapGateDialog wall={capGate.wall} onDismiss={capGate.dismissWall} onResolve={capGate.resolveWall} />
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
