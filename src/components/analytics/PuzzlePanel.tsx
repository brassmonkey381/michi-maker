/**
 * `/studio` — the daily theme-search puzzle, as a calendar.
 *
 * WHAT THIS IS FOR. scripts/puzzles/fill-queue.mjs schedules a fortnight at a time, so what is left
 * for a person is to look at what is queued, fix a hint, swap a page, draw the post image, and very
 * occasionally publish a day by hand. The panel is shaped for that and nothing else.
 *
 * ONE LIST, AND IT IS THE CALENDAR (owner, 2026-10-18: "scrolling through all my pages and
 * scheduled puzzles is overwhelming"). The previous panel showed the same fourteen days three times
 * over: an agenda, then a publish form with a picker listing every page of every puzzle binder as
 * an anonymous chip ("p2 · 9", twenty-eight of them for one fortnight binder), then forty puzzle
 * rows each carrying five controls. Now there is the agenda and nothing under it. A day opens when
 * it is tapped, and only then shows its cards, its answer on request, its hint, and its actions.
 * The page picker exists only inside an open day, lists only pages no puzzle has claimed, and names
 * each one by its page title (the fortnight binder titles every page with its date or its themes).
 * Days already gone sit behind one "earlier" line with their play counts.
 *
 * NO PUZZLE TABLE IS READ HERE. Publishing, listing and revealing go through admin RPCs
 * (src/data/puzzleAdmin.ts), because the answers table has no read policy for anybody. The one
 * direct read is the caller's own binder slots, to draw a page's cards.
 */
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { shiftUtcDate } from '@/data/dailyPuzzleLogic';
import {
  listPuzzles,
  listSources,
  pageCardIds,
  pageLabel,
  parseThemes,
  publishPuzzle,
  puzzleThemes,
  puzzleToday,
  relevantBinders,
  setBinderShowcase,
  setPuzzleHint,
  unpublishPuzzle,
  unscheduledPages,
  type AdminPuzzle,
  type PuzzleSourceBinder,
  type PuzzleSourcePage,
} from '@/data/puzzleAdmin';
import { buildAgenda, clashOnDate, firstFreeDay, runwayDays, type AgendaDay } from '@/data/puzzleAgenda';
import { cardThumbUrl, useImageManifest } from '@/lib/catalogConfig';
import { downloadPuzzleImage } from '@/lib/puzzleImage';

/** The footer line on the post image. Here rather than in the renderer so it can be changed with
 *  the campaign, and it is the same line the offline script is given. */
const POST_CTA = 'Like, follow, and comment your michi-maker username to enter';

