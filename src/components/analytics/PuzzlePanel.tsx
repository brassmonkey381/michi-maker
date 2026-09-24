/**
 * `/studio` — authoring the daily theme-search puzzle.
 *
 * WHAT THIS IS FOR. A puzzle is curated by hand: a binder is filled with every candidate a theme
 * search returned, then trimmed down to the four or nine that make a good page. This panel is the
 * last step, publishing a page as the puzzle for a date. It does not curate; the binder editor
 * does that, and this deliberately links out to it rather than growing a second editor.
 *
 * NOTHING HERE READS A TABLE. Every call is an admin RPC (src/data/puzzleAdmin.ts), because the
 * answers table has no read policy and the puzzle table is privileged-write. The answer for a given
 * puzzle is fetched only when an author opens that row, so it is not sitting in a list response.
 *
 * THE DATE IS UTC, matching the day boundary the puzzle uses. The field is plain text rather than a
 * picker: a picker on web hands back a local date, and on the evening of the 23rd in Honolulu that
 * is a different day from the one the puzzle would publish on.
 */
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import {
  listPuzzles,
  listSources,
  parseThemes,
  publishPuzzle,
  puzzleThemes,
  setBinderShowcase,
  unpublishPuzzle,
  utcToday,
  type AdminPuzzle,
  type PuzzleSourceBinder,
  type PuzzleSourcePage,
} from '@/data/puzzleAdmin';

export function PuzzlePanel() {
  const [puzzles, setPuzzles] = useState<AdminPuzzle[] | null>(null);
  const [sources, setSources] = useState<PuzzleSourceBinder[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  // The form. `date` starts at today in UTC, which is the day a puzzle published now would be for.
  const [date, setDate] = useState(() => utcToday(new Date()));
  const [pageId, setPageId] = useState<string | null>(null);
  const [themeText, setThemeText] = useState('');
  const [hint, setHint] = useState('');
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
      const t = await puzzleThemes(p.id);
      setRevealed((r) => ({ ...r, [p.id]: t }));
    } catch {
      setRevealed(({ [p.id]: _drop, ...rest }) => rest);
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
        ? `"${b.title}" is public for its share image and hidden from every feed.`
        : `"${b.title}" is private again.`);
      await load();
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Could not change that binder.');
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    /*
     * LOADED AT THE TAP, not in an effect. The React Compiler rules forbid setState inside an
     * effect (cascading renders), and the fetch has a natural trigger anyway: nobody needs this
     * data until the panel is opened, and opening it is a press.
     */
    return (
      <Pressable
        onPress={() => {
          setOpen(true);
          void load();
        }}
        style={styles.collapsed}
        testID="puzzle-panel-open"
      >
        <ThemedText type="smallBold">Daily puzzle</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">Publish and review</ThemedText>
      </Pressable>
    );
  }

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.flex}>
          <ThemedText type="smallBold">Daily puzzle</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            One per UTC day. The answer is never sent to a player.
          </ThemedText>
        </View>
        <Pressable onPress={() => setOpen(false)} hitSlop={8}>
          <ThemedText type="small" themeColor="textSecondary">Hide</ThemedText>
        </Pressable>
      </View>

      {note ? (
        <ThemedText type="small" style={styles.note} testID="puzzle-panel-note">{note}</ThemedText>
      ) : null}

      {/* PUBLISH -------------------------------------------------------------------- */}
      <ThemedText type="smallBold" style={styles.sectionLabel}>Publish a page</ThemedText>

      {sources === null ? (
        <ActivityIndicator style={styles.loading} />
      ) : sources.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          No binders of yours have pages with cards on them yet.
        </ThemedText>
      ) : (
        <View style={styles.sourceList}>
          {sources.map((b) => {
            const showcased = b.isPublic && b.hiddenFromFeeds;
            return (
              <View key={b.id} style={styles.sourceBinder}>
                <View style={styles.headerRow}>
                  <ThemedText type="small" style={styles.flex} numberOfLines={1}>{b.title}</ThemedText>
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
                      onPress={() => setPageId(p.pageId)}
                      style={[styles.pageChip, pageId === p.pageId && styles.pageChipOn]}
                      testID={`puzzle-page-${p.pageId}`}
                    >
                      <ThemedText type="small" style={pageId === p.pageId ? styles.chipTextOn : undefined}>
                        {`p${p.position + 1} · ${p.rows}×${p.cols} · ${p.cardCount}`}
                      </ThemedText>
                    </Pressable>
                  ))}
                </View>
              </View>
            );
          })}
        </View>
      )}

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
            {`Themes (${themes.length || 'none'}${themes.length ? `: ${themes.join(' + ')}` : ''})`}
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

      <ThemedText type="small" themeColor="textSecondary">Hint (optional, shown on request)</ThemedText>
      <TextInput
        value={hint}
        onChangeText={setHint}
        placeholder="Two words for the kind of town a planner promises you."
        placeholderTextColor={Palette.muted}
        style={styles.input}
        testID="puzzle-hint"
      />

      <Pressable
        onPress={publish}
        disabled={!chosen || !themes.length || busy}
        style={[styles.publish, (!chosen || !themes.length || busy) && styles.publishOff]}
        testID="puzzle-publish"
      >
        <ThemedText type="smallBold" style={styles.publishText}>
          {chosen
            ? `Publish ${chosen.cardCount} cards for ${date}`
            : 'Pick a page above'}
        </ThemedText>
      </Pressable>
      {/* Re-publishing a date replaces it, which is how a typo in a hint gets fixed. Said out loud
          so nobody has to find that out by trying it. */}
      <ThemedText type="small" themeColor="textSecondary">
        Publishing a date that already has a puzzle replaces it.
      </ThemedText>

      {/* PUBLISHED ------------------------------------------------------------------ */}
      <ThemedText type="smallBold" style={styles.sectionLabel}>Scheduled and published</ThemedText>
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
                {p.published
                  ? `${p.plays} played, ${p.correct} correct`
                  : 'scheduled, not visible to anyone yet'}
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
    gap: Spacing.two,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  sectionLabel: { marginTop: Spacing.two },
  note: { color: Palette.accent },
  loading: { alignSelf: 'flex-start' },
  sourceList: { gap: Spacing.two },
  sourceBinder: {
    borderWidth: 1,
    borderColor: Palette.hairline,
    borderRadius: Radius.control,
    padding: Spacing.two,
    gap: Spacing.one,
  },
  pageRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  pageChip: {
    borderWidth: 1,
    borderColor: Palette.hairline,
    borderRadius: Radius.pill,
    paddingVertical: 3,
    paddingHorizontal: Spacing.two,
  },
  pageChipOn: { backgroundColor: Palette.accent, borderColor: Palette.accent },
  chipTextOn: { color: Palette.accentText },
  formRow: { flexDirection: 'row', gap: Spacing.two },
  dateField: { width: 140 },
  input: {
    borderWidth: 1,
    borderColor: Palette.hairline,
    borderRadius: Radius.control,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    color: Palette.ink,
    fontSize: FontSize.body,
  },
  publish: {
    backgroundColor: Palette.accent,
    borderRadius: Radius.control,
    paddingVertical: Spacing.two,
    alignItems: 'center',
    marginTop: Spacing.one,
  },
  publishOff: { opacity: 0.45 },
  publishText: { color: Palette.accentText, fontWeight: Weight.bold },
  puzzleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.one,
    borderTopWidth: 1,
    borderTopColor: Palette.hairline,
  },
  on: { color: Palette.accent },
  off: { color: Palette.muted },
});
