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
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { sendBrowseCommand } from 'tcgscan-browse';

import { BinderActionsMenu } from '@/components/binder/BinderActionsMenu';
import { BinderCoverSheet } from '@/components/binder/BinderCoverSheet';
import { BinderCarousel } from '@/components/binder/BinderCarousel';
import { ConfirmDialog, type ConfirmSpec } from '@/components/binder/ConfirmDialog';
import { EditLockBanner } from '@/components/binder/EditLockBanner';
import { SaveErrorBanner } from '@/components/binder/SaveErrorBanner';
import { PrintPlaceholdersSheet } from '@/components/binder/PrintPlaceholdersSheet';
import { ShareSheet } from '@/components/binder/ShareSheet';
import { Toast, type ToastSpec } from '@/components/binder/Toast';
import { CapGateDialog } from '@/components/monetization/CapGateDialog';
import { useCapGate } from '@/hooks/use-cap-gate';
import { similarityWall } from '@/data/similarityGate';
import { hasFindSimilar } from '@/data/tiers';
import { SignInPerk } from '@/components/auth/SignInPerk';
import { MyCollection } from '@/components/MyCollection';
import { HomeSection } from '@/components/HomeSection';
import { CapGateOffer } from '@/components/monetization/CapGateOffer';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Breakpoints, FontSize, MaxContentWidth, MaxContentWidthWide, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { ProTrialPrompt } from '@/components/monetization/ProTrialPrompt';
import { RightsPrompt } from '@/components/binder/RightsPrompt';
import { pillChip } from '@/constants/ui';
import { fillerName } from '@/data/binderTypes';
import { binderLimitMessage, binderTrialMessage, limitCta } from '@/data/limitMessages';
import { track } from '@/lib/analytics';
import { isSupabaseConfigured } from '@/lib/env';
import { useImageManifest } from '@/lib/catalogConfig';
import { useBinders } from '@/store/binders';

/** Which binders the list shows. Module-level so it survives leaving and coming back. */
type Visibility = 'all' | 'public' | 'private';
let visibilityPref: Visibility = 'all';

