import { Redirect, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { sendBrowseCommand } from 'tcgscan-browse';

import { AccountButton } from '@/components/auth/AccountButton';
import { GuestBanner } from '@/components/auth/GuestBanner';
import { AddToBinderSheet } from '@/components/binder/AddToBinderSheet';
import { BinderActionsMenu } from '@/components/binder/BinderActionsMenu';
import { BinderCarousel } from '@/components/binder/BinderCarousel';
import { ConfirmDialog, type ConfirmSpec } from '@/components/binder/ConfirmDialog';
import { PrintPlaceholdersSheet } from '@/components/binder/PrintPlaceholdersSheet';
import { ShareSheet } from '@/components/binder/ShareSheet';
import { Toast, type ToastSpec } from '@/components/binder/Toast';
import { HomeBrowse } from '@/components/HomeBrowse';
import { HomeCollection } from '@/components/HomeCollection';
import { HomeRecent } from '@/components/HomeRecent';
import { HomeSealed } from '@/components/HomeSealed';
import { HomeSection } from '@/components/HomeSection';
import { UpgradePerk } from '@/components/monetization/UpgradePerk';
import { PeopleButton } from '@/components/people/PeopleButton';
import { SettingsButton } from '@/components/settings/SettingsSheet';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Fonts, FontSize, MaxContentWidth, MaxContentWidthWide, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { pagesForCards } from '@/data/binderTypes';
import { isSupabaseConfigured } from '@/lib/env';
import { useImageManifest } from '@/lib/catalogConfig';
import { shouldShowLanding } from '@/lib/landing';
import { useBinders } from '@/store/binders';

export default function BindersScreen() {
  // First-time web visitors get the marketing page; any landing CTA sets the seen flag
  // before navigating back here, so this evaluates once per mount and never loops.
  const [showLanding] = useState(shouldShowLanding);
  const store = useBinders();
  const router = useRouter();
  const openBinder = (id: string) => router.push(`/binder/${id}`);
  // Filter Your Binders by title once the library grows — so finding one doesn't mean scrolling.
  const [binderQuery, setBinderQuery] = useState('');
  // Per-binder ⋯ management (rename / duplicate / share / delete) without opening the editor.
  const [menuId, setMenuId] = useState<string | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [shareId, setShareId] = useState<string | null>(null);
  const [printId, setPrintId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const [toast, setToast] = useState<ToastSpec | null>(null);
  const toastId = useRef(0);

  // The "Browse all cards" browser is controlled here so the Recent & Upcoming feed can
  // open it and drive it (Find similar / View set) to show results.
  const [browseOpen, setBrowseOpen] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const browseY = useRef(0);
  const revealBrowse = () => {
    setBrowseOpen(true);
    // Let the expand lay out before scrolling to it.
    setTimeout(() => scrollRef.current?.scrollTo({ y: browseY.current, animated: true }), 60);
  };
  const driveSimilar = (cardId: string) => {
    sendBrowseCommand({ type: 'similar', cardId });
    revealBrowse();
  };
  // Collection tiles: one card → plain similar; a multi-selection → similar-to-all.
  const driveSimilarIds = (cardIds: string[]) => {
    if (cardIds.length === 0) return;
    if (cardIds.length === 1) sendBrowseCommand({ type: 'similar', cardId: cardIds[0] });
    else sendBrowseCommand({ type: 'similarMany', cardIds });
    revealBrowse();
  };
  const driveViewSet = (cardId: string) => {
    sendBrowseCommand({ type: 'viewSet', cardId });
    revealBrowse();
  };
  // Sets carousel → open that set in the browser below (catalog-free command, works for guests).
  const driveViewSetById = (setId: string, series: string) => {
    sendBrowseCommand({ type: 'viewSetById', setId, seriesId: series || undefined });
    revealBrowse();
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
      showToast('You’ve reached your binder limit. Upgrade for more.');
      return;
    }
    // Atomic create-with-card — creating then adding would race the store snapshot.
    const binder = store.createBinder({ title: 'New binder', pages: pagesForCards([addCardId]) });
    setAddCardId(null);
    showAddedToast(binder.id, binder.title);
  };

  // Note: the binder sections here deliberately do NOT depend on the catalog. Binder covers
  // resolve their image straight from the card id (cardThumbUrl), so they paint immediately
  // without waiting on the ~10 MB catalog.json. (The <HomeRecent> feed below DOES force the
  // catalog load, but off this first-paint path — covers show first, the feed pops in when
  // the catalog resolves.)
  //
  // Hosted images are content-hashed, so cardThumbUrl resolves ids through the lite image
  // manifest — hydrate it here (instant from the AsyncStorage cache, then a background
  // refresh) so covers repaint with their hashed URLs. Static/dev mode is a no-op (covers
  // fall back to the flat convention path).
  useImageManifest();

  if (showLanding) return <Redirect href="/welcome" />;

  const handleNew = () => {
    if (store.atBinderLimit) {
      showToast('You’ve reached your binder limit. Upgrade for more.');
      return;
    }
    const binder = store.createBinder({ title: 'New binder' });
    openBinder(binder.id);
  };

  // Show the filter once there are enough binders that scanning gets tedious.
  const showBinderSearch = store.userBinders.length >= 4;
  const q = binderQuery.trim().toLowerCase();
  const visibleBinders =
    showBinderSearch && q
      ? store.userBinders.filter((b) => b.title.toLowerCase().includes(q))
      : store.userBinders;

  const menuBinder = menuId ? store.userBinders.find((b) => b.id === menuId) : null;
  const shareBinder = shareId ? store.getBinder(shareId) : null;
  const printBinder = printId ? store.getBinder(printId) : null;

  const startRename = () => {
    if (!menuBinder) return;
    setRenameText(menuBinder.title);
    setRenameId(menuBinder.id);
    setMenuId(null);
  };
  const saveRename = () => {
    if (renameId) store.updateBinder(renameId, { title: renameText.trim() || 'Untitled binder' });
    setRenameId(null);
  };
  const duplicateFromMenu = () => {
    if (menuBinder) {
      const copy = store.duplicateBinder(menuBinder.id);
      showToast(copy ? 'Binder duplicated' : 'You’ve reached your binder limit. Upgrade for more.');
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
  const deleteFromMenu = () => {
    if (!menuBinder) return;
    const id = menuBinder.id;
    setMenuId(null);
    setConfirm({
      title: 'Delete this binder?',
      message: 'This binder and all its pages will be permanently deleted.',
      confirmLabel: 'Delete binder',
      destructive: true,
      onConfirm: () => {
        store.deleteBinder(id);
        showToast('Binder deleted');
      },
    });
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll}>
          <View style={styles.headerRow}>
            <ThemedText type="title" style={styles.h1}>
              poke-michi
            </ThemedText>
            <View style={styles.headerActions}>
              <PeopleButton />
              <SettingsButton />
              <AccountButton />
            </View>
          </View>

          <Pressable
            onPress={() => router.push('/michi-method')}
            hitSlop={6}
            style={({ pressed }) => [styles.methodLink, pressed && styles.pressed]}>
            <ThemedText type="small" themeColor="textSecondary">
              New here? What’s the Michi Method?
            </ThemedText>
          </Pressable>

          <GuestBanner />

          {/* Catalog-free sealed carousel: renders for everyone (guests included). */}
          <HomeSealed />

          {/* Recent & Upcoming — ONE feed for every auth state (the kit's RecentProducts runs
              catalog-free for guests/cold and from the catalog when signed-in). */}
          <HomeRecent
            onFindSimilar={driveSimilar}
            onViewSet={driveViewSet}
            onOpenSet={driveViewSetById}
            onAddToBinder={setAddCardId}
          />

          <HomeSection
            title="Your binders"
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
                  No binders yet. Tap “+ New” to start one, or open an example below and tap Duplicate to
                  make it yours.
                </ThemedText>
              </ThemedView>
            ) : (
              <>
                {store.atBinderLimit ? (
                  <View style={styles.upgradeRow}>
                    <UpgradePerk
                      message={`You’ve reached your ${store.limits.binders}-binder limit. Upgrade for more room.`}
                    />
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
                    No binders match “{binderQuery.trim()}”.
                  </ThemedText>
                ) : (
                  <BinderCarousel
                    binders={visibleBinders}
                    onOpen={openBinder}
                    accessory={(binder) => (
                      <View style={styles.tileActions}>
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

          {/* My collection — the tcgscan-fed inventory; appears with the first scan/import
              and updates live. Tap to multi-select, then place the picks into a binder. */}
          <HomeCollection
            onToast={showToast}
            onOpenBinder={openBinder}
            onFindSimilar={driveSimilarIds}
            onViewSet={driveViewSet}
          />

          {store.featuredBinders.length > 0 ? (
            <HomeSection title="Featured binders">
              <BinderCarousel binders={store.featuredBinders} onOpen={openBinder} />
            </HomeSection>
          ) : null}

          <HomeSection title="Example binders">
            <BinderCarousel binders={store.exampleBinders} onOpen={openBinder} />
          </HomeSection>

          <View onLayout={(e) => (browseY.current = e.nativeEvent.layout.y)}>
            <HomeBrowse open={browseOpen} onOpenChange={setBrowseOpen} onOpenBinder={openBinder} />
          </View>
        </ScrollView>
      </SafeAreaView>

      {menuBinder && (
        <BinderActionsMenu
          title={menuBinder.title}
          canShare={isSupabaseConfigured}
          onRename={startRename}
          onDuplicate={duplicateFromMenu}
          onShare={shareFromMenu}
          onPrint={printFromMenu}
          onDelete={deleteFromMenu}
          onClose={() => setMenuId(null)}
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
        />
      )}
      {printBinder ? (
        <PrintPlaceholdersSheet
          binder={printBinder}
          onClose={() => setPrintId(null)}
          onDone={(sheets) => showToast(`Placeholder PDF downloaded (${sheets + 1} pages)`)}
        />
      ) : null}
      {addCardId ? (
        <AddToBinderSheet
          binders={store.userBinders}
          onPick={addToExistingBinder}
          onNew={addToNewBinder}
          onClose={() => setAddCardId(null)}
        />
      ) : null}
      <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} />
      <Toast spec={toast} onDismiss={() => setToast(null)} />
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
    // Wide shell: the binder carousels / browse grids use the room to show more art. Prose
    // inside still caps itself at MaxContentWidth so line lengths stay readable.
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
  methodLink: { alignSelf: 'flex-start', marginTop: -Spacing.two, marginBottom: Spacing.three },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  newBtn: {
    backgroundColor: Palette.accent,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
  },
  newBtnText: { color: Palette.accentText, fontWeight: Weight.bold, fontSize: FontSize.control },
  pressed: { opacity: 0.7 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  // Prose stays readable inside the wide shell.
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
