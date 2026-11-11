/**
 * HOME, YOUR BINDER FIRST (MIC-017 B2-A, owner pick 2026-11-11: "B2-A but replace 'browse cards'
 * with 'my binders'"). Most visits are someone coming back to their own binder, so Home opens on
 * it: the binder you edited last, big, with Open binder; a first visit gets "Start your first
 * binder" instead. Under it three plain actions: New binder, My binders, Discover.
 */
import { useRouter, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BinderThumb } from '@/components/binder/BinderThumb';
import { ThemedText } from '@/components/themed-text';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { sortByRecentEdit, type DemoBinder } from '@/data/binderTypes';

/** "edited today", "edited yesterday", "edited 4 days ago", else the date. */
function editedLabel(at?: string): string {
  if (!at) return '';
  const days = Math.floor((Date.now() - new Date(at).getTime()) / 86_400_000);
  if (days <= 0) return 'edited today';
  if (days === 1) return 'edited yesterday';
  if (days < 14) return `edited ${days} days ago`;
  return `edited ${new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

export function HomeKeepGoing({ binders, width, phone }: { binders: readonly DemoBinder[]; width: number; phone: boolean }) {
  const router = useRouter();
  const last = sortByRecentEdit(binders.filter((b) => !b.isExample && !b.isDemo))[0];
  const open = () => last && router.push(`/binder/${last.id}?edit=1` as Href);
  // Beside its details at every width; on a phone about half the column, so the actions stay in view.
  const thumbW = phone ? Math.floor(Math.min(200, (width - 2 * Spacing.four) * 0.52)) : 300;
  const pages = last?.pageCount ?? last?.pages.length ?? 0;
  return (
    <View style={styles.wrap} testID="home-keep-going">
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.eyebrow}>
        {last ? 'Keep going' : 'Start here'}
      </ThemedText>
      {last ? (
        <View style={[styles.card, styles.cardWide]}>
          <BinderThumb binder={last} width={thumbW} onPress={open} />
          <View style={styles.side}>
            <Text style={styles.meta}>{[`${pages} page${pages === 1 ? '' : 's'}`, editedLabel(last.updatedAt)].filter(Boolean).join(' · ')}</Text>
            <Pressable onPress={open} accessibilityRole="button" style={({ pressed }) => [styles.open, pressed && styles.pressed]} testID="home-open-binder">
              <Text style={styles.openText} numberOfLines={1}>{phone ? 'Open' : 'Open binder'}</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable onPress={() => router.push('/new-binder' as Href)} accessibilityRole="button" style={({ pressed }) => [styles.card, styles.empty, pressed && styles.pressed]} testID="home-first-binder">
          <Text style={styles.title}>Start your first binder</Text>
          <Text style={styles.meta}>Pick a Pokémon or a colour and page one fills itself in.</Text>
        </Pressable>
      )}
      <View style={styles.actions}>
        <Pressable onPress={() => router.push('/new-binder' as Href)} accessibilityRole="button" style={({ pressed }) => [styles.action, styles.actionPrimary, pressed && styles.pressed]} testID="home-new-binder">
          <Text style={styles.actionPrimaryText}>＋ New binder</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/my-binders' as Href)} accessibilityRole="button" style={({ pressed }) => [styles.action, pressed && styles.pressed]} testID="home-my-binders">
          <Text style={styles.actionText}>My binders</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/discover' as Href)} accessibilityRole="button" style={({ pressed }) => [styles.action, pressed && styles.pressed]} testID="home-discover">
          <Text style={styles.actionText}>{phone ? 'Discover' : 'Discover binders'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two, marginBottom: Spacing.four },
  eyebrow: { textTransform: 'uppercase', letterSpacing: 0.6 },
  card: { padding: Spacing.three, borderRadius: Radius.panel, borderWidth: 1, borderColor: Palette.hairline, backgroundColor: Palette.panel, gap: Spacing.three },
  cardWide: { flexDirection: 'row', alignItems: 'center' },
  side: { flex: 1, gap: Spacing.two, minWidth: 0 },
  empty: { paddingVertical: Spacing.five, alignItems: 'flex-start' },
  title: { fontSize: FontSize.title ?? 22, fontWeight: Weight.bold, color: Palette.ink },
  meta: { fontSize: FontSize.sm, color: Palette.muted },
  open: { alignSelf: 'flex-start', minHeight: 44, paddingHorizontal: Spacing.four, justifyContent: 'center', borderRadius: Radius.pill, backgroundColor: Palette.accent },
  openText: { color: Palette.accentText, fontWeight: Weight.bold, fontSize: FontSize.md },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  action: { minHeight: 40, paddingHorizontal: Spacing.three, justifyContent: 'center', borderRadius: Radius.pill, borderWidth: 1, borderColor: Palette.hairline, backgroundColor: Palette.panel },
  actionPrimary: { backgroundColor: Palette.accent, borderColor: Palette.accent },
  actionText: { color: Palette.ink, fontWeight: Weight.semibold, fontSize: FontSize.sm },
  actionPrimaryText: { color: Palette.accentText, fontWeight: Weight.bold, fontSize: FontSize.sm },
  pressed: { opacity: 0.85 },
});
