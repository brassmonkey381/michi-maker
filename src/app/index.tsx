import { useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AccountButton } from '@/components/auth/AccountButton';
import { BinderActionsMenu } from '@/components/binder/BinderActionsMenu';
import { BinderCarousel } from '@/components/binder/BinderCarousel';
import { BinderScreen } from '@/components/binder/BinderScreen';
import { BinderThumb } from '@/components/binder/BinderThumb';
import { ConfirmDialog, type ConfirmSpec } from '@/components/binder/ConfirmDialog';
import { ShareSheet } from '@/components/binder/ShareSheet';
import { Toast, type ToastSpec } from '@/components/binder/Toast';
import { HomeBrowse } from '@/components/HomeBrowse';
import { SettingsButton } from '@/components/settings/SettingsSheet';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, FontSize, MaxContentWidth, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { isSupabaseConfigured } from '@/lib/env';
import { useImageManifest } from '@/lib/catalogConfig';
import { useBinders } from '@/store/binders';

export default function BindersScreen() {
  const store = useBinders();
  const { width } = useWindowDimensions();
  const [openId, setOpenId] = useState<string | null>(null);
  // Filter Your Binders by title once the library grows — so finding one doesn't mean scrolling.
  const [binderQuery, setBinderQuery] = useState('');
  // Per-binder ⋯ management (rename / duplicate / share / delete) without opening the editor.
  const [menuId, setMenuId] = useState<string | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [shareId, setShareId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const [toast, setToast] = useState<ToastSpec | null>(null);
  const toastId = useRef(0);
  const showToast = (message: string) => {
    toastId.current += 1;
    setToast({ id: toastId.current, message });
  };

  // Note: we deliberately do NOT load the catalog here. Binder covers resolve their image
  // straight from the card id (cardThumbUrl), so the home screen paints images immediately
  // without waiting on the ~25 MB catalog.json. The catalog only loads when the editor/picker
  // opens (names, set browse, jumbo/V-UNION grouping).
  //
  // Hosted images are content-hashed, so cardThumbUrl resolves ids through the lite image
  // manifest — hydrate it here (instant from the AsyncStorage cache, then a background
  // refresh) so covers repaint with their hashed URLs. Static/dev mode is a no-op (covers
  // fall back to the flat convention path).
  useImageManifest();

  const contentWidth = Math.min(width, MaxContentWidth) - Spacing.four * 2;
  // Fewer, larger binder tiles: 2-up on tablet/desktop (bigger covers + cards), 1-up only on
  // very narrow phones. (Was 3-up > 520, which made the covers small on the web layout.)
  const columns = contentWidth < 340 ? 1 : 2;
  const gap = Spacing.three;
  const tileWidth = (contentWidth - gap * (columns - 1)) / columns;

  const handleNew = () => {
    const binder = store.createBinder({ title: 'New binder' });
    setOpenId(binder.id);
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
      store.duplicateBinder(menuBinder.id);
      showToast('Binder duplicated');
    }
    setMenuId(null);
  };
  const shareFromMenu = () => {
    if (menuBinder) setShareId(menuBinder.id);
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
              poke-michi
            </ThemedText>
            <View style={styles.headerActions}>
              <SettingsButton />
              <AccountButton />
            </View>
          </View>

          <Section
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
                  <View style={[styles.grid, { gap }]}>
                    {visibleBinders.map((binder) => (
                      <BinderThumb
                        key={binder.id}
                        binder={binder}
                        width={tileWidth}
                        onPress={() => setOpenId(binder.id)}
                        accessory={<MenuButton onPress={() => setMenuId(binder.id)} />}
                      />
                    ))}
                  </View>
                )}
              </>
            )}
          </Section>

          <Section title="Example binders">
            <BinderCarousel binders={store.exampleBinders} onOpen={setOpenId} />
          </Section>

          <HomeBrowse onOpenBinder={setOpenId} />
        </ScrollView>
      </SafeAreaView>

      {openId && (
        <BinderScreen binderId={openId} onClose={() => setOpenId(null)} onOpenBinder={setOpenId} />
      )}

      {menuBinder && (
        <BinderActionsMenu
          title={menuBinder.title}
          canShare={isSupabaseConfigured}
          onRename={startRename}
          onDuplicate={duplicateFromMenu}
          onShare={shareFromMenu}
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
          binderId={shareBinder.id}
          isPublic={!!shareBinder.isPublic}
          onClose={() => setShareId(null)}
          onSetPublic={(v) => store.updateBinder(shareBinder.id, { isPublic: v })}
        />
      )}
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

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <ThemedText type="smallBold" style={styles.sectionTitle}>
          {title}
        </ThemedText>
        {action}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  scroll: {
    padding: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.six,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.four,
    gap: Spacing.three,
  },
  h1: { fontSize: FontSize.display, lineHeight: 40 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  newBtn: {
    backgroundColor: Palette.accent,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
  },
  newBtnText: { color: Palette.accentText, fontWeight: Weight.bold, fontSize: FontSize.control },
  pressed: { opacity: 0.7 },
  section: { marginBottom: Spacing.five },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.three,
  },
  sectionTitle: { textTransform: 'uppercase', letterSpacing: 0.5 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  empty: { padding: Spacing.four, borderRadius: Radius.lg },
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
  },
  noMatch: { paddingVertical: Spacing.three },
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