export function PuzzlePanel() {
  const router = useRouter();
  // The card thumbnails draw through the manifest, so this panel needs the repaint too; and the
  // addresses it resolves are what get stored with a hand-published puzzle.
  useImageManifest();
  const [open, setOpen] = useState(false);
  const [puzzles, setPuzzles] = useState<AdminPuzzle[] | null>(null);
  const [sources, setSources] = useState<PuzzleSourceBinder[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** The one day that is open, which is also the day a publish would go to. */
  const [openDay, setOpenDay] = useState<string | null>(null);
  /** Two weeks by default; four when the owner asks, so a run can be checked without scrolling by default. */
  const [weeks, setWeeks] = useState<2 | 4>(2);
  const [showEarlier, setShowEarlier] = useState(false);
  /** The cards of each page looked at so far, so re-opening a day costs nothing. */
  const [pageCards, setPageCards] = useState<Record<string, string[]>>({});

  // The hand-publish form, which exists only inside an open day.
  const [picking, setPicking] = useState(false);
  const [pageId, setPageId] = useState<string | null>(null);
  const [themeText, setThemeText] = useState('');
  const [hint, setHint] = useState('');
  const [filter, setFilter] = useState('');
  const [showAll, setShowAll] = useState(false);

  const [revealed, setRevealed] = useState<Record<string, string[]>>({});
  const [drawing, setDrawing] = useState<string | null>(null);
  /** What happened, on the row it happened to, because the panel's one note line is far from it. */
  const [rowNote, setRowNote] = useState<Record<string, string>>({});
  /** Hint being edited, per puzzle id. Absent means "not editing"; '' is a hint being cleared. */
  const [hintEdit, setHintEdit] = useState<Record<string, string>>({});
  /** A date whose existing puzzle a publish would replace, held until it is confirmed or dropped. */
  const [clash, setClash] = useState<{ date: string; replacing: string } | null>(null);

  const load = useCallback(async (): Promise<AdminPuzzle[] | null> => {
    try {
      const [p, s] = await Promise.all([listPuzzles(60), listSources()]);
      setPuzzles(p);
      setSources(s);
      return p;
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Could not load the puzzles.');
      setPuzzles([]);
      setSources([]);
      return null;
    }
  }, []);

  const showCards = useCallback(async (id: string | null) => {
    if (!id) return;
    setPageCards((c) => (c[id] ? c : { ...c, [id]: [] }));
    try {
      const ids = await pageCardIds(id);
      setPageCards((c) => ({ ...c, [id]: ids }));
    } catch {
      setNote('Could not load that page.');
    }
  }, []);

  /**
   * THE QUEUE AS DAYS. A missing puzzle is invisible in a list of what exists and obvious in a list
   * of dates. Starts a day back so the day just gone, and its play count, is still on screen.
   */
  const today = puzzleToday(new Date());
  const from = shiftUtcDate(today, -1);
  const agenda = useMemo(
    () => buildAgenda(puzzles ?? [], today, { from, days: weeks * 7 + 1 }),
    [puzzles, today, from, weeks],
  );
  const runway = runwayDays(agenda);
  const nextFree = firstFreeDay(agenda);
  /** Everything before the agenda's first day: played out, kept for its numbers. */
  const earlier = useMemo(
    () => (puzzles ?? []).filter((p) => p.publishOn < from).sort((a, b) => (a.publishOn < b.publishOn ? 1 : -1)),
    [puzzles, from],
  );

  const scheduledPageIds = useMemo(
    () => new Set((puzzles ?? []).map((p) => p.sourcePageId).filter((x): x is string => !!x)),
    [puzzles],
  );
  const themes = useMemo(() => parseThemes(themeText), [themeText]);
  const chosen: PuzzleSourcePage | null = useMemo(() => {
    if (!pageId || !sources) return null;
    for (const b of sources) {
      const page = b.pages.find((p) => p.pageId === pageId);
      if (page) return page;
    }
    return null;
  }, [pageId, sources]);
  const shown = useMemo(
    () => (sources ? relevantBinders(sources, filter, showAll) : []),
    [sources, filter, showAll],
  );

  const toggleDay = (d: AgendaDay<AdminPuzzle>) => {
    if (openDay === d.date) {
      setOpenDay(null);
      setPicking(false);
      return;
    }
    setOpenDay(d.date);
    setPicking(false);
    setPageId(null);
    setClash(null);
    if (d.puzzle) void showCards(d.puzzle.sourcePageId);
  };

  const choosePage = (p: PuzzleSourcePage) => {
    setPageId(p.pageId);
    void showCards(p.pageId);
  };

  /**
   * THE POST IMAGE. The page render is on-demand and slow the first time (the endpoint says half a
   * minute or more), so this always says what it is doing rather than appearing to hang. It is also
   * the one step that needs the binder PUBLIC: api/og-image-binder.js reads binders with
   * `is_public=eq.true` hardcoded, so a private one answers 404 and no image exists to compose.
   */
  const download = async (p: AdminPuzzle) => {
    if (drawing) return;
    if (!p.binderIsPublic) {
      setRowNote((r) => ({ ...r, [p.id]: 'Its binder is not showcased, so there is nothing to render. Turn showcase on in the page picker.' }));
      return;
    }
    setDrawing(p.id);
    setRowNote((r) => ({ ...r, [p.id]: 'Drawing. A page can take up to a minute the first time.' }));
    try {
      await downloadPuzzleImage({
        binderId: p.sourceBinderId ?? '',
        pageId: p.sourcePageId,
        publishOn: p.publishOn,
        themeCount: p.themeCount,
        cta: POST_CTA,
      });
      setRowNote((r) => ({ ...r, [p.id]: `Downloaded michi-daily-${p.publishOn}.png` }));
    } catch (e) {
      setRowNote((r) => ({ ...r, [p.id]: e instanceof Error ? e.message : 'The image could not be drawn.' }));
    } finally {
      setDrawing(null);
    }
  };

  /**
   * THE GUARD THAT 2026-09-28 NEEDED. admin_publish_puzzle upserts on publish_on, so publishing to
   * a day that already holds a different page silently replaces it. Re-publishing the SAME page to
   * the same date is not a clash, since that is how a theme gets corrected.
   */
  const publish = async (confirmed = false) => {
    if (!openDay || !chosen || !themes.length || busy) return;
    if (!confirmed) {
      const hit = clashOnDate(puzzles ?? [], openDay, chosen.pageId);
      if (hit) {
        setClash({ date: openDay, replacing: `${hit.cardCount} cards, ${hit.rows}×${hit.cols}` });
        return;
      }
    }
    setClash(null);
    setBusy(true);
    setNote(null);
    try {
      /**
       * The pictures are resolved HERE and sent, so the player's page never has to fetch the 5.2 MB
       * manifest to draw nine cards. All or nothing: a partial array is refused by the server. If the
       * manifest has not hydrated in this tab, none are sent and the puzzle keeps whatever it had.
       */
      const ids = pageCards[chosen.pageId] ?? [];
      const resolved = ids.map((id) => cardThumbUrl(id, 640));
      const imageUrls = ids.length > 0 && resolved.every((u) => !!u) ? resolved : null;
      await publishPuzzle({
        publishOn: openDay, pageId: chosen.pageId, themes, hint: hint.trim() || null, imageUrls,
      });
      setNote(
        `Published ${openDay}: ${themes.join(' + ')}, ${chosen.cardCount} cards.`
        + (imageUrls ? '' : ' Pictures were not resolved in this tab, so the page will load them itself.'),
      );
      setThemeText('');
      setHint('');
      setPicking(false);
      setPageId(null);
      const fresh = await load();
      // THE POST IMAGE FOLLOWS THE PUBLISH. Not awaited into the publish itself: the render is slow
      // and a failed drawing must not read as a failed publish.
      const made = fresh?.find((x) => x.publishOn === openDay);
      if (made) void download(made);
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Could not publish.');
    } finally {
      setBusy(false);
    }
  };

  /** One hint, without republishing the puzzle and rewriting its cards, pictures and grid. */
  const saveHint = async (p: AdminPuzzle) => {
    const next = hintEdit[p.id];
    if (next === undefined || busy) return;
    setBusy(true);
    try {
      const stored = await setPuzzleHint(p.id, next);
      setHintEdit(({ [p.id]: _drop, ...rest }) => rest);
      setRowNote((r) => ({ ...r, [p.id]: stored ? 'Hint saved.' : 'Hint cleared.' }));
      await load();
    } catch (e) {
      setRowNote((r) => ({ ...r, [p.id]: e instanceof Error ? e.message : 'Could not save the hint.' }));
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
        <ThemedText type="small" themeColor="textSecondary">The next fortnight, a day at a time</ThemedText>
      </Pressable>
    );
  }

  const thumbs = (ids: string[] | undefined, size: number) => (
    <View style={styles.preview}>
      {!ids || ids.length === 0 ? (
        <ActivityIndicator />
      ) : (
        ids.map((id, i) => (
          <Image
            key={`${id}-${i}`}
            source={{ uri: cardThumbUrl(id, 245) }}
            style={[styles.thumb, { width: size, height: Math.round(size * 1.4) }]}
            contentFit="cover"
            transition={100}
          />
        ))
      )}
    </View>
  );

  /** A hand publish, or a swap, for the open day: pick a page, name the answer, publish. */
  const publishForm = (replacing: AdminPuzzle | null) => {
    const ready = !!chosen && themes.length > 0;
    return (
      <View style={styles.form} testID="puzzle-form">
        <View style={styles.row}>
          <ThemedText type="smallBold" style={styles.flex}>
            {chosen ? `${chosen.binderTitle} · ${pageLabel(chosen)}` : replacing ? 'Pick the page to swap in' : 'Pick a page'}
          </ThemedText>
          <Pressable onPress={() => setShowAll((v) => !v)} hitSlop={6}>
            <ThemedText type="small" themeColor="textSecondary">
              {showAll ? 'puzzle binders only' : 'all my binders'}
            </ThemedText>
          </Pressable>
        </View>
        {chosen ? thumbs(pageCards[chosen.pageId], 62) : null}
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
            // The day's own page stays offered, so re-publishing it (to fix a theme) is possible.
            const pages = unscheduledPages(b, scheduledPageIds)
              .concat(b.pages.filter((p) => p.pageId === replacing?.sourcePageId));
            if (!pages.length) return null;
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
                  {pages.map((p) => (
                    <Pressable
                      key={p.pageId}
                      onPress={() => choosePage(p)}
                      style={[styles.chip, pageId === p.pageId && styles.chipOn]}
                      testID={`puzzle-page-${p.pageId}`}
                    >
                      <ThemedText type="small" style={pageId === p.pageId ? styles.chipTextOn : undefined}>
                        {pageLabel(p)}
                      </ThemedText>
                    </Pressable>
                  ))}
                </View>
              </View>
            );
          })
        )}
        <TextInput
          value={themeText}
          onChangeText={setThemeText}
          placeholder="The answer: themes, comma separated (flowers, city)"
          placeholderTextColor={Palette.muted}
          style={styles.input}
          autoCapitalize="none"
          testID="puzzle-themes"
        />
        <TextInput
          value={hint}
          onChangeText={setHint}
          placeholder="Hint (optional). Shown only when a player asks for it."
          placeholderTextColor={Palette.muted}
          style={styles.input}
          testID="puzzle-hint"
        />
        {clash ? (
          <View style={styles.clash} testID="puzzle-clash">
            <ThemedText type="small">
              {`${clash.date} already holds a different page (${clash.replacing}). Publishing replaces it.`}
            </ThemedText>
            <View style={styles.clashRow}>
              <Pressable onPress={() => publish(true)} hitSlop={6} testID="puzzle-clash-go">
                <ThemedText type="smallBold" style={styles.off}>Replace it</ThemedText>
              </Pressable>
              <Pressable onPress={() => setClash(null)} hitSlop={6}>
                <ThemedText type="smallBold" style={styles.link}>Keep what is there</ThemedText>
              </Pressable>
            </View>
          </View>
        ) : null}
        <View style={styles.row}>
          <Pressable
            onPress={() => publish()}
            disabled={!ready || busy}
            style={[styles.primary, styles.flex, (!ready || busy) && styles.primaryOff]}
            testID="puzzle-publish"
          >
            <ThemedText type="smallBold" style={styles.primaryText}>
              {!chosen ? 'Pick a page first'
                : !themes.length ? 'Type the answer first'
                : busy ? 'Publishing…'
                : `Publish ${chosen.cardCount} cards for ${openDay}`}
            </ThemedText>
          </Pressable>
          <Pressable onPress={() => { setPicking(false); setPageId(null); setClash(null); }} hitSlop={8}>
            <ThemedText type="small" themeColor="textSecondary">cancel</ThemedText>
          </Pressable>
        </View>
      </View>
    );
  };

  /** Everything about one scheduled day: its cards, its answer on request, its hint, its actions. */
  const dayDetail = (p: AdminPuzzle) => (
    <View style={styles.detail} testID={`puzzle-row-${p.publishOn}`}>
      {thumbs(pageCards[p.sourcePageId ?? ''], 54)}
      <ThemedText type="small" themeColor="textSecondary">
        {`${p.rows}×${p.cols} · ${p.cardCount} cards · ${p.themeCount} themes`}
        {p.published ? ` · ${p.plays} played, ${p.correct} correct` : ' · not visible until its morning'}
        {revealed[p.id]?.length ? `  ·  ${revealed[p.id].join(' + ')}` : ''}
      </ThemedText>
      {rowNote[p.id] ? (
        <ThemedText type="small" style={styles.rowNote} testID={`puzzle-note-${p.publishOn}`}>
          {rowNote[p.id]}
        </ThemedText>
      ) : null}
      {/* THE HINT, EDITABLE IN PLACE: the one part of a puzzle still written by hand. */}
      {hintEdit[p.id] !== undefined ? (
        <View style={styles.hintRow}>
          <TextInput
            value={hintEdit[p.id]}
            onChangeText={(t) => setHintEdit((h) => ({ ...h, [p.id]: t }))}
            placeholder="Hint, or empty to clear it"
            placeholderTextColor={Palette.muted}
            style={[styles.input, styles.flex]}
            testID={`puzzle-hint-${p.publishOn}`}
          />
          <Pressable onPress={() => saveHint(p)} hitSlop={6} disabled={busy}>
            <ThemedText type="smallBold" style={styles.link}>save</ThemedText>
          </Pressable>
          <Pressable onPress={() => setHintEdit(({ [p.id]: _drop, ...rest }) => rest)} hitSlop={6}>
            <ThemedText type="small" themeColor="textSecondary">cancel</ThemedText>
          </Pressable>
        </View>
      ) : (
        <Pressable
          onPress={() => setHintEdit((h) => ({ ...h, [p.id]: p.hint ?? '' }))}
          hitSlop={6}
          testID={`puzzle-hint-edit-${p.publishOn}`}>
          <ThemedText type="small" themeColor={p.hint ? 'textSecondary' : 'text'}>
            {p.hint ? `hint: ${p.hint}` : 'no hint — add one'}
          </ThemedText>
        </Pressable>
      )}
      <View style={styles.actions}>
        <Pressable onPress={() => reveal(p)} hitSlop={6}>
          <ThemedText type="small" style={styles.link}>{revealed[p.id] ? 'hide answer' : 'answer'}</ThemedText>
        </Pressable>
        <Pressable onPress={() => download(p)} hitSlop={6} disabled={!!drawing}>
          <ThemedText type="small" style={p.binderIsPublic ? styles.link : styles.off}>
            {drawing === p.id ? 'drawing…' : 'post image'}
          </ThemedText>
        </Pressable>
        {p.sourceBinderId ? (
          <Pressable onPress={() => router.push(`/binder/${p.sourceBinderId}`)} hitSlop={6}>
            <ThemedText type="small" style={styles.link}>open binder</ThemedText>
          </Pressable>
        ) : null}
        {!picking ? (
          <Pressable onPress={() => { setPicking(true); setPageId(null); }} hitSlop={6}>
            <ThemedText type="small" style={styles.link}>swap page</ThemedText>
          </Pressable>
        ) : null}
        <View style={styles.flex} />
        <Pressable onPress={() => withdraw(p)} hitSlop={6} disabled={busy}>
          <ThemedText type="small" style={styles.off}>withdraw</ThemedText>
        </Pressable>
      </View>
      {picking ? publishForm(p) : null}
    </View>
  );

  // No self-scroll and no height cap: /studio itself scrolls now, and a scroller inside a scroller
  // is worse than either.
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.row}>
        <View style={styles.flex}>
          <ThemedText type="smallBold">Daily puzzle</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {puzzles === null
              ? 'Loading…'
              : runway === 0
                ? 'Nothing scheduled from today. Tap a day to publish to it.'
                : `${runway} day${runway === 1 ? '' : 's'} of runway${nextFree ? `, next empty day ${nextFree}` : ''}. Tap a day for its cards and controls.`}
          </ThemedText>
        </View>
        <Pressable onPress={() => setOpen(false)} hitSlop={8}>
          <ThemedText type="small" themeColor="textSecondary">Hide</ThemedText>
        </Pressable>
      </View>

      {note ? <ThemedText type="small" style={styles.note} testID="puzzle-panel-note">{note}</ThemedText> : null}

      {/* THE CALENDAR, and the only list. */}
      <View style={styles.agenda}>
        {puzzles === null ? (
          <ActivityIndicator style={styles.loading} />
        ) : (
          agenda.map((d) => {
            const isOpen = openDay === d.date;
            const p = d.puzzle;
            return (
              <View key={d.date} style={[styles.day, isOpen && styles.dayOpen]}>
                <Pressable onPress={() => toggleDay(d)} style={styles.agendaRow} testID={`agenda-${d.date}`}>
                  <ThemedText
                    type={d.isToday ? 'smallBold' : 'small'}
                    themeColor={d.isPast ? 'textSecondary' : 'text'}
                    style={styles.agendaDay}
                  >
                    {`${d.weekday} ${d.date.slice(5)}`}
                  </ThemedText>
                  <ThemedText type="small" themeColor={p ? 'text' : 'textSecondary'} style={styles.flex}>
                    {p
                      ? `${p.rows}×${p.cols}${p.hint ? '' : ' · no hint'}${revealed[p.id]?.length ? ` · ${revealed[p.id].join(' + ')}` : ''}`
                      : d.isPast ? '—' : 'empty'}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {d.isToday ? 'today' : p?.published ? `${p.plays} played` : ''}
                  </ThemedText>
                </Pressable>
                {isOpen ? (
                  p ? dayDetail(p) : (
                    <View style={styles.detail} testID={`puzzle-row-${d.date}`}>
                      {picking ? publishForm(null) : (
                        <Pressable onPress={() => setPicking(true)} hitSlop={6} testID="puzzle-publish-here">
                          <ThemedText type="small" style={styles.link}>
                            {d.isPast ? 'Nothing ran this day. Publish a page to it anyway' : 'Publish a page to this day'}
                          </ThemedText>
                        </Pressable>
                      )}
                    </View>
                  )
                ) : null}
              </View>
            );
          })
        )}
        <View style={styles.foot}>
          <Pressable onPress={() => setWeeks((w) => (w === 2 ? 4 : 2))} hitSlop={6}>
            <ThemedText type="small" themeColor="textSecondary">
              {weeks === 2 ? 'show two more weeks' : 'show two weeks'}
            </ThemedText>
          </Pressable>
          {earlier.length ? (
            <Pressable onPress={() => setShowEarlier((v) => !v)} hitSlop={6} testID="puzzle-earlier">
              <ThemedText type="small" themeColor="textSecondary">
                {showEarlier ? 'hide earlier' : `${earlier.length} earlier`}
              </ThemedText>
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* DAYS GONE BY: numbers only, and the answer on request. */}
      {showEarlier ? (
        <View style={styles.agenda}>
          {earlier.map((p) => (
            <View key={p.id} style={styles.agendaRow} testID={`puzzle-row-${p.publishOn}`}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.agendaDay}>{p.publishOn.slice(5)}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
                {`${p.plays} played, ${p.correct} correct`}
                {revealed[p.id]?.length ? `  ·  ${revealed[p.id].join(' + ')}` : ''}
              </ThemedText>
              <Pressable onPress={() => reveal(p)} hitSlop={6}>
                <ThemedText type="small" themeColor="textSecondary">{revealed[p.id] ? 'hide' : 'answer'}</ThemedText>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
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
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  note: { color: Palette.accent },
  loading: { alignSelf: 'flex-start' },
  agenda: {
    borderTopWidth: 1,
    borderTopColor: Palette.hairline,
    paddingTop: Spacing.one,
  },
  day: { borderRadius: Radius.control },
  // The open day is the one a publish would go to, so it is marked rather than merely hovered.
  dayOpen: { backgroundColor: Palette.accentSoft },
  agendaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.one,
  },
  agendaDay: { width: 72 },
  detail: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.one,
    paddingBottom: Spacing.two,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, flexWrap: 'wrap' },
  foot: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: Spacing.one, paddingHorizontal: Spacing.one },
  preview: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  thumb: { borderRadius: 4, backgroundColor: Palette.panel },
  form: {
    gap: Spacing.two,
    borderTopWidth: 1,
    borderTopColor: Palette.hairline,
    paddingTop: Spacing.two,
  },
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
  clash: {
    borderWidth: 1,
    borderColor: Palette.accent,
    borderRadius: Radius.control,
    padding: Spacing.two,
    gap: Spacing.one,
  },
  clashRow: { flexDirection: 'row', gap: Spacing.four },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  rowNote: { color: Palette.accent },
  link: { color: Palette.accent },
  on: { color: Palette.accent },
  off: { color: Palette.muted },
});
