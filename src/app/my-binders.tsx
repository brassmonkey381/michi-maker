/**
 * "My binders" — the signed-in user's personal workspace, split off from the home discovery
 * feed (Home is now sealed/recent/featured/examples). Holds the two "my stuff" surfaces:
 *   · Your binders — create, search, open, and manage (rename / duplicate / share / print /
 *     delete) every binder you own, with the tier at-limit upgrade note.
 *   · My collection — the tcgscan-fed card inventory; place picks into binders, or drive the
 *     card browser (Find similar / View set) which lives on /browse.
 *
 * Reached from the web rail (above My Purchases) and, where the rail is hidden (native / narrow
 * web), from the Home quick-nav. The card-browser drives here go through the shared browse
 * command bus (sendBrowseCommand holds one pending command), so navigating to /browse and
 * sending the command lands it the moment that page's browser subscribes.
 */
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { sendBrowseCommand } from 'tcgscan-browse';

import { BinderActionsMenu } from '@/components/binder/BinderActionsMenu';
import { BinderCoverSheet } from '@/components/binder/BinderCoverSheet';
import { BinderCoverGrid } from '@/components/binder/BinderCoverGrid';
import { BinderShelf } from '@/components/binder/BinderShelf';
import { flag } from '@/lib/flags';

/** MIC-017 piece 6 ('dev'): the Grid / Shelf switch and the quiet empty shelf. */
const SHELF = flag('mybinders-shelf');
const VIEW_KEY = 'michi.binderView';
/** The viewer's last pick, this device only; the grid when there is none or storage is blocked. */
function savedView(): 'grid' | 'shelf' {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(VIEW_KEY) === 'shelf' ? 'shelf' : 'grid';
  } catch {
    return 'grid';
  }
}
import { ConfirmDialog, type ConfirmSpec } from '@/components/binder/ConfirmDialog';
import { EditLockBanner } from '@/components/binder/EditLockBanner';
import { ReturnedBinderBanner } from '@/components/binder/ReturnedBinderBanner';
import { SaveErrorBanner } from '@/components/binder/SaveErrorBanner';
import { PrintPlaceholdersSheet } from '@/components/binder/PrintPlaceholdersSheet';
import { ShareSheet } from '@/components/binder/ShareSheet';
import { Toast, type ToastSpec } from '@/components/binder/Toast';
import { CapGateDialog } from '@/components/monetization/CapGateDialog';
import { useCapGate } from '@/hooks/use-cap-gate';
import { matchBinder } from '@/data/binderSearch';
import { similarityWall } from '@/data/similarityGate';
import { tasteToast } from '@/data/tastes';
import { hasBinderCovers, hasFindSimilar } from '@/data/tiers';
import { AccountButton } from '@/components/auth/AccountButton';
import { SignInPerk } from '@/components/auth/SignInPerk';
import { MyCollection } from '@/components/MyCollection';
import { StoryBinderSheet } from '@/components/StoryBinderSheet';
import { HomeSection } from '@/components/HomeSection';
import { CapGateOffer } from '@/components/monetization/CapGateOffer';
import { PageShell } from '@/components/layout/PageShell';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, FontSize, MaxContentWidthWide, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { ProTrialPrompt } from '@/components/monetization/ProTrialPrompt';
import { RightsPrompt } from '@/components/binder/RightsPrompt';
import { pillChip } from '@/constants/ui';
import { BinderGrid, pageBoxHeight } from '@/components/binder/BinderGrid';
import { fillerName, sortByRecentEdit, type DemoPage } from '@/data/binderTypes';
import { seedPages, seedSetFor } from '@/data/seedPages';
import { binderLimitMessage, binderTrialMessage, limitCta } from '@/data/limitMessages';
import { useTrial } from '@/hooks/use-trial';
import { landingCampaignParams, track } from '@/lib/analytics';
import { isSupabaseConfigured } from '@/lib/env';
import { useImageManifest } from '@/lib/catalogConfig';
import { useBinders } from '@/store/binders';

/** Which binders the list shows. Module-level so it survives leaving and coming back. */
type Visibility = 'all' | 'public' | 'private' | 'puzzles';
let visibilityPref: Visibility = 'all';