export default function MyBindersScreen() {
  const store = useBinders();
  const router = useRouter();
  const { width } = useWindowDimensions();
  // Where the rail isn't present (native, or narrow web) the page carries its own way back Home.
  const railHidden = Platform.OS !== 'web' || width < Breakpoints.rail;
  const openBinder = (id: string) => router.push(`/binder/${id}`);
  // `/my-binders?curate=example|import&from=<surface>`: a CurateCallout elsewhere sent them here
  // to import, and the sheet should already be open when the page lands.
  const { curate, from, open } = useLocalSearchParams<{ curate?: string; from?: string; open?: string }>();
  // `/my-binders?open=slice` (the slice guide's button): straight into a binder of theirs, editing,
  // with the Slice Studio open. The newest binder they have, or a fresh one if the shelf is empty.
  const openedStudio = useRef(false);
  useEffect(() => {
    if (open !== 'slice' || openedStudio.current || store.loading) return;
    openedStudio.current = true;
    const target = store.userBinders[0] ?? store.createBinder({ title: 'New binder' });
    if (target) router.replace(`/binder/${target.id}?slice=1` as Href);
  }, [open, store, router]);

  const [binderQuery, setBinderQuery] = useState('');
  // Per-binder ⋯ management (rename / duplicate / share / delete) without opening the editor.
  const [menuId, setMenuId] = useState<string | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [shareId, setShareId] = useState<string | null>(null);
  const [printId, setPrintId] = useState<string | null>(null);
  const [coverId, setCoverId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const [toast, setToast] = useState<ToastSpec | null>(null);
  const toastId = useRef(0);

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
  const showLimitToast = (message: string) => {
    toastId.current += 1;
    setToast({ id: toastId.current, message, tone: 'limit', cta: limitCta(store.tier) });
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
    if (!hasFindSimilar(store.tier)) {
      capGate.hit(similarityWall(store.tier, 'my_binders'));
      return;
    }
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
  const showVisibilityFilter = store.userBinders.length >= 2;
  const q = binderQuery.trim().toLowerCase();
  const visibleBinders = store.userBinders.filter((b) => {
    if (showVisibilityFilter && visibility === 'public' && !b.isPublic) return false;
    if (showVisibilityFilter && visibility === 'private' && b.isPublic) return false;
    return !showBinderSearch || !q || b.title.toLowerCase().includes(q);
  });

  const menuBinder = menuId ? store.userBinders.find((b) => b.id === menuId) : null;
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
    if (renameId) store.updateBinder(renameId, { title: renameText.trim() || fillerName() });
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
    if (menuBinder) setCoverId(menuBinder.id);
    setMenuId(null);
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
    <ThemedView style={styles.container}>
      {/* The sharing attestation also opens HERE, not only inside a binder: this is where a
          returning builder with existing binders actually lands, and someone who never opens the
          editor would otherwise never be asked. No binder in hand, so accepting turns sharing on
          without publishing anything that already exists. */}
      <RightsPrompt surface="my-binders" />
      {/* One-time second chance for the accounts the trial was wasted on. Self-gates to a fixed
          migration-set cohort and asks once; renders null for everyone else. */}
      <ProTrialPrompt surface="my-binders" />
      <SafeAreaView style={styles.flex} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scroll}>
          {/* Read-only because another tab of this browser owns editing. It belongs here as
              much as in the binder: adding a card from the collection saves too. */}
          <EditLockBanner />
          <SaveErrorBanner />
          {/* No page title, the "My binders" section header is the top of the page. Where the
              rail is hidden (native / narrow web), keep a way back Home. */}
          {railHidden ? (
            <View style={styles.backRow}>
              <Pressable onPress={() => router.push('/')} hitSlop={8}>
                <ThemedText type="smallBold" themeColor="textSecondary">
                  ‹ Home
                </ThemedText>
              </Pressable>
            </View>
          ) : null}

          {/* My collection — the tcgscan-fed inventory — and the binder shelf, whose order it
              decides: the import on-ramp sits above the shelf until there are cards. */}
          <MyCollection
            shelf={
          <HomeSection
            title="My binders"
            collapsible={false}
            action={
              <Pressable
                onPress={handleNew}
                style={({ pressed }) => [styles.newBtn, pressed && styles.pressed]}>
                <Text style={styles.newBtnText}>+ New</Text>
              </Pressable>
            }>
            {store.userBinders.length === 0 ? (
              <ThemedView type="backgroundElement" style={styles.empty}>
                <ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>
                  No binders yet. Tap “+ New” to start one, or open an example on the Home page and
                  tap Duplicate to make it yours.
                </ThemedText>
              </ThemedView>
            ) : (
              <>
                {store.atBinderLimit ? (
                  <View style={styles.upgradeRow}>
                    {store.tier === 'guest' ? (
                      <SignInPerk message={binderLimitMessage(store.tier, store.limits)} />
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
                      ] as const
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
                      ? `No ${visibility === 'all' ? '' : `${visibility} `}binders match “${binderQuery.trim()}”.`
                      : visibility === 'public'
                        ? 'None of your binders are public yet. Open one and turn on sharing to get a link.'
                        : visibility === 'private'
                          ? 'Every one of your binders is public.'
                          : 'No binders yet.'}
                  </ThemedText>
                ) : (
                  <BinderCarousel
                    binders={visibleBinders}
                    onOpen={openBinder}
                    accessory={(binder) => (
                      <View style={styles.tileActions}>
                        {/* THE COVER, ON THE SHELF. It was reachable only from the ⋯ menu, which
                            is where you go when you already know a thing exists — and a binder
                            you have never dressed is exactly the case where you do not. The verb
                            changes because the two are different jobs: picking a binder for the
                            first time, and going back to one you chose.

                            Hidden on demo binders, matching the ⋯ menu: they are read-only, so a
                            model picked there would be a choice that cannot be saved. */}
                        {binder.isDemo ? null : (
                          <Pressable
                            onPress={() => setCoverId(binder.id)}
                            hitSlop={8}
                            accessibilityLabel={
                              binder.cover
                                ? `Edit the cover on ${binder.title}`
                                : `Add a cover to ${binder.title}`
                            }
                            style={({ pressed }) => [styles.coverBtn, pressed && styles.pressed]}>
                            <Text style={styles.coverBtnText}>
                              {binder.cover ? 'Edit Cover' : 'Add Cover'}
                            </Text>
                          </Pressable>
                        )}
                        <Pressable
                          onPress={() => setPrintId(binder.id)}
                          hitSlop={8}
                          accessibilityLabel="Print fill sheets"
                          style={({ pressed }) => [styles.printBtn, pressed && styles.pressed]}>
                          <Text style={styles.printBtnText}>Print</Text>
                        </Pressable>
                        <MenuButton onPress={() => setMenuId(binder.id)} />
                      </View>
                    )}
                  />
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
        </ScrollView>
      </SafeAreaView>

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
          onDone={(sheets) => showToast(`Placeholder PDF downloaded (${sheets + 1} pages)`)}
        />
      ) : null}
      <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} />
      <Toast spec={toast} onDismiss={() => setToast(null)} />
      <CapGateDialog wall={capGate.wall} onDismiss={capGate.dismissWall} onResolve={capGate.resolveWall} />
    </ThemedView>
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

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  scroll: {
    padding: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.six,
    width: '100%',
    maxWidth: MaxContentWidthWide,
    alignSelf: 'center',
  },
  backRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.three },
  newBtn: {
    backgroundColor: Palette.accent,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
  },
  newBtnText: { color: Palette.accentText, fontWeight: Weight.bold, fontSize: FontSize.control },
  pressed: { opacity: 0.7 },
  empty: { padding: Spacing.four, borderRadius: Radius.lg, maxWidth: MaxContentWidth },
  emptyText: { lineHeight: 20 },
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
    backgroundColor: Palette.panel,
    borderRadius: Radius.pill,
    paddingVertical: 5,
    paddingHorizontal: Spacing.three,
    minHeight: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverBtnText: { color: Palette.ink2, fontSize: FontSize.label, fontWeight: Weight.semibold },
  menuBtn: {
    width: 30,
    height: 30,
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
