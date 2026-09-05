/**
 * STORY BINDER (early access, VIP only, unadvertised).
 *
 * Pick a story — Seasons, Day to night, Habitats, Moods, Weather — and the sheet builds a whole
 * binder from the illustration-tagged cards: a cover page, then one two-page spread per theme,
 * each designed on its own (see `src/data/storyBinder.ts`), with every reserved art panel dressed
 * automatically from Pexels and Pixabay (`src/lib/stockArt.ts`). Nothing is capped: a six-theme
 * story builds thirteen pages and fills every panel.
 *
 * The build is two phases. The PAGES land in one `createBinder` call, so the binder exists and
 * can be opened at once. The ART then arrives panel by panel — each is a search, a download into
 * the user's bucket and a `placeArtPanels` — with a progress line here, and the sheet hands off
 * to the binder when the last panel is in. Closing the sheet mid-way leaves the panels already
 * placed and stops fetching the rest; the binder keeps its reserved gaps, which Slice Studio can
 * fill by hand.
 *
 * The gate is `limits.multiPageCompose` (VIP, the same flag as "pages around this card"): this is
 * an experiment the owner wants to play with before deciding how it is sold, so nothing on any
 * marketing surface mentions it. The entry point is one small button on My binders that only a
 * VIP sees.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontSize, Palette, Radii, Radius, Spacing, Weight } from '@/constants/theme';
import { uuidv4 } from '@/data/binderTypes';
import { WIZARD_SHAPES } from '@/data/binderWizard';
import { planStoryBinder, themeCandidates, type PageShape, type RarityMode, type StoryCard, type StoryPlan } from '@/data/storyBinder';
import { applyCoverArt, dropCoverArt, planStoryCover } from '@/data/storyCover';
import { STORY_TEMPLATES, type StoryTemplate } from '@/data/storyThemes';
import { hasBinderCovers } from '@/data/tiers';
import { useCatalog } from '@/hooks/use-catalog';
import { useOwnedCards } from '@/hooks/use-owned-cards';
import { track } from '@/lib/analytics';
import { fetchStockArtForAspect, fetchStockArtForPanel } from '@/lib/stockArt';
import { useAuth } from '@/store/auth';
import { useBinders } from '@/store/binders';

type Source = 'catalog' | 'collection';

interface Progress {
  done: number;
  total: number;
  label: string;
  failed: number;
}

export function StoryBinderSheet({
  visible,
  onClose,
  onBuilt,
  onCap,
}: {
  visible: boolean;
  onClose: () => void;
  /** The binder exists and its art is in (or was skipped): the parent opens it. */
  onBuilt: (binderId: string, pageCount: number, artPlaced: number, artFailed: number) => void;
  /** The store refused a new binder (binder cap). */
  onCap: () => void;
}) {
  const store = useBinders();
  // THE STORE, LIVE. `build` runs for a minute after the tap that started it, and the `store` it
  // closed over is the render's snapshot: its `placeArtPanels` looks the binder up in a `binders`
  // array that does not yet contain the one `createBinder` just added, and returns without a word.
  // Every panel stayed a reserved gap on the first real build for exactly this reason. Read the
  // latest store through a ref at the moment each panel is placed.
  const storeRef = useRef(store);
  useEffect(() => {
    storeRef.current = store;
  }, [store]);
  const { catalog, loading, guestGated } = useCatalog(visible);
  const owned = useOwnedCards();
  const { profile } = useAuth();
  const coversAllowed = hasBinderCovers(store.tier);

  const [templateId, setTemplateId] = useState<string>(STORY_TEMPLATES[0].id);
  const [shape, setShape] = useState<PageShape>(WIZARD_SHAPES[WIZARD_SHAPES.length - 1].shape);
  const [source, setSource] = useState<Source>('catalog');
  const [rarity, setRarity] = useState<RarityMode>('illustration');
  const [withArt, setWithArt] = useState(true);
  const [withCover, setWithCover] = useState(true);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);

  const template: StoryTemplate = STORY_TEMPLATES.find((t) => t.id === templateId) ?? STORY_TEMPLATES[0];
  const cards: StoryCard[] = useMemo(() => (catalog ? catalog.listAll() : []), [catalog]);
  const pool = useMemo(() => (source === 'collection' ? owned ?? new Set<string>() : null), [source, owned]);

  // How many cards each theme has to choose from, so the picker shows what a story will be made of.
  const counts = useMemo(
    () => template.spreads.map((theme) => themeCandidates(cards, theme, { pool, rarity }).filter((s) => s.qualifies).length),
    [cards, template, pool, rarity],
  );

  const building = progress !== null;

  const build = async () => {
    if (!catalog || building) return;
    setError(null);
    cancelled.current = false;
    let plan: StoryPlan;
    try {
      plan = planStoryBinder({ cards, template, shape, pool, rarity, mkId: uuidv4 });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not plan this story.');
      return;
    }
    const binder = store.createBinder({ title: plan.title, description: plan.description, pages: plan.pages });
    if (!binder) {
      onCap();
      return;
    }
    track('story.build', { template: template.id, pages: plan.pages.length, art: withArt ? plan.artJobs.length : 0, source, rarity });

    const jobs = withArt ? plan.artJobs : [];
    setProgress({ done: 0, total: jobs.length, label: jobs[0]?.label ?? '', failed: 0 });
    const usedHits = new Set<string>();
    let placed = 0;
    let failed = 0;
    for (const [i, job] of jobs.entries()) {
      if (cancelled.current) break;
      setProgress({ done: i, total: jobs.length, label: job.label, failed });
      const page = binder.pages[job.pageIndex];
      const art = page ? await fetchStockArtForPanel(job.queries, job.rowSpan, job.colSpan, job.kind, usedHits) : null;
      if (cancelled.current) break;
      if (art && page) {
        storeRef.current.placeArtPanels(binder.id, page.id, job.row, job.col, [
          { r: 0, c: 0, rs: job.rowSpan, cs: job.colSpan, imageUrl: art.imageUrl, crop: art.crop, attribution: art.attribution },
        ]);
        placed += 1;
      } else {
        failed += 1;
        console.warn('[story] no art for panel', job.label, job.queries);
      }
    }
    if (cancelled.current) return;

    // ── The cover: a preview of the story on the four surfaces, its pictures fetched like the
    // panels' (and never one already used on a page). Written whole, once, at the end.
    if (withCover && coversAllowed) {
      const author = profile?.username ? `@${profile.username}` : profile?.display_name ?? '';
      const coverPlan = planStoryCover({ template, plan, author, date: new Date(), rarity, source, artPlaced: placed, mkId: uuidv4 });
      let cover = coverPlan.cover;
      const coverJobs = withArt ? coverPlan.artJobs : [];
      for (const [i, job] of coverJobs.entries()) {
        if (cancelled.current) break;
        setProgress({ done: jobs.length + i, total: jobs.length + coverJobs.length, label: job.label, failed });
        const art = await fetchStockArtForAspect(job.queries, job.aspect, job.kind, usedHits);
        if (cancelled.current) break;
        if (art) {
          cover = applyCoverArt(cover, job.id, { imageUrl: art.imageUrl, crop: art.crop, attribution: art.attribution, aspect: art.hit.width / art.hit.height });
          placed += 1;
        } else {
          cover = dropCoverArt(cover, job.id);
          failed += 1;
          console.warn('[story] no art for cover', job.label, job.queries);
        }
      }
      if (cancelled.current) return;
      // Anything still empty (art turned off, or a job skipped) must not reach the database.
      for (const id of coverPlan.artJobs.map((j) => j.id)) {
        if (!coverJobs.some((j) => j.id === id)) cover = dropCoverArt(cover, id);
      }
      storeRef.current.updateBinder(binder.id, { cover });
    }

    setProgress(null);
    onBuilt(binder.id, plan.pages.length, placed, failed);
    onClose();
  };

  // Closing mid-build stops the remaining fetches; the panels already placed stay.
  const close = () => {
    cancelled.current = true;
    setProgress(null);
    setError(null);
    onClose();
  };

  const ready = !!catalog && !loading && !guestGated;
  const thin = counts.filter((c) => c < 6).length;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.cardWrap}>
          <ThemedView type="backgroundElement" style={styles.card}>
            <View style={styles.header}>
              <View style={styles.headText}>
                <ThemedText type="subtitle" style={styles.title}>
                  Story binder
                </ThemedText>
                <Text style={styles.early}>early access</Text>
              </View>
              <Pressable onPress={close} accessibilityRole="button" hitSlop={10}>
                <ThemedText type="small" themeColor="textSecondary">
                  Close
                </ThemedText>
              </Pressable>
            </View>
            <ThemedText type="small" themeColor="textSecondary" style={styles.sub}>
              A whole binder that tells a story: a cover, then one two-page spread per theme. Every art panel
              is dressed automatically from Pexels and Pixabay.
            </ThemedText>

            {!ready ? (
              <View style={styles.center}>
                <ActivityIndicator />
                <ThemedText type="small" themeColor="textSecondary">
                  {guestGated ? 'Sign in to load the catalog.' : 'Loading the catalog…'}
                </ThemedText>
              </View>
            ) : (
              <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
                <Label>Story</Label>
                <View style={styles.chips}>
                  {STORY_TEMPLATES.map((t) => (
                    <Chip key={t.id} on={t.id === templateId} onPress={() => setTemplateId(t.id)} disabled={building}>
                      {t.title}
                    </Chip>
                  ))}
                </View>
                <ThemedText type="small" themeColor="textSecondary" style={styles.blurb}>
                  {template.blurb}
                </ThemedText>
                <View style={styles.themes}>
                  {template.spreads.map((theme, i) => (
                    <View key={theme.id} style={styles.themeRow}>
                      <ThemedText type="smallBold">{theme.title}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary" style={styles.themeCount}>
                        {counts[i]} cards
                      </ThemedText>
                    </View>
                  ))}
                </View>
                {thin > 0 ? (
                  <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
                    {thin === 1 ? 'One theme' : `${thin} themes`} {thin === 1 ? 'has' : 'have'} fewer than six cards here; those spreads
                    will have empty pockets.
                  </ThemedText>
                ) : null}

                <Label>Page shape</Label>
                <View style={styles.chips}>
                  {WIZARD_SHAPES.map((s) => (
                    <Chip
                      key={s.label}
                      on={s.shape.rows === shape.rows && s.shape.cols === shape.cols}
                      onPress={() => setShape(s.shape)}
                      disabled={building}>
                      {s.label}
                    </Chip>
                  ))}
                </View>

                <Label>Cards from</Label>
                <View style={styles.chips}>
                  <Chip on={source === 'catalog'} onPress={() => setSource('catalog')} disabled={building}>
                    The whole catalog
                  </Chip>
                  <Chip on={source === 'collection'} onPress={() => setSource('collection')} disabled={building || !owned || owned.size === 0}>
                    My collection
                  </Chip>
                </View>

                <Label>Printings</Label>
                <View style={styles.chips}>
                  <Chip on={rarity === 'illustration'} onPress={() => setRarity('illustration')} disabled={building}>
                    Illustration rares and full arts
                  </Chip>
                  <Chip on={rarity === 'all'} onPress={() => setRarity('all')} disabled={building}>
                    Every printing
                  </Chip>
                </View>

                <Label>Art</Label>
                <View style={styles.chips}>
                  <Chip on={withArt} onPress={() => setWithArt(true)} disabled={building}>
                    Fill the panels automatically
                  </Chip>
                  <Chip on={!withArt} onPress={() => setWithArt(false)} disabled={building}>
                    Leave the panels for me
                  </Chip>
                </View>

                {coversAllowed ? (
                  <>
                    <Label>Binder cover</Label>
                    <View style={styles.chips}>
                      <Chip on={withCover} onPress={() => setWithCover(true)} disabled={building}>
                        Dress the cover too
                      </Chip>
                      <Chip on={!withCover} onPress={() => setWithCover(false)} disabled={building}>
                        No cover
                      </Chip>
                    </View>
                    <ThemedText type="small" themeColor="textSecondary" style={styles.blurb}>
                      Title, blurb and a picture on the front; the contents and a picture per theme inside the front;
                      the numbers, the tags and credits inside the back; the hero cards fanned on the back.
                    </ThemedText>
                  </>
                ) : null}
              </ScrollView>
            )}

            {error ? (
              <ThemedText type="small" style={styles.error}>
                {error}
              </ThemedText>
            ) : null}

            {progress ? (
              <View style={styles.progress}>
                <ActivityIndicator />
                <View style={styles.progressText}>
                  <ThemedText type="smallBold">
                    Dressing the pages · {Math.min(progress.done + 1, progress.total)} of {progress.total}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                    {progress.label}
                    {progress.failed ? ` · ${progress.failed} skipped` : ''}
                  </ThemedText>
                </View>
              </View>
            ) : (
              <Pressable
                onPress={build}
                disabled={!ready}
                accessibilityRole="button"
                style={({ pressed }) => [styles.primary, !ready && styles.primaryOff, pressed && styles.pressed]}>
                <Text style={styles.primaryText}>
                  Build {template.title.toLowerCase()} · {1 + template.spreads.length * 2} pages{withCover && coversAllowed ? ' + cover' : ''}
                </Text>
              </Pressable>
            )}
          </ThemedView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Label({ children }: { children: string }) {
  return (
    <ThemedText type="smallBold" style={styles.label}>
      {children}
    </ThemedText>
  );
}

