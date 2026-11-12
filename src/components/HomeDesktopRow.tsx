/**
 * HOME ON A WIDE SCREEN: THREE PANELS (MIC-017, owner 2026-11-12: "for michi on desktop, i feel
 * like this area has room for 3 sections ... I would go with puzzle + what's new. Make sure the
 * full height of this section is filled with content across.")
 *
 * Keep going (your last binder, Open binder, the three actions) | Today's puzzle (your streak, a
 * peek at today's cards, Play) | What's new (the latest Michi changes, See all). The three are one
 * row of equal height, and each panel spreads its content down the full height so none of them
 * ends in a blank strip. Phones keep the single Keep going block (HomeKeepGoing).
 */
import { Image } from 'expo-image';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BinderThumb } from '@/components/binder/BinderThumb';
import { ThemedText } from '@/components/themed-text';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { sortByRecentEdit, type DemoBinder } from '@/data/binderTypes';
import { CHANGELOG } from '@/data/changelog';
import { myPlay, myStreak, todaysPuzzle, type DailyPuzzle, type MyPlay } from '@/data/dailyPuzzle';
import { useAuth } from '@/store/auth';

function editedLabel(at?: string): string {
  if (!at) return '';
  const days = Math.floor((Date.now() - new Date(at).getTime()) / 86_400_000);
  if (days <= 0) return 'edited today';
  if (days === 1) return 'edited yesterday';
  if (days < 14) return `edited ${days} days ago`;
  return `edited ${new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

const shortDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

export function HomeDesktopRow({ binders }: { binders: readonly DemoBinder[] }) {
  const [rowW, setRowW] = useState(0);
  // Three panels, two gaps; the panel's own padding comes off for the binder picture.
  const panelW = rowW > 0 ? Math.floor((rowW - 2 * Spacing.three) / 3) : 0;
  return (
    <View style={styles.wrap} testID="home-desktop-row" onLayout={(e) => setRowW(Math.floor(e.nativeEvent.layout.width))}>
      <KeepGoingPanel binders={binders} innerW={Math.max(0, panelW - 2 * Spacing.three)} />
      <PuzzlePanel />
      <WhatsNewPanel />
    </View>
  );
}

function KeepGoingPanel({ binders, innerW }: { binders: readonly DemoBinder[]; innerW: number }) {
  const router = useRouter();
  const last = sortByRecentEdit(binders.filter((b) => !b.isExample && !b.isDemo))[0];
  const open = () => last && router.push(`/binder/${last.id}?edit=1` as Href);
  const pages = last?.pageCount ?? last?.pages.length ?? 0;
  return (
    <View style={styles.panel} testID="home-keep-going">
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.eyebrow}>
        {last ? 'Keep going' : 'Start here'}
      </ThemedText>
      <View style={styles.grow}>
        {last ? (
          <>
            {innerW > 0 ? <BinderThumb binder={last} width={innerW} onPress={open} /> : null}
            <View style={styles.lineRow}>
              <Text style={styles.meta} numberOfLines={1}>
                {[`${pages} page${pages === 1 ? '' : 's'}`, editedLabel(last.updatedAt)].filter(Boolean).join(' · ')}
              </Text>
              <Pressable onPress={open} accessibilityRole="button" style={({ pressed }) => [styles.primary, pressed && styles.pressed]} testID="home-open-binder">
                <Text style={styles.primaryText} numberOfLines={1}>Open binder</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <Pressable onPress={() => router.push('/new-binder' as Href)} accessibilityRole="button" style={({ pressed }) => [styles.empty, pressed && styles.pressed]} testID="home-first-binder">
            <Text style={styles.title}>Start your first binder</Text>
            <Text style={styles.body}>Pick a Pokémon or a colour and page one fills itself in.</Text>
          </Pressable>
        )}
      </View>
      <View style={styles.actions}>
        <Pressable onPress={() => router.push('/new-binder' as Href)} accessibilityRole="button" style={({ pressed }) => [styles.action, styles.actionPrimary, pressed && styles.pressed]} testID="home-new-binder">
          <Text style={styles.actionPrimaryText} numberOfLines={1}>{innerW >= 320 ? '＋ New binder' : '＋ New'}</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/my-binders' as Href)} accessibilityRole="button" style={({ pressed }) => [styles.action, pressed && styles.pressed]} testID="home-my-binders">
          <Text style={styles.actionText}>My binders</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/discover' as Href)} accessibilityRole="button" style={({ pressed }) => [styles.action, pressed && styles.pressed]} testID="home-discover">
          <Text style={styles.actionText}>Discover</Text>
        </Pressable>
      </View>
    </View>
  );
}

type PuzzleState = { loaded: boolean; puzzle: DailyPuzzle | null; mine: MyPlay | null; streak: number };

function PuzzlePanel() {
  const router = useRouter();
  const auth = useAuth();
  const userId = auth.user?.id ?? null;
  // The peek's own box, so the cards grow to fill it (owner: "the full height ... filled").
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [st, setSt] = useState<PuzzleState>({ loaded: false, puzzle: null, mine: null, streak: 0 });
  /** A callback ref, not an effect (the React Compiler rules here forbid setState in one). Keyed on the session below. */
  const onMount = useCallback(
    (node: View | null) => {
      if (!node) return;
      void (async () => {
        const puzzle = await todaysPuzzle().catch(() => null);
        const mine = puzzle && userId ? await myPlay(puzzle.id).catch(() => null) : null;
        const streak = userId ? await myStreak().catch(() => 0) : 0;
        setSt({ loaded: true, puzzle, mine, streak });
      })();
    },
    [userId],
  );
  const { puzzle, mine, streak } = st;
  const solved = !!mine?.correct;
  const found = mine?.guess?.length ?? 0;
  const peek = (puzzle?.cardImageUrls ?? []).slice(0, 9);
  const GAP = 6;
  // The whole puzzle, three across: as big as the box allows either way.
  const rows = Math.ceil(peek.length / 3) || 1;
  const cardW = box.w > 0 && box.h > 0 ? Math.floor(Math.min((box.w - 2 * GAP) / 3, ((box.h - (rows - 1) * GAP) / rows) * 0.716)) : 0;
  const status = !puzzle
    ? 'A new puzzle comes out every morning.'
    : solved
      ? `Solved: all ${puzzle.themeCount} found${mine?.attempts ? ` in ${mine.attempts} ${mine.attempts === 1 ? 'guess' : 'guesses'}` : ''}.`
      : found > 0
        ? `${found} of ${puzzle.themeCount} themes found. Keep guessing.`
        : `Nine cards share ${puzzle.themeCount === 1 ? 'one theme' : `${puzzle.themeCount} themes`}. Can you name them?`;
  return (
    <View style={styles.panel} testID="home-puzzle-panel">
      <View key={userId ?? 'anon'} ref={onMount} />
      <View style={styles.headRow}>
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.eyebrow}>
          {"Today's puzzle"}
        </ThemedText>
        {puzzle ? <Text style={styles.meta}>{shortDate(puzzle.publishOn)}</Text> : null}
      </View>
      {streak > 0 ? (
        <View style={styles.streakRow}>
          <Text style={styles.streakNum}>{streak}</Text>
          <Text style={styles.streakLabel}>day streak</Text>
        </View>
      ) : (
        <Text style={styles.streakStart}>{solved ? 'Day one of your streak.' : 'Solve today to start a streak.'}</Text>
      )}
      <Pressable onPress={() => router.push('/daily' as Href)} onLayout={(e) => setBox({ w: Math.floor(e.nativeEvent.layout.width), h: Math.floor(e.nativeEvent.layout.height) })} style={[styles.grow, styles.peek]} accessibilityLabel="Open today's puzzle" testID="home-puzzle-peek">
        {peek.length ? (
          cardW > 0 ? peek.map((u, i) => <Image key={i} source={{ uri: u }} style={[styles.peekCard, { width: cardW, height: Math.round(cardW / 0.716) }]} contentFit="cover" />) : null
        ) : puzzle?.backdropUrl ? (
          <Image source={{ uri: puzzle.backdropUrl }} style={styles.peekBackdrop} contentFit="cover" />
        ) : (
          <View style={styles.peekEmpty} />
        )}
      </Pressable>
      <Text style={styles.body}>{status}</Text>
      <Pressable onPress={() => router.push('/daily' as Href)} accessibilityRole="button" style={({ pressed }) => [styles.primary, styles.fullBtn, pressed && styles.pressed]} testID="home-puzzle-play">
        <Text style={styles.primaryText}>{!puzzle ? 'See the puzzle' : solved ? 'See the answer' : found > 0 ? 'Keep playing' : "Play today's puzzle"}</Text>
      </Pressable>
    </View>
  );
}

function WhatsNewPanel() {
  const router = useRouter();
  // The newest Michi items across the latest batches: headlines first within a batch.
  const items = useMemo(() => {
    const out: { date: string; head: string; body: string; kind: string }[] = [];
    for (const e of CHANGELOG) {
      const mine = e.items.filter((i) => i.products.includes('michi')).sort((a, b) => Number(!!b.big) - Number(!!a.big));
      for (const i of mine) out.push({ date: e.date, head: i.head, body: i.body, kind: i.kind });
      if (out.length >= 5) break;
    }
    return out.slice(0, 5);
  }, []);
  return (
    <View style={styles.panel} testID="home-whats-new">
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.eyebrow}>
        {"What's new"}
      </ThemedText>
      <View style={[styles.grow, styles.newList]}>
        {items.map((it, i) => (
          <View key={i} style={[styles.newItem, i > 0 && styles.newItemRule]}>
            <View style={styles.newHead}>
              <Text style={[styles.kind, it.kind === 'new' && styles.kindNew]}>{it.kind === 'new' ? 'NEW' : it.kind === 'fix' ? 'FIX' : 'BETTER'}</Text>
              <Text style={styles.meta}>{shortDate(it.date)}</Text>
            </View>
            <Text style={styles.newTitle} numberOfLines={1}>{it.head}</Text>
            <Text style={styles.newBody} numberOfLines={2}>{it.body}</Text>
          </View>
        ))}
      </View>
      <Pressable onPress={() => router.push('/whats-new' as Href)} accessibilityRole="button" style={({ pressed }) => [styles.ghost, pressed && styles.pressed]} testID="home-whats-new-all">
        <Text style={styles.ghostText}>See everything new</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'stretch', gap: Spacing.three, marginBottom: Spacing.four },
  panel: { flex: 1, minWidth: 0, padding: Spacing.three, gap: Spacing.two, borderRadius: Radius.panel, borderWidth: 1, borderColor: Palette.hairline, backgroundColor: Palette.panel },
  grow: { flexGrow: 1, gap: Spacing.two, justifyContent: 'center' },
  eyebrow: { textTransform: 'uppercase', letterSpacing: 0.6 },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  lineRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  title: { fontSize: FontSize.title, fontWeight: Weight.bold, color: Palette.ink },
  body: { fontSize: FontSize.body, lineHeight: 20, color: Palette.ink },
  meta: { fontSize: FontSize.sm, color: Palette.muted, flexShrink: 1 },
  empty: { flexGrow: 1, gap: Spacing.two, justifyContent: 'center', padding: Spacing.three, borderRadius: Radius.control, backgroundColor: Palette.accentSoft },
  primary: { minHeight: 44, paddingHorizontal: Spacing.four, justifyContent: 'center', alignItems: 'center', borderRadius: Radius.pill, backgroundColor: Palette.accent },
  primaryText: { color: Palette.accentText, fontWeight: Weight.bold, fontSize: FontSize.md },
  fullBtn: { alignSelf: 'stretch' },
  ghost: { minHeight: 44, justifyContent: 'center', alignItems: 'center', borderRadius: Radius.pill, borderWidth: 1.5, borderColor: Palette.accent },
  ghostText: { color: Palette.accent, fontWeight: Weight.bold, fontSize: FontSize.control },
  actions: { flexDirection: 'row', gap: Spacing.two },
  action: { flex: 1, alignItems: 'center', minHeight: 40, paddingHorizontal: Spacing.two, justifyContent: 'center', borderRadius: Radius.pill, borderWidth: 1, borderColor: Palette.hairline, backgroundColor: Palette.surface },
  actionPrimary: { backgroundColor: Palette.accent, borderColor: Palette.accent },
  actionText: { color: Palette.ink, fontWeight: Weight.semibold, fontSize: FontSize.sm },
  actionPrimaryText: { color: Palette.accentText, fontWeight: Weight.bold, fontSize: FontSize.sm },
  streakRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  streakNum: { fontSize: FontSize.display, lineHeight: 38, fontWeight: Weight.bold, color: Palette.accent },
  streakStart: { fontSize: FontSize.lg, lineHeight: 38, fontWeight: Weight.bold, color: Palette.ink },
  streakLabel: { fontSize: FontSize.md, fontWeight: Weight.semibold, color: Palette.ink },
  peek: { flexDirection: 'row', flexWrap: 'wrap', alignContent: 'center', justifyContent: 'center', gap: 6, minHeight: 120, flexBasis: 0 },
  peekCard: { borderRadius: 6, backgroundColor: Palette.hairline },
  peekBackdrop: { width: '100%', flexGrow: 1, minHeight: 160, borderRadius: Radius.control },
  peekEmpty: { width: '100%', flexGrow: 1, minHeight: 160, borderRadius: Radius.control, backgroundColor: Palette.accentSoft },
  newList: { justifyContent: 'space-between', gap: 0 },
  newItem: { gap: 2, paddingTop: Spacing.two },
  newItemRule: { borderTopWidth: 1, borderTopColor: Palette.hairline },
  newHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  kind: { fontSize: FontSize.xs, fontWeight: Weight.bold, letterSpacing: 0.8, color: Palette.muted },
  kindNew: { color: Palette.accent },
  newTitle: { fontSize: FontSize.control, fontWeight: Weight.bold, color: Palette.ink },
  newBody: { fontSize: FontSize.label, lineHeight: 18, color: Palette.muted },
  pressed: { opacity: 0.85 },
});
