import { Redirect, useRouter, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { sendBrowseCommand, type CardLanguage } from 'tcgscan-browse';

import { AccountButton } from '@/components/auth/AccountButton';
import { GuestBanner } from '@/components/auth/GuestBanner';
import { AddToBinderSheet } from '@/components/binder/AddToBinderSheet';
import { BinderCarousel } from '@/components/binder/BinderCarousel';
import { CurateCallout } from '@/components/CurateCallout';
import { Toast, type ToastSpec } from '@/components/binder/Toast';
import { CapGateDialog } from '@/components/monetization/CapGateDialog';
import { useCapGate } from '@/hooks/use-cap-gate';
import { useCopyAssigner, useOwnedCopies } from '@/hooks/use-owned-copies';
import { catalogArtNote } from '@/data/ownedCopies';
import { HomeRecent } from '@/components/HomeRecent';
import { HomeSealed } from '@/components/HomeSealed';
import { HomeSection } from '@/components/HomeSection';
import { ProTrialPrompt } from '@/components/monetization/ProTrialPrompt';
import { PeopleButton } from '@/components/people/PeopleButton';
import { ProfileAvatarButton, TILE_AVATAR } from '@/components/people/ProfileAvatarButton';
import { SettingsButton } from '@/components/settings/SettingsSheet';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Breakpoints, Fonts, FontSize, MaxContentWidthWide, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { pagesForCards } from '@/data/binderTypes';
import { similarityWall } from '@/data/similarityGate';
import { hasFindSimilar } from '@/data/tiers';
import { CONTEST, contestPhase } from '@/data/contest';
import { binderLimitMessage, binderTrialMessage, limitCta, pageLimitMessage, pageTrialMessage } from '@/data/limitMessages';
import { fetchAvatarsByUsername } from '@/data/profileRepo';
import { track } from '@/lib/analytics';
import { useImageManifest } from '@/lib/catalogConfig';
import { isSupabaseConfigured } from '@/lib/env';
import { shouldShowLanding } from '@/lib/landing';
import { useBinders } from '@/store/binders';

/**
 * Printing language(s) the home browse surfaces show. The single control point for the home
 * screen — `undefined` shows all languages (EN + JP). Set to `['en']` or `['ja']` to constrain
 * every home carousel at once; a future language selector would feed its state in here.
 */
const HOME_LANGUAGES: CardLanguage[] | undefined = undefined;

export default function HomeScreen() {
  // First-time web visitors get the marketing page; any landing CTA sets the seen flag
  // before navigating back here, so this evaluates once per mount and never loops.
  const [showLanding] = useState(shouldShowLanding);
  const store = useBinders();
  // Which of the user's physical cards each placement claims (see use-owned-copies): every
  // add path resolves it the same way, so what a pocket costs no longer depends on the screen
  // it was added from.
  const assignCopies = useCopyAssigner();
  const ownedCopies = useOwnedCopies();
  // Aspirational-by-choice (never owned: no warning) vs ran-out-of-free-copies (say so).
  const ownsCard = (cardId: string) => !!ownedCopies?.some((c) => c.cardId === cardId);
  const router = useRouter();
  const { width } = useWindowDimensions();
  // Where the web rail isn't present (native, or narrow web) Home carries the quick-nav to the
  // personal + browse pages, so nothing the rail links to becomes unreachable.
  const railHidden = Platform.OS !== 'web' || width < Breakpoints.rail;
  const openBinder = (id: string) => router.push(`/binder/${id}`);

  const [toast, setToast] = useState<ToastSpec | null>(null);
  // Avatars for the builders of the featured binders, so a face on the shelf leads to the person
  // who made it. Keyed by username because `authorName` is the only thing a featured row knows
  // about its owner, and it doubles as the profile's address. One query for the whole carousel,
  // after the binders are already on screen: a slow or failed lookup must never delay or blank a
  // tile, it just leaves the lettered circle.
  const [featuredAvatars, setFeaturedAvatars] = useState<Map<string, string | null>>(new Map());
  const featuredAuthorKey = [
    ...new Set(store.featuredBinders.map((b) => b.authorName).filter(Boolean) as string[]),
  ]
    .sort()
    .join(',');
  useEffect(() => {
    if (!isSupabaseConfigured || !featuredAuthorKey) return;
    let alive = true;
    fetchAvatarsByUsername(featuredAuthorKey.split(','))
      .then((m) => alive && setFeaturedAvatars(m))
      .catch(() => {
        /* no pictures; the lettered circles still render */
      });
    return () => {
      alive = false;
    };
  }, [featuredAuthorKey]);
  const toastId = useRef(0);

  // The card browser lives on /browse now; the Recent & Upcoming feed drives it through the
  // shared command bus (which holds one pending command) and navigates there.
  const openBrowse = () => router.push('/browse' as Href);
  // NOTE: only these michi-side search INITIATORS are captured. Free-typed queries the user runs
  // inside CatalogBrowser (in the external tcgscan-browse package) are NOT captured yet — that
  // needs a package-level onEvent callback (a later task). No PII: no query text here, only kind.
  // Find similar is PRO (see TierLimits.findSimilar). Gated HERE rather than by withholding the
  // action, so the tap is answered where it was made instead of navigating to /browse to be
  // refused on arrival.
  const driveSimilar = (cardId: string) => {
    if (!hasFindSimilar(store.tier)) {
      capGate.hit(similarityWall(store.tier, 'home'));
      return;
    }
    track('card.search', { kind: 'similar' });
    sendBrowseCommand({ type: 'similar', cardId });
    openBrowse();
  };
  const driveViewSet = (cardId: string) => {
    track('card.search', { kind: 'viewSet' });
    sendBrowseCommand({ type: 'viewSet', cardId });
    openBrowse();
  };
  // Sets carousel → open that set in the browser (catalog-free command, works for guests).
  const driveViewSetById = (setId: string, series: string) => {
    track('card.search', { kind: 'viewSetById' });
    sendBrowseCommand({ type: 'viewSetById', setId, seriesId: series || undefined });
    openBrowse();
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
  const showAddedToast = (binderId: string, title: string, note = '') => {
    toastId.current += 1;
    setToast({
      id: toastId.current,
      message: `Added to ${title}${note}`,
      link: { text: title, onPress: () => openBinder(binderId) },
    });
  };

  // Tapping a card in the Recent & Upcoming feed offers "Add to a binder…" — this holds the
  // chosen card until the chooser sheet resolves it into an existing or brand-new binder.
  const [addCardId, setAddCardId] = useState<string | null>(null);
  const addToExistingBinder = (binderId: string) => {
    if (!addCardId) return;
    const title = store.getBinder(binderId)?.title ?? 'binder';
    const entryIds = assignCopies([addCardId]);
    const { added, unplaced, droppedClaims } = store.addCardsToBinder(binderId, [addCardId], {
      entryIds,
    });
    // An owned card whose free copies ran out lands as a catalogue-art pocket - say so.
    const short =
      droppedClaims > 0 || (entryIds[0] === undefined && ownsCard(addCardId)) ? 1 : 0;
    setAddCardId(null);
    if (added > 0) showAddedToast(binderId, title, catalogArtNote(short, 1));
    else if (unplaced > 0) {
      capGate.hit({
        limit: 'pagesPerBinder',
        surface: 'home',
        isGuest: store.tier === 'guest',
        title: 'This binder is full',
        message: pageLimitMessage(store.tier, store.limits),
        trialMessage: pageTrialMessage(store.limits),
        tier: store.tier,
        used: store.getBinder(binderId)?.pages.length ?? 0,
        cap: store.limits.pagesPerBinder,
      });
    }
  };
  const addToNewBinder = () => {
    if (!addCardId) return;
    if (store.atBinderLimit) {
      setAddCardId(null);
      capGate.hit({
        limit: 'binders',
        surface: 'home',
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
    // Atomic create-with-card — creating then adding would race the store snapshot.
    const entryIds = assignCopies([addCardId]);
    const binder = store.createBinder({
      title: 'New binder',
      pages: pagesForCards([addCardId], entryIds),
    });
    const short = entryIds[0] === undefined && ownsCard(addCardId) ? 1 : 0;
    setAddCardId(null);
    if (binder) showAddedToast(binder.id, binder.title, catalogArtNote(short, 1));
  };

  // Binder covers resolve their image straight from the card id (cardThumbUrl) via the lite
  // image manifest — hydrate it so covers repaint with their hashed URLs (no-op in static mode).
  useImageManifest();

  if (showLanding) return <Redirect href="/welcome" />;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.headerRow}>
            <ThemedText type="title" style={styles.h1}>
              michi-maker
            </ThemedText>
            <View style={styles.headerActions}>
              <Pressable
                onPress={() => router.push('/michi-method')}
                hitSlop={8}
                style={({ pressed }) => [styles.headerLink, pressed && styles.pressed]}>
                <ThemedText style={styles.headerLinkText}>Michi Method</ThemedText>
              </Pressable>
              <Pressable
                onPress={() => router.push('/search-guide' as Href)}
                hitSlop={8}
                style={({ pressed }) => [styles.headerLink, pressed && styles.pressed]}>
                <ThemedText style={styles.headerLinkText}>Search guide</ThemedText>
              </Pressable>
              <PeopleButton />
              <SettingsButton />
              <AccountButton />
            </View>
          </View>

          {/* Quick-nav to the personal + browse pages, only where the rail isn't shown. */}
          {railHidden ? (
            <View style={styles.quickNav}>
              <Pressable
                onPress={() => router.push('/my-binders' as Href)}
                style={({ pressed }) => [styles.quickChip, pressed && styles.pressed]}>
                <Text style={styles.quickChipText}>My binders ›</Text>
              </Pressable>
              <Pressable
                onPress={() => router.push('/discover' as Href)}
                style={({ pressed }) => [styles.quickChip, pressed && styles.pressed]}>
                <Text style={styles.quickChipText}>Discover binders ›</Text>
              </Pressable>
              <Pressable
                onPress={openBrowse}
                style={({ pressed }) => [styles.quickChip, pressed && styles.pressed]}>
                <Text style={styles.quickChipText}>Browse all cards ›</Text>
              </Pressable>
            </View>
          ) : null}

          {/* Contest promo — runs until the contest ends. */}
          {contestPhase() !== 'ended' ? (
            <Pressable
              onPress={() => router.push('/contest' as Href)}
              style={({ pressed }) => [styles.contestPromo, pressed && styles.pressed]}>
              <Text style={styles.contestPromoTitle}>🏆 {CONTEST.name}</Text>
              <Text style={styles.contestPromoBody}>{CONTEST.headline} Tap for prizes & rules ›</Text>
            </Pressable>
          ) : null}

          <GuestBanner />

          {store.featuredBinders.length > 0 ? (
            <HomeSection title="Featured binders">
              <BinderCarousel
                binders={store.featuredBinders}
                onOpen={openBinder}
                accessory={(b) =>
                  b.authorName ? (
                    <ProfileAvatarButton
                      username={b.authorName}
                      avatarUrl={featuredAvatars.get(b.authorName.toLowerCase())}
                      size={TILE_AVATAR}
                      onPress={() => router.push(`/u/${b.authorName}` as Href)}
                    />
                  ) : null
                }
              />
            </HomeSection>
          ) : null}

          {/* The curator, right under the featured shelf: what those binders were built with. */}
          <View style={styles.curate}>
            <CurateCallout surface="home" />
          </View>

          {/* Catalog-free sealed carousel: renders for everyone (guests included). */}
          <HomeSealed languages={HOME_LANGUAGES} />

          {/* Recent & Upcoming, ONE feed for every auth state (the kit's RecentProducts runs
              catalog-free for guests/cold and from the catalog when signed-in). */}
          <HomeRecent
            onFindSimilar={driveSimilar}
            onViewSet={driveViewSet}
            onOpenSet={driveViewSetById}
            onAddToBinder={setAddCardId}
          />

          <HomeSection title="Example binders">
            <BinderCarousel binders={store.exampleBinders} onOpen={openBinder} />
          </HomeSection>
        </ScrollView>
      </SafeAreaView>

      {addCardId ? (
        <AddToBinderSheet
          binders={store.userBinders}
          onPick={addToExistingBinder}
          onNew={addToNewBinder}
          onClose={() => setAddCardId(null)}
        />
      ) : null}
      <Toast spec={toast} onDismiss={() => setToast(null)} />
      <CapGateDialog wall={capGate.wall} onDismiss={capGate.dismissWall} onResolve={capGate.resolveWall} />
      {/* See ProTrialPrompt: a fixed cohort, asked once. Null for everyone else. */}
      <ProTrialPrompt surface="home" />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  curate: { marginTop: 8, marginBottom: 20 },
  container: { flex: 1 },
  flex: { flex: 1 },
  scroll: {
    padding: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.six,
    width: '100%',
    // Wide shell: the binder carousels use the room to show more art.
    maxWidth: MaxContentWidthWide,
    alignSelf: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.four,
    gap: Spacing.three,
  },
  h1: { fontFamily: Fonts?.brand, fontSize: FontSize.display, lineHeight: 40 },
  headerActions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: Spacing.two },
  headerLink: { padding: Spacing.one },
  headerLinkText: { fontSize: FontSize.control, fontWeight: Weight.semibold, lineHeight: 28 },
  quickNav: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginBottom: Spacing.three },
  quickChip: {
    backgroundColor: Palette.panel,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  quickChipText: { color: Palette.ink2, fontSize: FontSize.label, fontWeight: Weight.semibold },
  pressed: { opacity: 0.7 },
  contestPromo: {
    borderWidth: 1,
    borderColor: Palette.accent,
    backgroundColor: Palette.selectionSoft,
    borderRadius: Radius.lg,
    padding: Spacing.three,
    gap: 2,
    marginBottom: Spacing.three,
  },
  contestPromoTitle: { fontSize: FontSize.control, fontWeight: Weight.bold, color: Palette.ink },
  contestPromoBody: { fontSize: FontSize.sm, color: Palette.ink2, lineHeight: 18 },
});
