import { Redirect, useRouter, type Href } from 'expo-router';
import { useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { sendBrowseCommand, type CardLanguage } from 'tcgscan-browse';

import { AccountButton } from '@/components/auth/AccountButton';
import { GuestBanner } from '@/components/auth/GuestBanner';
import { AddToBinderSheet } from '@/components/binder/AddToBinderSheet';
import { BinderCarousel } from '@/components/binder/BinderCarousel';
import { Toast, type ToastSpec } from '@/components/binder/Toast';
import { HomeRecent } from '@/components/HomeRecent';
import { HomeSealed } from '@/components/HomeSealed';
import { HomeSection } from '@/components/HomeSection';
import { PeopleButton } from '@/components/people/PeopleButton';
import { SettingsButton } from '@/components/settings/SettingsSheet';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Breakpoints, Fonts, FontSize, MaxContentWidthWide, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { pagesForCards } from '@/data/binderTypes';
import { binderLimitMessage } from '@/data/limitMessages';
import { useImageManifest } from '@/lib/catalogConfig';
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
  const router = useRouter();
  const { width } = useWindowDimensions();
  // Where the web rail isn't present (native, or narrow web) Home carries the quick-nav to the
  // personal + browse pages, so nothing the rail links to becomes unreachable.
  const railHidden = Platform.OS !== 'web' || width < Breakpoints.rail;
  const openBinder = (id: string) => router.push(`/binder/${id}`);

  const [toast, setToast] = useState<ToastSpec | null>(null);
  const toastId = useRef(0);

  // The card browser lives on /browse now; the Recent & Upcoming feed drives it through the
  // shared command bus (which holds one pending command) and navigates there.
  const openBrowse = () => router.push('/browse' as Href);
  const driveSimilar = (cardId: string) => {
    sendBrowseCommand({ type: 'similar', cardId });
    openBrowse();
  };
  const driveViewSet = (cardId: string) => {
    sendBrowseCommand({ type: 'viewSet', cardId });
    openBrowse();
  };
  // Sets carousel → open that set in the browser (catalog-free command, works for guests).
  const driveViewSetById = (setId: string, series: string) => {
    sendBrowseCommand({ type: 'viewSetById', setId, seriesId: series || undefined });
    openBrowse();
  };
  const showToast = (message: string) => {
    toastId.current += 1;
    setToast({ id: toastId.current, message });
  };
  const showAddedToast = (binderId: string, title: string) => {
    toastId.current += 1;
    setToast({
      id: toastId.current,
      message: `Added to ${title}`,
      actionLabel: 'Open',
      onAction: () => openBinder(binderId),
    });
  };

  // Tapping a card in the Recent & Upcoming feed offers "Add to a binder…" — this holds the
  // chosen card until the chooser sheet resolves it into an existing or brand-new binder.
  const [addCardId, setAddCardId] = useState<string | null>(null);
  const addToExistingBinder = (binderId: string) => {
    if (!addCardId) return;
    const title = store.getBinder(binderId)?.title ?? 'binder';
    const { added } = store.addCardsToBinder(binderId, [addCardId]);
    setAddCardId(null);
    if (added > 0) showAddedToast(binderId, title);
    else showToast('That binder is full');
  };
  const addToNewBinder = () => {
    if (!addCardId) return;
    if (store.atBinderLimit) {
      setAddCardId(null);
      showToast(binderLimitMessage(store.tier, store.limits));
      return;
    }
    // Atomic create-with-card — creating then adding would race the store snapshot.
    const binder = store.createBinder({ title: 'New binder', pages: pagesForCards([addCardId]) });
    setAddCardId(null);
    showAddedToast(binder.id, binder.title);
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
                onPress={openBrowse}
                style={({ pressed }) => [styles.quickChip, pressed && styles.pressed]}>
                <Text style={styles.quickChipText}>Browse all cards ›</Text>
              </Pressable>
            </View>
          ) : null}

          <Pressable
            onPress={() => router.push('/michi-method')}
            hitSlop={6}
            style={({ pressed }) => [styles.methodLink, pressed && styles.pressed]}>
            <ThemedText type="small" themeColor="textSecondary">
              New here? What’s the Michi Method?
            </ThemedText>
          </Pressable>

          <GuestBanner />

          {store.featuredBinders.length > 0 ? (
            <HomeSection title="Featured binders">
              <BinderCarousel binders={store.featuredBinders} onOpen={openBinder} />
            </HomeSection>
          ) : null}

          {/* Catalog-free sealed carousel: renders for everyone (guests included). */}
          <HomeSealed languages={HOME_LANGUAGES} />

          {/* Recent & Upcoming — ONE feed for every auth state (the kit's RecentProducts runs
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
    </ThemedView>
  );
}

const styles = StyleSheet.create({
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
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  quickNav: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginBottom: Spacing.three },
  quickChip: {
    backgroundColor: Palette.panel,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  quickChipText: { color: Palette.ink2, fontSize: FontSize.label, fontWeight: Weight.semibold },
  methodLink: { alignSelf: 'flex-start', marginTop: -Spacing.two, marginBottom: Spacing.three },
  pressed: { opacity: 0.7 },
});
