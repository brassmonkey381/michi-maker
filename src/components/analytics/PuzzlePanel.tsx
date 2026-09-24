/**
 * `/studio` — authoring the daily theme-search puzzle.
 *
 * WHAT THIS IS FOR. A puzzle is curated by hand: a binder is filled with every candidate a theme
 * search returned, then trimmed to the four or nine that make a good page. This publishes one of
 * those pages as the puzzle for a date. It does not curate, because the binder editor already
 * does; every binder listed here has an Edit link straight into it.
 *
 * THE FIRST VERSION OF THIS PANEL WAS UNUSABLE, and the shape of the fix is worth writing down. It
 * listed every binder the account owned, one of them thirty pages long, which pushed the publish
 * form below the fold so the owner never found it; and a page was chosen from a line reading
 * "p2 · 3x3 · 9", which says nothing about what is on it. So now the form is FIRST, the chosen page
 * is SHOWN as cards, and the picker defaults to binders that look like puzzle binders, with a
 * filter and a "show all" for everything else.
 *
 * NO PUZZLE TABLE IS READ HERE. Publishing, listing and revealing go through admin RPCs
 * (src/data/puzzleAdmin.ts), because the answers table has no read policy for anybody. The one
 * direct read is the caller's own binder slots, to draw the preview.
 *
 * THE DATE IS UTC, matching the day boundary the puzzle uses. It is a text field rather than a
 * picker: a picker hands back a LOCAL date, and on the evening of the 23rd in Honolulu that is a
 * different day from the one the puzzle would publish on.
 */
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import {
  listPuzzles,
  listSources,
  pageCardIds,
  parseThemes,
  publishPuzzle,
  puzzleThemes,
  relevantBinders,
  setBinderShowcase,
  unpublishPuzzle,
  utcToday,
  type AdminPuzzle,
  type PuzzleSourceBinder,
  type PuzzleSourcePage,
} from '@/data/puzzleAdmin';
import { cardThumbUrl } from '@/lib/catalogConfig';

