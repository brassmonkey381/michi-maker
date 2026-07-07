import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AccountButton } from '@/components/auth/AccountButton';
import { BinderScreen } from '@/components/binder/BinderScreen';
import { BinderThumb } from '@/components/binder/BinderThumb';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useBinders } from '@/store/binders';

export default function BindersScreen() {
  const store = useBinders();
  const { width } = useWindowDimensions();
  const [openId, setOpenId] = useState<string | null>(null);

  // Note: we deliberately do NOT load the catalog here. Binder covers resolve their image
  // straight from the card id (cardThumbUrl → card-thumbs/245/<id>.webp), so the home screen
  // paints images immediately without waiting on the ~25 MB catalog.json. The catalog only
  // loads when the editor/picker opens (names, set browse, jumbo/V-UNION grouping).

  const contentWidth = Math.min(width, MaxContentWidth) - Spacing.four * 2;
  const columns = contentWidth > 520 ? 3 : 2;
  const gap = Spacing.three;
  const tileWidth = (contentWidth - gap * (columns - 1)) / columns;

  const handleNew = () => {
    const binder = store.createBinder({ title: 'New binder' });
    setOpenId(binder.id);
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.headerRow}>
            <ThemedText type="title" style={styles.h1}>
              poke-michi
            </ThemedText>
            <AccountButton />
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
              <View style={[styles.grid, { gap }]}>
                {store.userBinders.map((binder) => (
                  <BinderThumb
                    key={binder.id}
                    binder={binder}
                    width={tileWidth}
                    onPress={() => setOpenId(binder.id)}
                  />
                ))}
              </View>
            )}
          </Section>

          <Section title="Example binders">
            <View style={[styles.grid, { gap }]}>
              {store.exampleBinders.map((binder) => (
                <BinderThumb
                  key={binder.id}
                  binder={binder}
                  width={tileWidth}
                  onPress={() => setOpenId(binder.id)}
                />
              ))}
            </View>
          </Section>
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
  h1: { fontSize: 34, lineHeight: 40 },
  newBtn: {
    backgroundColor: '#3B82F6',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: 999,
  },
  newBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
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
  empty: { padding: Spacing.four, borderRadius: 16 },
  emptyText: { lineHeight: 20 },
});