export default function MyBindersScreen() {
  const store = useBinders();
  const router = useRouter();
  // Where the rail isn't present (native, or narrow web) the page carries its own way back Home.
  // STRAIGHT INTO THE WORKBENCH. Your own shelf is where you go to WORK on a binder, so opening
  // one from here lands in edit mode rather than in the reading view with an Edit button to find
  // first (owner decision 2026-09-09: people were opening a new binder and leaving). A binder the
  // viewer cannot edit — a locked contest finalist, an example — ignores this and opens read-only,
  // because BinderScreen gates editing on the lease and the lock, not on how it was opened.
  const openBinder = (id: string) => router.push(`/binder/${id}?edit=1`);
  // `/my-binders?curate=example|import&from=<surface>`: a CurateCallout elsewhere sent them here
  // to import, and the sheet should already be open when the page lands.
  const { curate, from, open } = useLocalSearchParams<{ curate?: string; from?: string; open?: string }>();
  // `/my-binders?open=slice` (the slice guide's button): straight into a binder of theirs, editing,
  // with the Slice Studio open. The newest binder they have, or a fresh one if the shelf is empty.
  // `/my-binders?open=new` (lib/landing, a paid/social arrival that skipped /welcome): the same, but
  // into the plain editor - "+ New binder" pressed for them, so the first thing an ad click sees is
  // an empty binder to fill. If the store refuses (cap, or this tab cannot save) they simply land
  // on the shelf, where the button is.
  // `/my-binders?open=seeded` (lib/landing, since 2026-10-30): the same, but the new binder's first
  // page already holds three themed cards picked by the ad's creative code (data/seedPages), and
  // the editor runs the seeded walkthrough (?seeded=1) that points at Complete. A returning guest
  // who already has a binder is sent back into it instead; nothing is seeded twice.
  const openedStudio = useRef(false);
  useEffect(() => {
    if ((open !== 'slice' && open !== 'new' && open !== 'seeded') || openedStudio.current || store.loading) return;
    openedStudio.current = true;
    const existing = store.userBinders[0];
    const seed = open === 'seeded' && !existing ? seedSetFor(landingCampaignParams()?.code) : null;
    const target = existing ?? (seed ? store.createBinder({ title: 'New binder', pages: seedPages(seed) }, { seed }) : store.createBinder({ title: 'New binder' }));
    if (target) router.replace(`/binder/${target.id}?${open === 'slice' ? 'slice=1' : seed ? 'edit=1&seeded=1' : 'edit=1'}` as Href);
  }, [open, store, router]);

  const [binderQuery, setBinderQuery] = useState('');
  // Per-binder ⋯ management (rename / duplicate / share / delete) without opening the editor.
  const [menuId, setMenuId] = useState<string | null>(null);
  const [shelfView, setShelfView] = useState<'grid' | 'shelf'>(() => (SHELF ? savedView() : 'grid'));
  const pickView = (v: 'grid' | 'shelf') => {
    setShelfView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // A blocked store just forgets the pick next visit.
    }
  };
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [shareId, setShareId] = useState<string | null>(null);
  const [printId, setPrintId] = useState<string | null>(null);
  const [coverId, setCoverId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const [toast, setToast] = useState<ToastSpec | null>(null);
  const toastId = useRef(0);
  // Story binder (early access): VIP only, no marketing anywhere — the button below is the only
  // way in, and only a VIP sees it. Gate = multiPageCompose, the same flag as "pages around this card".
  const [storyOpen, setStoryOpen] = useState(false);
  const canStory = store.limits.multiPageCompose;

  const showToast = (message: string, link?: { text: string; binderId: string }) => {
    toastId.current += 1;
    setToast({
      id: toastId.current,
      message,
      link: link ? { text: link.text, onPress: () => openBinder(link.binderId) } : undefined,
    });
  };

  // Hitting a cap ends the action the user was mid-way through, so every cap toast gets the
  // prominent tone and a button out. Which way out depends on the tier (see limitCta): the plans
  // page for accounts that can pay, the auth sheet for guests, whose cap is lifted by the free
  // tier rather than by a plan. Passed to MyCollection too, which reaches the same binder cap.
  const trial = useTrial();
  const showLimitToast = (message: string) => {
    toastId.current += 1;
    setToast({ id: toastId.current, message, tone: 'limit', cta: limitCta(store.tier, trial.state === 'eligible') });
  };
  // One wall, one report: a dialog on its first hit today, the toast after that.
  const capGate = useCapGate(showLimitToast);

  // Collection tiles drive the card browser on /browse. The command bus holds one pending
  // command, so it lands the moment /browse's CatalogBrowser subscribes.
  const openBrowse = () => router.push('/browse' as Href);
  // Only these michi-side search initiators are captured; free-typed CatalogBrowser queries need a
  // package-level onEvent callback (a later task). No PII: just the kind and a count, no ids/text.
  const driveSimilarIds = (cardIds: string[]) => {
    if (cardIds.length === 0) return;
    // PRO and above (see TierLimits.findSimilar). Answered here rather than after the jump to
    // /browse, so the refusal lands on the screen where the tap happened.
    const open = store.taste.pass('findSimilar', hasFindSimilar(store.tier), 'my_binders');
    if (!open) {
      capGate.hit(similarityWall(store.tier, 'my_binders'));
      return;
    }
    if (open === 'tasted') showLimitToast(tasteToast('findSimilar', store.tier, store.taste.left('findSimilar')));
    track('card.search', { kind: 'similar', count: cardIds.length });
    if (cardIds.length === 1) sendBrowseCommand({ type: 'similar', cardId: cardIds[0] });
    else sendBrowseCommand({ type: 'similarMany', cardIds });
    openBrowse();
  };
  const driveViewSet = (cardId: string) => {
    track('card.search', { kind: 'viewSet' });
    sendBrowseCommand({ type: 'viewSet', cardId });
    openBrowse();
  };

  // Covers resolve straight from the card id, so hydrate the lite image manifest for hashed URLs.
  useImageManifest();

  const handleNew = () => {
    if (store.atBinderLimit) {
      capGate.hit({
        limit: 'binders',
        surface: 'my_binders',
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
    const binder = store.createBinder({ title: 'New binder' });
    if (binder) openBinder(binder.id);
  };

  // Show the filter once there are enough binders that scanning gets tedious.
  const showBinderSearch = store.userBinders.length >= 4;
  // WHO CAN SEE IT is the other axis people sort their own binders by - "what have I actually
  // shared?" is a question about the whole shelf, not about one binder's Share sheet. Shown from
  // two binders up: with one there is nothing to filter, and the counts on the chips answer the
  // question without a tap even when a side is empty.
  const [visibility, setVisibility] = useState<Visibility>(visibilityPref);
  const pickVisibility = (v: Visibility) =>
    setVisibility(() => {
      visibilityPref = v; // session-sticky, same pattern as My collection's view mode
      return v;
    });
  const publicCount = store.userBinders.filter((b) => b.isPublic).length;
  const privateCount = store.userBinders.length - publicCount;
  // THE PUZZLE BINDERS ARE THEIR OWN SHELF (owner, 2026-10-18). They are public only so the daily
  // post can draw its picture, and a year of them is 27 binders; under All they would bury
  // everything else. They sit behind one chip that only appears for an account that has any.
  const puzzleBinders = store.showcaseBinders;
  const showVisibilityFilter = store.userBinders.length >= 2 || puzzleBinders.length > 0;
  const q = binderQuery.trim().toLowerCase();
  // Most recently edited first: the binder someone is working on is the one they came back for.
  const shelf = visibility === 'puzzles' ? puzzleBinders : store.userBinders;
  // THE QUERY REACHES INTO THE BINDER (owner, 2026-11-02): title, description, then page titles
  // and page notes. A binder is remembered by the page in it ("the Pikachu page") as often as by
  // its name, and half of all pages already have one. Cheap: the binders are in memory.
  const visibleBinders = sortByRecentEdit(shelf).filter((b) => {
    if (showVisibilityFilter && visibility === 'public' && !b.isPublic) return false;
    if (showVisibilityFilter && visibility === 'private' && b.isPublic) return false;
    return !showBinderSearch || !q || matchBinder(b, q) !== null;
  });

  const menuBinder = menuId ? (store.getBinder(menuId) ?? null) : null;
  const shareBinder = shareId ? store.getBinder(shareId) : null;
  const coverBinder = coverId ? store.getBinder(coverId) : null;
  const printBinder = printId ? store.getBinder(printId) : null;

  const startRename = () => {
    if (!menuBinder) return;
    setRenameText(menuBinder.title);
    setRenameId(menuBinder.id);
    setMenuId(null);
  };
  const saveRename = () => {
    if (renameId) {
      track('binder.rename');
      store.updateBinder(renameId, { title: renameText.trim() || fillerName() });
    }
    setRenameId(null);
  };
  const duplicateFromMenu = () => {
    if (menuBinder) {
      const copy = store.duplicateBinder(menuBinder.id);
      if (copy) showToast('Binder duplicated');
      else {
        // The store refused past the binder cap — the same wall as handleNew, reached by a
        // different door, so it reports the same limit on the same surface.
        capGate.hit({
          limit: 'binders',
          surface: 'my_binders',
          isGuest: store.tier === 'guest',
          title: 'You are at your binder limit',
          message: binderLimitMessage(store.tier, store.limits),
          trialMessage: binderTrialMessage(store.limits),
          tier: store.tier,
          used: store.binderCount,
          cap: store.limits.binders,
        });
      }
    }
    setMenuId(null);
  };
  const shareFromMenu = () => {
    if (menuBinder) setShareId(menuBinder.id);
    setMenuId(null);
  };
  const printFromMenu = () => {
    if (menuBinder) setPrintId(menuBinder.id);
    setMenuId(null);
  };
  const coverFromMenu = () => {
    setMenuId(null);
    if (!menuBinder) return;
    // One free taste (store.taste): a free account's first cover goes through, with a word on why.
    const open = store.taste.pass('binderCovers', hasBinderCovers(store.tier), 'my_binders');
    if (open === 'tasted') showLimitToast(tasteToast('binderCovers', store.tier, store.taste.left('binderCovers')));
    if (open) setCoverId(menuBinder.id);
    else showLimitToast('Binder covers are a PRO feature: dress the binder and decorate all four cover surfaces.');
  };
  const deleteFromMenu = () => {
    if (!menuBinder) return;
    const { id, title, isExample, isDemo } = menuBinder;
    // Skip the type-the-name gate for a throwaway: an example/demo binder, or a duplicate the user
    // just made and hasn't edited. Anything they've put work into still requires typing the name.
    const easy = !!isExample || !!isDemo || store.isPristineDuplicate(id);
    setMenuId(null);
    setConfirm({
      title: 'Delete this binder?',
      message: 'This binder and all its pages will be permanently deleted.',
      confirmLabel: 'Delete binder',
      destructive: true,
      requireText: easy ? undefined : title,
      onConfirm: () => {
        store.deleteBinder(id);
        showToast('Binder deleted');
      },
    });
  };

  return (
    <>
      {/* The sharing attestation also opens HERE, not only inside a binder: this is where a
          returning builder with existing binders actually lands, and someone who never opens the
          editor would otherwise never be asked. No binder in hand, so accepting turns sharing on
          without publishing anything that already exists. */}
      <RightsPrompt surface="my-binders" />
      {/* One-time second chance for the accounts the trial was wasted on. Self-gates to a fixed
          migration-set cohort and asks once; renders null for everyone else. */}
      <ProTrialPrompt surface="my-binders" />
      {/* THE SHARED FRAME (MIC-017, layout only). A top-level page: no way back. The ad arrival's
          `?open=seeded` redirect (the effect above) is untouched. */}
      <PageShell maxWidth={MaxContentWidthWide} back={false} footer={false}>
          {/* Read-only because another tab of this browser owns editing. It belongs here as
              much as in the binder: adding a card from the collection saves too. */}
          <EditLockBanner />
          <SaveErrorBanner />
          {/* The guest binder that came back after the Sign in tab bug (2026-10-30): once, to its owner. */}
          <ReturnedBinderBanner />
          {/* No page title, the "My binders" section header is the top of the page. The account
              button (Sign in for anyone without an account) sits top right as it does on Home.
              Where the rail is hidden (native / narrow web), keep a way back Home on the left. */}
          <View style={styles.topRow}>
            <View />
            <AccountButton />
          </View>

          {/* My collection — the tcgscan-fed inventory — and the binder shelf, whose order it
              decides: the import on-ramp sits above the shelf until there are cards. */}
          <MyCollection
            shelf={
          <HomeSection
            title="My Binders"
            collapsible={false}
            action={
              <View style={styles.actionRow}>
                {canStory ? (
                  <Pressable
                    onPress={() => setStoryOpen(true)}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.storyBtn, pressed && styles.pressed]}>
                    <Text style={styles.storyBtnText}>Story binder</Text>
                  </Pressable>
                ) : null}
                {/* No + New here: the empty shelf has its own button, and a full one ends in a New
                    binder tile (the cover grid, MIC-017). */}
              </View>
            }>
            {store.userBinders.length === 0 && SHELF ? (
              <View style={styles.quietEmpty} testID="my-binders-empty-quiet">
                <ThemedText type="small" themeColor="textSecondary">
                  No binders yet.
                </ThemedText>
                <Pressable onPress={handleNew} accessibilityRole="button" style={({ pressed }) => [styles.newBtn, pressed && styles.pressed]}>
                  <Text style={styles.newBtnText}>+ New binder</Text>
                </Pressable>
              </View>
            ) : store.userBinders.length === 0 ? (
              // THE EMPTY SHELF IS A CARD LIKE ITS NEIGHBOURS: full width, a picture of an empty
              // page on the left, and the two things to do about it as buttons. It was a narrow
              // grey line of instructions between two illustrated cards, and read as a gap.
              <ThemedView type="backgroundElement" style={styles.empty}>
                <View style={styles.emptyPage} pointerEvents="none">
                  <BinderGrid page={EMPTY_PAGE} width={EMPTY_PAGE_W} />
                </View>
                <View style={styles.emptyBody}>
                  <ThemedText type="subtitle" style={styles.emptyTitle}>
                    No binders yet.
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>
                    Start one from a blank page, or open an example and duplicate it to make it
                    yours. A collection you import above can build one for you.
                  </ThemedText>
                  <View style={styles.emptyActions}>
                    <Pressable onPress={handleNew} accessibilityRole="button" style={({ pressed }) => [styles.newBtn, pressed && styles.pressed]}>
                      <Text style={styles.newBtnText}>+ New binder</Text>
                    </Pressable>
                    <Pressable onPress={() => router.push('/')} accessibilityRole="link" style={({ pressed }) => [styles.storyBtn, pressed && styles.pressed]}>
                      <Text style={styles.storyBtnText}>See the examples</Text>
                    </Pressable>
                  </View>
                </View>
              </ThemedView>
            ) : (
              <>
                {/* NOT ON ARRIVAL (analytics-studio, 2026-10-30): a guest's cap is one binder and
                    /my-binders?open=new makes it, so every Reddit arrival read "you are at your
                    binder limit, create an account" a second after landing, before the editor
                    opened. The first binder is not a wall; a second + New binder tap meets the
                    cap gate (handleNew) and says so then. */}
                {store.atBinderLimit && !(store.tier === 'guest' && store.binderCount <= 1) ? (
                  <View style={styles.upgradeRow}>
                    {store.tier === 'guest' ? (
                      <SignInPerk surface="binder_cap" message={binderLimitMessage(store.tier, store.limits)} />
                    ) : (
                      <CapGateOffer
                        message={binderLimitMessage(store.tier, store.limits)}
                        trialMessage={binderTrialMessage(store.limits)}
                        surface="my_binders"
                      />
                    )}
                  </View>
                ) : null}
                {showVisibilityFilter ? (
                  <View style={styles.visibilityRow}>
                    {(
                      [
                        ['all', 'All', store.userBinders.length],
                        ['public', 'Public', publicCount],
                        ['private', 'Private', privateCount],
                        ...(puzzleBinders.length ? [['puzzles', 'Puzzles', puzzleBinders.length]] : []),
                      ] as [Visibility, string, number][]
                    ).map(([v, label, n]) => (
                      <Pressable
                        key={v}
                        onPress={() => pickVisibility(v)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: visibility === v }}
                        accessibilityLabel={`${label}, ${n} binder${n === 1 ? '' : 's'}`}
                        style={[pillChip.base, visibility === v && pillChip.active]}>
                        <Text style={[pillChip.text, visibility === v && pillChip.textActive]}>
                          {label} {n}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
                {showBinderSearch ? (
                  <TextInput
                    value={binderQuery}
                    onChangeText={setBinderQuery}
                    placeholder={`Search your ${store.userBinders.length} binders…`}
                    placeholderTextColor={Palette.muted}
                    autoCorrect={false}
                    clearButtonMode="while-editing"
                    style={styles.binderSearch}
                  />
                ) : null}
                {visibleBinders.length === 0 ? (
                  <ThemedText type="small" themeColor="textSecondary" style={styles.noMatch}>
                    {/* Name the filter that emptied the list, not "no results": with two filters
                        running, the useful thing is knowing which one to undo. */}
                    {q && showBinderSearch
                      ? `No ${visibility === 'all' ? '' : visibility === 'puzzles' ? 'puzzle ' : `${visibility} `}binders match “${binderQuery.trim()}”.`
                      : visibility === 'public'
                        ? 'None of your binders are public yet. Open one and turn on sharing to get a link.'
                        : visibility === 'private'
                          ? 'Every one of your binders is public.'
                          : 'No binders yet.'}
                  </ThemedText>
                ) : (
                  // THE SHELF AS A COVER GRID (MIC-017, 2026-11-08): three across on a phone, up to six
                  // on a desk, every binder visible at once instead of one per screen. Cover and Print
                  // live in each tile's ⋯ menu (BinderActionsMenu), which already offered both; the
                  // tile keeps the ⋯ and a search hit's page line. New binder is the last tile.
                  <>
                  {SHELF ? (
                    <View style={styles.viewSwitch} accessibilityRole="radiogroup" testID="binder-view-switch">
                      {(['grid', 'shelf'] as const).map((v) => (
                        <Pressable
                          key={v}
                          onPress={() => pickView(v)}
                          accessibilityRole="radio"
                          accessibilityState={{ checked: shelfView === v }}
                          testID={`binder-view-${v}`}
                          style={[styles.viewOpt, shelfView === v && styles.viewOptOn]}>
                          <Text style={[styles.viewOptText, shelfView === v && styles.viewOptTextOn]}>{v === 'grid' ? 'Grid' : 'Shelf'}</Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                  {SHELF && shelfView === 'shelf' ? (
                    <>
                      <BinderShelf binders={visibleBinders} onOpen={openBinder} accessory={(b) => <MenuButton onPress={() => setMenuId(b.id)} />} testID="my-binders-shelf" />
                      <Pressable onPress={handleNew} accessibilityRole="button" testID="my-binders-new-shelf" style={({ pressed }) => [styles.shelfNew, pressed && styles.pressed]}>
                        <Text style={styles.newTileText}>+ New binder</Text>
                      </Pressable>
                    </>
                  ) : (
                  <BinderCoverGrid
                    binders={visibleBinders}
                    onOpen={openBinder}
                    minTile={104}
                    minCols={3}
                    maxCols={SHELF ? 5 : 6}
                    pageSize={SHELF ? 10 : undefined}
                    testID="my-binders-grid"
                    accessory={(binder) => {
                      const hit = q && showBinderSearch ? matchBinder(binder, q) : null;
                      return (
                        <View style={styles.tileActionsWrap}>
                          {hit?.kind === 'page' ? (
                            <Pressable
                              onPress={() => router.push(`/binder/${binder.id}?edit=1&page=${hit.pageIndex + 1}`)}
                              hitSlop={6}
                              accessibilityRole="button"
                              accessibilityLabel={`Open ${binder.title} on page ${hit.pageIndex + 1}, ${hit.pageTitle}`}
                              style={({ pressed }) => [styles.pageHit, pressed && styles.pressed]}>
                              <Text style={styles.pageHitText} numberOfLines={1}>
                                p. {hit.pageIndex + 1}
                              </Text>
                            </Pressable>
                          ) : null}
                          <MenuButton onPress={() => setMenuId(binder.id)} />
                        </View>
                      );
                    }}
                    trailing={(w) => (
                      <Pressable
                        onPress={handleNew}
                        accessibilityRole="button"
                        accessibilityLabel="New binder"
                        testID="my-binders-new-tile"
                        style={({ pressed }) => [styles.newTile, { width: w, height: pageBoxHeight(w, 3, 3) + 44 }, pressed && styles.pressed]}>
                        <Text style={styles.newTilePlus}>+</Text>
                        <Text style={styles.newTileText}>New binder</Text>
                      </Pressable>
                    )}
                  />
                  )}
                  </>
                )}
              </>
            )}
          </HomeSection>
            }
            autoCurate={curate === 'example' || curate === 'import' ? curate : null}
            autoCurateFrom={typeof from === 'string' ? from : undefined}
            onToast={showToast}
            onCapHit={capGate.hit}
            onOpenBinder={openBinder}
            onFindSimilar={driveSimilarIds}
            onViewSet={driveViewSet}
          />
          <View style={styles.shellTail} />
      </PageShell>

      {menuBinder && (
        <BinderActionsMenu
          title={menuBinder.title}
          canShare={isSupabaseConfigured}
          readOnly={!!menuBinder.isDemo}
          onRename={startRename}
          onDuplicate={duplicateFromMenu}
          onShare={shareFromMenu}
          onCover={menuBinder.isDemo ? undefined : coverFromMenu}
          onPrint={menuBinder.isDemo ? undefined : printFromMenu}
          onDelete={deleteFromMenu}
          onClose={() => setMenuId(null)}
        />
      )}
      {coverBinder && (
        <BinderCoverSheet
          binder={coverBinder}
          onChange={(cover) => store.updateBinder(coverBinder.id, { cover })}
          onClose={() => setCoverId(null)}
        />
      )}
      {renameId && (
        <RenameDialog
          value={renameText}
          onChange={setRenameText}
          onSave={saveRename}
          onCancel={() => setRenameId(null)}
        />
      )}
      {shareBinder && (
        <ShareSheet
          visible
          binder={shareBinder}
          isPublic={!!shareBinder.isPublic}
          onClose={() => setShareId(null)}
          onSetPublic={(v) => store.updateBinder(shareBinder.id, { isPublic: v })}
          onSetPagePublic={(pageId, v) => store.updatePage(shareBinder.id, pageId, { isPublic: v })}
          onSetSharePages={(ids) => store.updateBinder(shareBinder.id, { sharePageIds: ids })}
          onToast={showToast}
        />
      )}
      {printBinder ? (
        <PrintPlaceholdersSheet
          binder={printBinder}
          onClose={() => setPrintId(null)}
          onDone={({ sheets, summary }) => showToast(`Downloaded: ${summary}. ${sheets} sheet${sheets === 1 ? '' : 's'} to print.`)}
        />
      ) : null}
      <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} />
      <Toast spec={toast} onDismiss={() => setToast(null)} />
      {canStory ? (
        <StoryBinderSheet
          visible={storyOpen}
          onClose={() => setStoryOpen(false)}
          onCap={() => showLimitToast(binderLimitMessage(store.tier, store.limits))}
          onBuilt={(binderId, pageCount, artPlaced, artFailed) => {
            showToast(
              `Built ${pageCount} pages${artPlaced ? `, ${artPlaced} art panels` : ''}${artFailed ? `, ${artFailed} panels left empty` : ''}.`,
              { text: 'Open it', binderId },
            );
            openBinder(binderId);
          }}
        />
      ) : null}
      <CapGateDialog wall={capGate.wall} onDismiss={capGate.dismissWall} onResolve={capGate.resolveWall} guestAuth={capGate.guestAuth} onCloseGuestAuth={capGate.closeGuestAuth} />
    </>
  );
}

function MenuButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityLabel="Binder actions"
      style={({ pressed }) => [styles.menuBtn, pressed && styles.pressed]}>
      <Text style={styles.menuBtnText}>⋯</Text>
    </Pressable>
  );
}

function RenameDialog({
  value,
  onChange,
  onSave,
  onCancel,
}: {
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.renameBackdrop} onPress={onCancel}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.renameCardWrap}>
          <ThemedView type="backgroundElement" style={styles.renameCard}>
            <ThemedText type="smallBold">Rename binder</ThemedText>
            <TextInput
              value={value}
              onChangeText={onChange}
              autoFocus
              placeholder="Binder title"
              placeholderTextColor={Palette.muted}
              onSubmitEditing={onSave}
              style={styles.renameInput}
            />
            <View style={styles.renameActions}>
              <Pressable onPress={onCancel} style={styles.renameCancel} hitSlop={6}>
                <Text style={styles.renameCancelText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={onSave} style={styles.renameSave} hitSlop={6}>
                <Text style={styles.renameSaveText}>Save</Text>
              </Pressable>
            </View>
          </ThemedView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** The picture in the empty shelf: a 3x3 page with nothing in it yet. */
const EMPTY_PAGE: DemoPage = { id: 'empty-shelf', rows: 3, cols: 3, slots: [] };
const EMPTY_PAGE_W = 132;

const styles = StyleSheet.create({
  // MIC-017 piece 6: the Grid / Shelf switch, the shelf's New binder and the quiet empty shelf.
  viewSwitch: { flexDirection: 'row', alignSelf: 'flex-end', borderRadius: Radius.pill, borderWidth: 1, borderColor: Palette.hairline, padding: 2, marginBottom: 10 },
  viewOpt: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: Radius.pill },
  viewOptOn: { backgroundColor: Palette.accent },
  viewOptText: { fontSize: FontSize.sm, fontWeight: '600', color: Palette.ink },
  viewOptTextOn: { color: Palette.accentText },
  shelfNew: { alignSelf: 'flex-start', marginTop: 16, paddingHorizontal: 16, paddingVertical: 10, borderRadius: Radius.pill, borderWidth: 1, borderColor: Palette.hairlineStrong, borderStyle: 'dashed' },
  quietEmpty: { alignItems: 'center', gap: 12, paddingVertical: 40 },
  // The old scroll view's bottom room, for the phone's menu button.
  shellTail: { height: BottomTabInset + Spacing.four },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.three,
  },
  // Both empty-shelf buttons at 44 pt (MIC-020, 2026-11-08; they were 36 and 31).
  newBtn: {
    minHeight: 44,
    justifyContent: 'center',
    backgroundColor: Palette.accent,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
  },
  newBtnText: { color: Palette.accentText, fontWeight: Weight.bold, fontSize: FontSize.control },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  storyBtn: {
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Palette.accent,
  },
  storyBtnText: { color: Palette.accent, fontWeight: Weight.semibold, fontSize: FontSize.label },
  pressed: { opacity: 0.7 },
  empty: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.four,
    padding: Spacing.four,
    borderRadius: Radius.lg,
  },
  emptyPage: { width: EMPTY_PAGE_W },
  emptyBody: { flex: 1, minWidth: 240, gap: Spacing.two },
  emptyTitle: { marginBottom: 0 },
  emptyText: { lineHeight: 20, maxWidth: 520 },
  emptyActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.two, marginTop: Spacing.one },
  binderSearch: {
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
    borderRadius: Radius.control,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: FontSize.control,
    color: Palette.ink,
    marginBottom: Spacing.three,
    maxWidth: 480,
  },
  visibilityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginBottom: Spacing.three,
  },
  noMatch: { paddingVertical: Spacing.three },
  upgradeRow: { marginBottom: Spacing.three },
  tileActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  tileActionsWrap: { gap: Spacing.one, alignItems: 'flex-end' },
  newTile: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Palette.hairlineStrong,
    borderRadius: Radius.panel,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
  },
  newTilePlus: { fontSize: 30, lineHeight: 32, color: Palette.ink3 },
  newTileText: { fontSize: FontSize.body, fontWeight: Weight.bold, color: Palette.ink2 },
  pageHit: { alignSelf: 'flex-start' },
  pageHitText: { color: Palette.accent, fontSize: FontSize.label, fontWeight: Weight.semibold },
  printBtn: {
    backgroundColor: Palette.accent,
    borderRadius: Radius.pill,
    paddingVertical: 5,
    paddingHorizontal: Spacing.three,
    minHeight: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  printBtnText: { color: Palette.accentText, fontSize: FontSize.label, fontWeight: Weight.semibold },
  // Panel-filled, not accent: Print is the tile's headline verb and two filled pills side by side
  // would leave the row with no verb at all. Same height as Print so they sit on one baseline.
  coverBtn: {
    backgroundColor: Palette.accent,
    borderRadius: Radius.pill,
    paddingVertical: 5,
    paddingHorizontal: Spacing.three,
    minHeight: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverBtnText: { color: Palette.accentText, fontSize: FontSize.label, fontWeight: Weight.semibold },
  menuBtn: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.panel,
  },
  menuBtnText: { fontSize: FontSize.md, lineHeight: 20, color: Palette.ink2, fontWeight: Weight.bold },
  renameBackdrop: {
    flex: 1,
    backgroundColor: Palette.scrim45,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  renameCardWrap: { width: '100%', maxWidth: 380 },
  renameCard: { borderRadius: Radius.lg, padding: Spacing.four, gap: Spacing.three },
  renameInput: {
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
    borderRadius: Radius.control,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: FontSize.control,
    color: Palette.ink,
  },
  renameActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.two },
  renameCancel: { paddingVertical: Spacing.two, paddingHorizontal: Spacing.three },
  renameCancelText: { fontSize: FontSize.control, fontWeight: Weight.semibold, color: Palette.muted },
  renameSave: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.control,
    backgroundColor: Palette.accent,
  },
  renameSaveText: { fontSize: FontSize.control, fontWeight: Weight.semibold, color: Palette.accentText },
});