export function PuzzlePanel() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [puzzles, setPuzzles] = useState<AdminPuzzle[] | null>(null);
  const [sources, setSources] = useState<PuzzleSourceBinder[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [date, setDate] = useState(() => utcToday(new Date()));
  const [pageId, setPageId] = useState<string | null>(null);
  const [preview, setPreview] = useState<string[]>([]);
  const [themeText, setThemeText] = useState('');
  const [hint, setHint] = useState('');
  const [filter, setFilter] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, string[]>>({});

  const themes = useMemo(() => parseThemes(themeText), [themeText]);

  const load = useCallback(async () => {
    try {
      const [p, s] = await Promise.all([listPuzzles(40), listSources()]);
      setPuzzles(p);
      setSources(s);
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Could not load the puzzles.');
      setPuzzles([]);
      setSources([]);
    }
  }, []);

  const chosen: PuzzleSourcePage | null = useMemo(() => {
    if (!pageId || !sources) return null;
    for (const b of sources) {
      const page = b.pages.find((p) => p.pageId === pageId);
      if (page) return page;
    }
    return null;
  }, [pageId, sources]);

  const choosePage = async (p: PuzzleSourcePage) => {
    setPageId(p.pageId);
    setPreview([]);
    try {
      setPreview(await pageCardIds(p.pageId));
    } catch {
      setNote('Could not load that page.');
    }
  };

  const shown = useMemo(
    () => (sources ? relevantBinders(sources, filter, showAll) : []),
    [sources, filter, showAll],
  );

  const publish = async () => {
    if (!chosen || !themes.length || busy) return;
    setBusy(true);
    setNote(null);
    try {
      await publishPuzzle({ publishOn: date, pageId: chosen.pageId, themes, hint: hint.trim() || null });
      setNote(`Published ${date}: ${themes.join(' + ')}, ${chosen.cardCount} cards.`);
      setThemeText('');
      setHint('');
      await load();
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Could not publish.');
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async (p: AdminPuzzle) => {
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      await unpublishPuzzle(p.id);
      setNote(`Withdrew ${p.publishOn}.`);
      await load();
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Could not withdraw it.');
    } finally {
      setBusy(false);
    }
  };

  const reveal = async (p: AdminPuzzle) => {
    if (revealed[p.id]) {
      setRevealed(({ [p.id]: _drop, ...rest }) => rest);
      return;
    }
    try {
      setRevealed((r) => ({ ...r, [p.id]: [] }));
      const words = await puzzleThemes(p.id);
      setRevealed((r) => ({ ...r, [p.id]: words }));
    } catch {
      setNote('Could not read that answer.');
    }
  };

  const toggleShowcase = async (b: PuzzleSourceBinder) => {
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      const on = !(b.isPublic && b.hiddenFromFeeds);
      await setBinderShowcase(b.id, on);
      setNote(on
        ? `"${b.title}" is public so its share image renders, and hidden from every feed.`
        : `"${b.title}" is private again.`);
      await load();
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Could not change that binder.');
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <Pressable
        onPress={() => { setOpen(true); void load(); }}
        style={styles.collapsed}
        testID="puzzle-panel-open"
      >
        <ThemedText type="smallBold">Daily puzzle</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">Publish today&apos;s, review the rest</ThemedText>
      </Pressable>
    );
  }

  const ready = !!chosen && themes.length > 0;

  // No self-scroll and no height cap: /studio itself scrolls now, and a scroller inside a scroller
  // is worse than either.
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.row}>
        <View style={styles.flex}>
          <ThemedText type="smallBold">Daily puzzle</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            One per UTC day. The answer never reaches a player.
          </ThemedText>
        </View>
        <Pressable onPress={() => setOpen(false)} hitSlop={8}>
          <ThemedText type="small" themeColor="textSecondary">Hide</ThemedText>
        </Pressable>
      </View>

      {note ? <ThemedText type="small" style={styles.note} testID="puzzle-panel-note">{note}</ThemedText> : null}

      {/* 1. WHAT IS ABOUT TO BE PUBLISHED, at the top, so the form is never under a wall of pages. */}
      <View style={styles.step}>
        <ThemedText type="smallBold">1. The page</ThemedText>
        {chosen ? (
          <>
            <ThemedText type="small" themeColor="textSecondary">
              {`${chosen.binderTitle} · page ${chosen.position + 1} · ${chosen.rows}×${chosen.cols} · ${chosen.cardCount} cards`}
            </ThemedText>
            <View style={styles.preview}>
              {preview.length === 0 ? (
                <ActivityIndicator />
              ) : (
                preview.map((id, i) => (
                  <Image
                    key={`${id}-${i}`}
                    source={{ uri: cardThumbUrl(id, 245) }}
                    style={styles.thumb}
                    contentFit="cover"
                    transition={100}
                  />
                ))
              )}
            </View>
          </>
        ) : (
          <ThemedText type="small" themeColor="textSecondary">
            Pick one in step 3. Its cards appear here, so you can see what you are publishing.
          </ThemedText>
        )}
      </View>

      {/* 2. THE FORM ------------------------------------------------------------------- */}
      <View style={styles.step}>
        <ThemedText type="smallBold">2. The answer</ThemedText>
        <View style={styles.formRow}>
          <View style={styles.dateField}>
            <ThemedText type="small" themeColor="textSecondary">Date (UTC)</ThemedText>
            <TextInput
              value={date}
              onChangeText={setDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={Palette.muted}
              style={styles.input}
              autoCapitalize="none"
              testID="puzzle-date"
            />
          </View>
          <View style={styles.flex}>
            <ThemedText type="small" themeColor="textSecondary">
              {themes.length ? `Themes: ${themes.join(' + ')}` : 'Themes, comma separated'}
            </ThemedText>
            <TextInput
              value={themeText}
              onChangeText={setThemeText}
              placeholder="flowers, city"
              placeholderTextColor={Palette.muted}
              style={styles.input}
              autoCapitalize="none"
              testID="puzzle-themes"
            />
          </View>
        </View>
        <TextInput
          value={hint}
          onChangeText={setHint}
          placeholder="Hint (optional). Shown only when a player asks for it."
          placeholderTextColor={Palette.muted}
          style={styles.input}
          testID="puzzle-hint"
        />
        <Pressable
          onPress={publish}
          disabled={!ready || busy}
          style={[styles.primary, (!ready || busy) && styles.primaryOff]}
          testID="puzzle-publish"
        >
          <ThemedText type="smallBold" style={styles.primaryText}>
            {!chosen ? 'Pick a page first'
              : !themes.length ? 'Type the answer first'
              : busy ? 'Publishing…'
              : `Publish ${chosen.cardCount} cards for ${date}`}
          </ThemedText>
        </Pressable>
        <ThemedText type="small" themeColor="textSecondary">
          Publishing a date that already has a puzzle replaces it, so fixing a hint is the same action.
        </ThemedText>
      </View>

      {/* 3. THE PICKER ---------------------------------------------------------------- */}
      <View style={styles.step}>
        <View style={styles.row}>
          <ThemedText type="smallBold" style={styles.flex}>3. Pick a page</ThemedText>
          <Pressable onPress={() => setShowAll((v) => !v)} hitSlop={6}>
            <ThemedText type="small" themeColor="textSecondary">
              {showAll ? 'puzzle binders only' : 'show all my binders'}
            </ThemedText>
          </Pressable>
        </View>
        <TextInput
          value={filter}
          onChangeText={setFilter}
          placeholder="Filter by binder name"
          placeholderTextColor={Palette.muted}
          style={styles.input}
          autoCapitalize="none"
          testID="puzzle-filter"
        />

        {sources === null ? (
          <ActivityIndicator style={styles.loading} />
        ) : shown.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">Nothing matches that.</ThemedText>
        ) : (
          shown.map((b) => {
            const showcased = b.isPublic && b.hiddenFromFeeds;
            return (
              <View key={b.id} style={styles.binder}>
                <View style={styles.row}>
                  <ThemedText type="small" style={styles.flex} numberOfLines={1}>{b.title}</ThemedText>
                  <Pressable onPress={() => router.push(`/binder/${b.id}`)} hitSlop={6}>
                    <ThemedText type="small" style={styles.link}>Edit</ThemedText>
                  </Pressable>
                  <Pressable onPress={() => toggleShowcase(b)} hitSlop={6} disabled={busy}>
                    <ThemedText type="small" style={showcased ? styles.on : styles.off}>
                      {showcased ? 'showcase on' : 'showcase off'}
                    </ThemedText>
                  </Pressable>
                </View>
                <View style={styles.pageRow}>
                  {b.pages.filter((p) => p.cardCount > 0).map((p) => (
                    <Pressable
                      key={p.pageId}
                      onPress={() => choosePage(p)}
                      style={[styles.chip, pageId === p.pageId && styles.chipOn]}
                      testID={`puzzle-page-${p.pageId}`}
                    >
                      <ThemedText type="small" style={pageId === p.pageId ? styles.chipTextOn : undefined}>
                        {`p${p.position + 1} · ${p.cardCount}`}
                      </ThemedText>
                    </Pressable>
                  ))}
                </View>
              </View>
            );
          })
        )}
      </View>

      {/* 4. WHAT IS SCHEDULED --------------------------------------------------------- */}
      <View style={styles.step}>
        <ThemedText type="smallBold">Scheduled and published</ThemedText>
        {puzzles === null ? (
          <ActivityIndicator style={styles.loading} />
        ) : puzzles.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">Nothing published yet.</ThemedText>
        ) : (
          puzzles.map((p) => (
            <View key={p.id} style={styles.puzzleRow} testID={`puzzle-row-${p.publishOn}`}>
              <View style={styles.flex}>
                <ThemedText type="small">
                  {`${p.publishOn}  ${p.rows}×${p.cols}  ${p.cardCount} cards  ${p.themeCount} themes`}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {p.published ? `${p.plays} played, ${p.correct} correct` : 'scheduled, not visible yet'}
                  {revealed[p.id]?.length ? `  ·  ${revealed[p.id].join(' + ')}` : ''}
                </ThemedText>
              </View>
              <Pressable onPress={() => reveal(p)} hitSlop={6}>
                <ThemedText type="small" themeColor="textSecondary">
                  {revealed[p.id] ? 'hide' : 'answer'}
                </ThemedText>
              </Pressable>
              <Pressable onPress={() => withdraw(p)} hitSlop={6} disabled={busy}>
                <ThemedText type="small" style={styles.off}>withdraw</ThemedText>
              </Pressable>
            </View>
          ))
        )}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  collapsed: {
    borderWidth: 1,
    borderColor: Palette.hairline,
    borderRadius: Radius.control,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    marginHorizontal: Spacing.three,
    marginBottom: Spacing.two,
  },
  card: {
    borderRadius: Radius.control,
    padding: Spacing.three,
    marginHorizontal: Spacing.three,
    marginBottom: Spacing.two,
    gap: Spacing.three,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  step: {
    gap: Spacing.two,
    borderTopWidth: 1,
    borderTopColor: Palette.hairline,
    paddingTop: Spacing.two,
  },
  note: { color: Palette.accent },
  loading: { alignSelf: 'flex-start' },
  preview: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  thumb: { width: 62, height: 87, borderRadius: 4, backgroundColor: Palette.panel },
  binder: {
    borderWidth: 1,
    borderColor: Palette.hairline,
    borderRadius: Radius.control,
    padding: Spacing.two,
    gap: Spacing.one,
  },
  pageRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  chip: {
    borderWidth: 1,
    borderColor: Palette.hairline,
    borderRadius: Radius.pill,
    paddingVertical: 3,
    paddingHorizontal: Spacing.two,
  },
  chipOn: { backgroundColor: Palette.accent, borderColor: Palette.accent },
  chipTextOn: { color: Palette.accentText },
  formRow: { flexDirection: 'row', gap: Spacing.two },
  dateField: { width: 150 },
  input: {
    borderWidth: 1,
    borderColor: Palette.hairline,
    borderRadius: Radius.control,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    color: Palette.ink,
    fontSize: FontSize.body,
  },
  primary: {
    backgroundColor: Palette.accent,
    borderRadius: Radius.control,
    paddingVertical: Spacing.two,
    alignItems: 'center',
  },
  primaryOff: { opacity: 0.45 },
  primaryText: { color: Palette.accentText, fontWeight: Weight.bold },
  puzzleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.one,
  },
  link: { color: Palette.accent },
  on: { color: Palette.accent },
  off: { color: Palette.muted },
});
