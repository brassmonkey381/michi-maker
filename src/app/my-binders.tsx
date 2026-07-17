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
import { useRouter, type Href } from 'expo-router';
import { useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { sendBrowseCommand } from 'tcgscan-browse';

import { BinderActionsMenu } from '@/components/binder/BinderActionsMenu';
import { BinderCarousel } from '@/components/binder/BinderCarousel';
import { ConfirmDialog, type ConfirmSpec } from '@/components/binder/ConfirmDialog';
import { PrintPlaceholdersSheet } from '@/components/binder/PrintPlaceholdersSheet';
import { ShareSheet } from '@/components/binder/ShareSheet';
import { Toast, type ToastSpec } from '@/components/binder/Toast';
import { HomeCollection } from '@/components/HomeCollection';
import { HomeSection } from '@/components/HomeSection';
import { UpgradePerk } from '@/components/monetization/UpgradePerk';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Breakpoints, Fonts, FontSize, MaxContentWidth, MaxContentWidthWide, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { isSupabaseConfigured } from '@/lib/env';
import { useImageManifest } from '@/lib/catalogConfig';
import { useBinders } from '@/store/binders';

export default function MyBindersScreen() {
  const store = useBinders();
  const router = useRouter();
  const { width } = useWindowDimensions();
  // Where the rail isn't present (native, or narrow web) the page carries its own way back Home.
  const railHidden = Platform.OS !== 'web' || width < Breakpoints.rail;
  const openBinder = (id: string) => router.push(`/binder/${id}`);

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

  const showToast = (message: string) => {
    toastId.current += 1;
    setToast({ id: toastId.current, message });
  };

  // Collection tiles drive the card browser on /browse. The command bus holds one pending
  // command, so it lands the moment /browse's CatalogBrowser subscribes.
  const openBrowse = () => router.push('/browse' as Href);
  const driveSimilarIds = (cardIds: string[]) => {
    if (cardIds.length === 0) return;
    if (cardIds.length === 1) sendBrowseCommand({ type: 'similar', cardId: cardIds[0] });
    else sendBrowseCommand({ type: 'similarMany', cardIds });
    openBrowse();
  };
  const driveViewSet = (cardId: string) => {
    sendBrowseCommand({ type: 'viewSet', cardId });
    openBrowse();
  };

  // Covers resolve straight from the card id, so hydrate the lite image manifest for hashed URLs.
  useImageManifest();

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
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.headerRow}>
            <ThemedText type="title" style={styles.h1}>
              My binders
            </ThemedText>
            {railHidden ? (
              <Pressable onPress={() => router.push('/')} hitSlop={8}>
                <ThemedText type="smallBold" themeColor="textSecondary">
                  ‹ Home
                </ThemedText>
              </Pressable>
            ) : null}
          </View>

          <HomeSection
            title="Your binders"
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

          {/* My collection — the tcgscan-fed inventory; appears with the first scan/import. */}
          <HomeCollection
            onToast={showToast}
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