function Chip({ on, onPress, disabled, children }: { on: boolean; onPress: () => void; disabled?: boolean; children: string }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected: on, disabled }}
      style={({ pressed }) => [styles.chip, on && styles.chipOn, disabled && styles.chipOff, pressed && styles.pressed]}>
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{children}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: Palette.scrim45, alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  cardWrap: { width: '100%', maxWidth: 480 },
  card: { borderRadius: Radii.page, padding: Spacing.four, gap: Spacing.three, maxHeight: '100%' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headText: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  title: { fontSize: FontSize.h2, lineHeight: 26 },
  early: {
    color: Palette.accent,
    fontSize: FontSize.xs,
    fontWeight: Weight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    borderWidth: 1,
    borderColor: Palette.accent,
    borderRadius: Radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  sub: { lineHeight: 20 },
  center: { paddingVertical: Spacing.four, alignItems: 'center', gap: Spacing.two },
  list: { maxHeight: 420 },
  listContent: { gap: Spacing.two },
  label: { marginTop: Spacing.two, textTransform: 'uppercase', letterSpacing: 0.5, fontSize: FontSize.xs, color: Palette.ink2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: { paddingVertical: 5, paddingHorizontal: Spacing.three, borderRadius: Radius.pill, borderWidth: 1, borderColor: Palette.hairlineStrong },
  chipOn: { backgroundColor: Palette.accent, borderColor: Palette.accent },
  chipOff: { opacity: 0.45 },
  chipText: { color: Palette.ink2, fontWeight: Weight.semibold, fontSize: FontSize.label },
  chipTextOn: { color: Palette.accentText },
  blurb: { lineHeight: 18 },
  themes: { gap: 2, marginTop: 2 },
  themeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  themeCount: { fontVariant: ['tabular-nums'] },
  note: { lineHeight: 18, fontStyle: 'italic' },
  error: { color: Palette.danger },
  progress: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.two },
  progressText: { flex: 1, gap: 2 },
  primary: { backgroundColor: Palette.accent, borderRadius: Radius.pill, paddingVertical: 10, alignItems: 'center' },
  primaryOff: { opacity: 0.5 },
  primaryText: { color: Palette.accentText, fontSize: FontSize.control, fontWeight: Weight.semibold },
  pressed: { opacity: 0.75 },
});
