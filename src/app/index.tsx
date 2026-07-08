import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AccountButton } from '@/components/auth/AccountButton';
import { BinderCarousel } from '@/components/binder/BinderCarousel';
import { BinderScreen } from '@/components/binder/BinderScreen';
import { BinderThumb } from '@/components/binder/BinderThumb';
import { HomeBrowse } from '@/components/HomeBrowse';
import { SettingsButton } from '@/components/settings/SettingsSheet';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, FontSize, MaxContentWidth, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { useImageManifest } from '@/lib/catalogConfig';
import { useBinders } from '@/store/binders';

export default function BindersScreen() {
  const store = useBinders();
  const { width } = useWindowDimensions();
  const [openId, setOpenId] = useState<string | null>(null);
  // Filter Your Binders by title once the library grows — so finding one doesn't mean scrolling.
  const [binderQuery, setBinderQuery] = useState('');

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

          <HomeBrowse />
        </ScrollView>
      </SafeAreaView>

      {openId && (
        <BinderScreen binderId={openId} onClose={() => setOpenId(null)} onOpenBinder={setOpenId} />
      )}
    </ThemedView>
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
});
