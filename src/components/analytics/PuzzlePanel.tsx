/**
 * `/studio` — the daily theme-search puzzle, as a calendar.
 *
 * WHAT THIS IS FOR. scripts/puzzles/fill-queue.mjs schedules a fortnight at a time, so what is left
 * for a person is to look at what is queued, fix a hint, swap a page, draw the post image, and very
 * occasionally publish a day by hand. The panel is shaped for that and nothing else.
 *
 * A MONTH GRID WITH THE ANSWER ON EVERY DAY (owner, 2026-10-18: "a calendar with themes on the
 * calendar cell might be ideal", after "scrolling through all my pages and scheduled puzzles is
 * overwhelming"). The schedule is a year long now (scripts/puzzles/fill-queue.mjs --days 365), so
 * the panel shows one month at a time, Sunday to Saturday, each day carrying its two answer words,
 * a dot for a holiday page, "no hint" or "empty" where that is the problem, and the play count once
 * it has run. Earlier and later months are a tap away; the title jumps back to this month. A day
 * opens UNDER the grid when tapped and only then shows its cards, hint, actions, or the publish form
 * for a blank. The page picker exists only inside an open day, lists only pages no puzzle has
 * claimed, and names each by its page title (the fortnight binders title every page with its date or
 * its themes).
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
import {
  listPuzzleCalendar,
  listSources,
  pageCardIds,
  pageLabel,
  parseThemes,
  publishPuzzle,
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
import {
  buildAgenda, clashOnDate, firstFreeDay, monthGrid, monthLabel, monthOf, runwayDays, shiftMonth, type AgendaDay,
} from '@/data/puzzleAgenda';
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
  /** The month on the calendar, 'yyyy-mm'. Starts on the current puzzle day's month. */
  const [month, setMonth] = useState<string>(() => monthOf(puzzleToday(new Date())));
  /** The cards of each page looked at so far, so re-opening a day costs nothing. */
  const [pageCards, setPageCards] = useState<Record<string, string[]>>({});

  // The hand-publish form, which exists only inside an open day.
  const [picking, setPicking] = useState(false);
  const [pageId, setPageId] = useState<string | null>(null);
  const [themeText, setThemeText] = useState('');
  const [hint, setHint] = useState('');
  const [filter, setFilter] = useState('');
  const [showAll, setShowAll] = useState(false);

  const [drawing, setDrawing] = useState<string | null>(null);
  /** What happened, on the row it happened to, because the panel's one note line is far from it. */
  const [rowNote, setRowNote] = useState<Record<string, string>>({});
  /** Hint being edited, per puzzle id. Absent means "not editing"; '' is a hint being cleared. */
  const [hintEdit, setHintEdit] = useState<Record<string, string>>({});
  /** A date whose existing puzzle a publish would replace, held until it is confirmed or dropped. */
  const [clash, setClash] = useState<{ date: string; replacing: string } | null>(null);

  const load = useCallback(async (): Promise<AdminPuzzle[] | null> => {
    try {
      const [p, s] = await Promise.all([listPuzzleCalendar(), listSources()]);
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
   * THE QUEUE AS A CALENDAR (owner, 2026-10-18: "a calendar with themes on the calendar cell might
   * be ideal"). A month at a time, the answer words written on each day, a tap opens the day under
   * the grid. A missing puzzle is a blank cell, which is the whole point of a calendar over a list.
   * The runway is still measured from today over the coming year, whatever month is on screen.
   */
  const today = puzzleToday(new Date());
  const agenda = useMemo(
    () => buildAgenda(puzzles ?? [], today, { from: today, days: 400 }),
    [puzzles, today],
  );
  const runway = runwayDays(agenda);
  const nextFree = firstFreeDay(agenda);
  const grid = useMemo(() => monthGrid(puzzles ?? [], today, month), [puzzles, today, month]);
  const thisMonth = monthOf(today);
  /** Months that hold anything, so the arrows can say when there is nothing further. */
  const monthsHeld = useMemo(() => {
    const ms = (puzzles ?? []).map((p) => monthOf(p.publishOn));
    return { first: ms.length ? ms.reduce((a, b) => (a < b ? a : b)) : thisMonth, last: ms.length ? ms.reduce((a, b) => (a > b ? a : b)) : thisMonth };
  }, [puzzles, thisMonth]);

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
      </ThemedText>
      <ThemedText type="smallBold">
        {p.themes.length ? p.themes.join(' + ') : 'no answer recorded'}
        {p.holiday ? `   ·   ${p.holiday}` : ''}
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

      {/* THE CALENDAR: one month, the answer on every day. */}
      <View style={styles.agenda}>
        <View style={styles.monthBar}>
          <Pressable onPress={() => setMonth((m) => shiftMonth(m, -1))} hitSlop={8} testID="puzzle-month-prev">
            <ThemedText type="small" style={styles.link}>‹ earlier</ThemedText>
          </Pressable>
          <Pressable onPress={() => setMonth(thisMonth)} hitSlop={8}>
            <ThemedText type="smallBold" testID="puzzle-month">{monthLabel(month)}</ThemedText>
          </Pressable>
          <Pressable onPress={() => setMonth((m) => shiftMonth(m, 1))} hitSlop={8} testID="puzzle-month-next">
            <ThemedText type="small" style={styles.link}>later ›</ThemedText>
          </Pressable>
        </View>
        {month < monthsHeld.first || month > monthsHeld.last ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.monthNote}>
            {`Nothing scheduled this month. The schedule runs ${monthLabel(monthsHeld.first)} to ${monthLabel(monthsHeld.last)}.`}
          </ThemedText>
        ) : null}
        <View style={styles.week}>
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((w, i) => (
            <ThemedText key={i} type="small" themeColor="textSecondary" style={styles.weekday}>{w}</ThemedText>
          ))}
        </View>
        {puzzles === null ? (
          <ActivityIndicator style={styles.loading} />
        ) : (
          grid.map((week, wi) => (
            <View key={wi} style={styles.week}>
              {week.map((d, di) => {
                if (!d) return <View key={`pad-${di}`} style={styles.cell} />;
                const p = d.puzzle;
                const isOpen = openDay === d.date;
                return (
                  <Pressable
                    key={d.date}
                    onPress={() => toggleDay(d)}
                    style={[
                      styles.cell,
                      styles.cellDay,
                      d.isToday && styles.cellToday,
                      isOpen && styles.dayOpen,
                      !p && !d.isPast && styles.cellEmpty,
                    ]}
                    accessibilityLabel={`${d.date}${p ? `, ${p.themes.join(' and ')}` : d.isPast ? '' : ', empty'}${p?.holiday ? `, ${p.holiday}` : ''}`}
                    testID={`agenda-${d.date}`}>
                    <View style={styles.cellHead}>
                      <ThemedText
                        type={d.isToday ? 'smallBold' : 'small'}
                        themeColor={d.isPast ? 'textSecondary' : 'text'}>
                        {String(Number(d.date.slice(8)))}
                      </ThemedText>
                      {p?.holiday ? <View style={styles.holidayDot} /> : null}
                    </View>
                    {p ? (
                      <>
                        <ThemedText
                          type="small"
                          themeColor={d.isPast ? 'textSecondary' : 'text'}
                          style={styles.cellThemes}
                          numberOfLines={3}>
                          {p.themes.length ? p.themes.join('\n') : '?'}
                        </ThemedText>
                        {!p.hint ? <ThemedText type="small" style={styles.cellWarn}>no hint</ThemedText> : null}
                        {p.published && p.plays ? (
                          <ThemedText type="small" themeColor="textSecondary" style={styles.cellMeta}>{`${p.plays} played`}</ThemedText>
                        ) : null}
                      </>
                    ) : d.isPast ? null : (
                      <ThemedText type="small" style={styles.cellWarn}>empty</ThemedText>
                    )}
                  </Pressable>
                );
              })}
            </View>
          ))
        )}
      </View>

      {/* THE OPEN DAY, under the grid: its cards, hint, controls, or the publish form for a blank. */}
      {openDay ? (() => {
        const p = (puzzles ?? []).find((x) => x.publishOn === openDay) ?? null;
        const isPast = openDay < today;
        return (
          <View style={styles.openDay}>
            <View style={styles.row}>
              <ThemedText type="smallBold">
                {`${openDay}${openDay === today ? ' · today' : ''}${p?.holiday ? ` · ${p.holiday}` : ''}`}
              </ThemedText>
              <View style={styles.flex} />
              <Pressable onPress={() => { setOpenDay(null); setPicking(false); }} hitSlop={8}>
                <ThemedText type="small" themeColor="textSecondary">close</ThemedText>
              </Pressable>
            </View>
            {p ? dayDetail(p) : (
              <View style={styles.detail} testID={`puzzle-row-${openDay}`}>
                {picking ? publishForm(null) : (
                  <Pressable onPress={() => setPicking(true)} hitSlop={6} testID="puzzle-publish-here">
                    <ThemedText type="small" style={styles.link}>
                      {isPast ? 'Nothing ran this day. Publish a page to it anyway' : 'Publish a page to this day'}
                    </ThemedText>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        );
      })() : null}
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
  // The open day is the one a publish would go to, so it is marked rather than merely hovered.
  dayOpen: { backgroundColor: Palette.accentSoft },
  monthBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.one,
  },
  monthNote: { paddingHorizontal: Spacing.one, paddingBottom: Spacing.one },
  week: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', paddingBottom: 2 },
  // Seven to a row, so the cell is whatever a seventh of the panel is; the words wrap inside it.
  cell: { flex: 1, minHeight: 64, padding: 3 },
  cellDay: {
    borderWidth: 1,
    borderColor: Palette.hairline,
    borderRadius: 6,
    margin: 1,
  },
  cellToday: { borderColor: Palette.accent, borderWidth: 2 },
  // A blank day still to come is the thing this screen exists to show.
  cellEmpty: { borderStyle: 'dashed', borderColor: Palette.accent },
  cellHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  holidayDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Palette.accent },
  cellThemes: { fontSize: 11, lineHeight: 13 },
  cellWarn: { fontSize: 10, lineHeight: 12, color: Palette.accent },
  cellMeta: { fontSize: 10, lineHeight: 12 },
  openDay: {
    borderTopWidth: 1,
    borderTopColor: Palette.hairline,
    paddingTop: Spacing.two,
    gap: Spacing.one,
  },
  detail: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.one,
    paddingBottom: Spacing.two,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, flexWrap: 'wrap' },
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
