/**
 * "Pages around this card" (VIP) — the upgraded composer.
 *
 * The normal Fill page sheet asks you to pick a method and fills the page you are on. This one
 * runs EVERY method the seed supports against a hypothetical fresh page, shows each finished
 * result side by side, and appends the ones you keep as new pages. The seed sits in the middle
 * of every preview, exactly where it will sit in the page you get.
 *
 * Why it is worth a tier: choosing between eight finished pages is a different act from filling
 * one. You are not guessing which method suits this card, you are looking at the answer.
 *
 * Previews are the real composer output, not a sketch — the same `composePage` the Fill sheet
 * calls, on the same catalog, with the same language bound. Methods run CONCURRENTLY because two
 * of them are network calls (similarity and palette) and running eight in series would be a
 * multi-second wait; each settles on its own so the grid fills in as results land.
 */
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { cardThumbUrl } from 'tcgscan-browse';

import { LogoLoader } from '@/components/brand/LogoLoader';
import { ThemedText } from '@/components/themed-text';
import { DialogCard } from '@/components/ui/DialogCard';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { emptyPage, type DemoPage } from '@/data/binderTypes';
import {
  COMPOSE_METHODS,
  availableMethods,
  composePage,
  type ComposeMethod,
  type ComposePlacement,
} from '@/data/pageComposer';
import { useCatalog } from '@/hooks/use-catalog';
import { useLanguagePref } from '@/store/languagePref';
import type { CatalogCard } from '@/lib/catalog';

/** One method's result: its placements plus enough to describe the page it would make. */
interface Built {
  key: ComposeMethod;
  label: string;
  description: string;
  paid: boolean;
  placements: ComposePlacement[];
  /** Distinct sets represented, and the year range — the page's character in two numbers. */
  sets: number;
  years: string;
}

const METHOD_META = Object.fromEntries(COMPOSE_METHODS.map((m) => [m.key, m]));

/** Strip the decorative prefix some labels carry ("≈ More like this"). */
function cleanLabel(label: string): string {
  return label.replace(/^[^\w]*\s*/, '');
}

/** The page title a kept result becomes. Reads as a binder page name, not a method key. */
function pageTitle(seed: CatalogCard, key: ComposeMethod): string {
  switch (key) {
    case 'samePokemon':
      return `${seed.name} across the years`;
    case 'evolutionLine':
      return `${seed.name} family`;
    case 'sameArtist':
      return `Art by ${seed.illustrator.trim()}`;
    case 'pokemonFriends':
      return `${seed.name} and friends`;
    case 'moreLikeThis':
      return `Like ${seed.name}`;
    case 'colorType':
      return `${seed.types[0] ?? 'Colour'} page`;
    case 'colorTheme':
      return `${seed.name} colour match`;
    case 'fullPageSpread':
      return `${seed.name} spread`;
    default:
      return cleanLabel(METHOD_META[key]?.label ?? key);
  }
}

export function ComposeAllSheet({
  visible,
  seed,
  page,
  pool,
  onClose,
  onKeep,
}: {
  visible: boolean;
  /** The seed, already evolution-enriched by the Fill sheet that handed it over. */
  seed: CatalogCard | undefined;
  /** The binder's current page — only its SHAPE is used, so previews match the real pockets. */
  page: DemoPage;
  /** "Fill from my collection" pool, or null for the whole catalog. */
  pool: ReadonlySet<string> | null;
  onClose: () => void;
  onKeep: (
    kept: { title: string; seedCardId: string; placements: ComposePlacement[] }[],
  ) => void;
}) {
  // Same pattern as the Fill sheet: the catalog loads on open, and the EN/JP bound is the shared
  // persisted one, so a built page honours the same printing language a single fill would.
  const { catalog } = useCatalog(visible);
  const [languages] = useLanguagePref();
  // Mounted fresh per invocation (the parent renders this only while open, keyed by seed), so
  // these start empty and the build effect never has to reset them synchronously.
  const [built, setBuilt] = useState<Built[]>([]);
  const [done, setDone] = useState(false);
  const [picked, setPicked] = useState<Set<ComposeMethod>>(new Set());

  const rows = page.rows;
  const cols = page.cols;
  const centre = { row: Math.floor(rows / 2), col: Math.floor(cols / 2) };

  useEffect(() => {
    if (!seed || !catalog) return;
    let active = true;
    // A fresh page of the binder's shape with only the seed on it — so each method composes the
    // page you would actually get, not a fill of whatever is already placed.
    const blank: DemoPage = {
      ...emptyPage(rows, cols),
      slots: [
        {
          id: 'seed-preview',
          row: centre.row,
          col: centre.col,
          rowSpan: 1,
          colSpan: 1,
          type: 'card',
          cardId: seed.id,
        },
      ],
    };
    // Every setState below sits after an await, inside a callback — never in this effect's body,
    // which would cascade a render on open.
    // EVERY method, the two paid ones included, and deliberately unguarded: this sheet is only
    // reachable behind `vipCompose` (tiers.ts multiPageCompose), and a VIP holds both capabilities
    // the paid methods need. If that entry condition is ever loosened, the locks the Fill sheet
    // applies per method have to come with it — this loop would otherwise run a search a free
    // user was just refused.
    Promise.all(
      availableMethods(seed, catalog).map(async (key) => {
        let placements: ComposePlacement[] = [];
        try {
          placements = await composePage(key, seed, catalog, blank, pool, languages);
        } catch {
          placements = []; // a method that fails is simply not offered
        }
        if (!active || placements.length === 0) return;
        const cards = placements
          .map((p) => (p.cardId ? catalog.getCard(p.cardId) : undefined))
          .filter((c): c is CatalogCard => !!c);
        const years = cards.map((c) => c.releaseDate.slice(0, 4)).filter(Boolean).sort();
        const meta = METHOD_META[key];
        // Append as each settles, keeping COMPOSE_METHODS' order so the grid doesn't reshuffle.
        setBuilt((prev) =>
          [...prev, {
            key,
            label: cleanLabel(meta?.label ?? key),
            description: meta?.description ?? '',
            paid: !!meta?.paid,
            placements,
            sets: new Set(cards.map((c) => c.setId)).size,
            years: years.length ? (years[0] === years[years.length - 1]
              ? years[0]
              : `${years[0]}–${years[years.length - 1]}`) : '',
          }].sort(
            (a, b) =>
              COMPOSE_METHODS.findIndex((m) => m.key === a.key) -
              COMPOSE_METHODS.findIndex((m) => m.key === b.key),
          ),
        );
      }),
    ).finally(() => {
      if (active) setDone(true);
    });
    return () => {
      active = false;
    };
  }, [seed, catalog, rows, cols, centre.row, centre.col, pool, languages]);

  if (!seed) return null;

  const toggle = (key: ComposeMethod) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const keep = () => {
    const kept = built
      .filter((b) => picked.has(b.key))
      .map((b) => ({
        title: pageTitle(seed, b.key),
        seedCardId: seed.id,
        placements: b.placements,
      }));
    if (kept.length > 0) onKeep(kept);
    onClose();
  };

  /** A method's result as a miniature of the page it would produce. */
  const preview = (b: Built) => {
    const at = new Map(b.placements.map((p) => [`${p.row},${p.col}`, p]));
    const cells = [];
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const isSeed = r === centre.row && c === centre.col;
        const p = at.get(`${r},${c}`);
        const id = isSeed ? seed.id : p?.cardId;
        const uri = id ? cardThumbUrl(id, 245) : p?.imageUrl;
        cells.push(
          <View key={`${r},${c}`} style={[styles.cell, isSeed && styles.cellSeed]}>
            {uri ? (
              <Image
                source={{ uri }}
                style={styles.cellImg}
                contentFit="cover"
                // The spread slices ONE image across the pockets; show this pocket's window.
                contentPosition={
                  p?.imageCrop
                    ? { left: `${(p.col / Math.max(1, cols - 1)) * 100}%`,
                        top: `${(p.row / Math.max(1, rows - 1)) * 100}%` }
                    : 'center'
                }
                cachePolicy="memory-disk"
              />
            ) : null}
          </View>,
        );
      }
    }
    return <View style={[styles.mini, { aspectRatio: (cols * 2.5) / (rows * 3.5) }]}>{cells}</View>;
  };

  return (
    <DialogCard visible={visible} onClose={onClose} maxWidth={880} title="Pages around this card">
      <ThemedText type="small" themeColor="textSecondary" style={styles.lede}>
        Every method that suits {seed.name}, built as a finished page. Keep the ones you want and
        they are added to this binder.
      </ThemedText>

      {!catalog ? (
        <View style={styles.loading}>
          <LogoLoader label="Loading the card catalog…" />
        </View>
      ) : !done && built.length === 0 ? (
        <View style={styles.loading}>
          <ActivityIndicator color={Palette.accent} />
          <ThemedText type="small" themeColor="textSecondary">
            Building pages
          </ThemedText>
        </View>
      ) : null}

      <ScrollView style={styles.scroll} contentContainerStyle={styles.grid}>
        {built.map((b) => {
          const on = picked.has(b.key);
          return (
            <Pressable
              key={b.key}
              onPress={() => toggle(b.key)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${b.label}. ${on ? 'Keeping' : 'Not keeping'}`}
              style={({ pressed }) => [styles.card, on && styles.cardOn, pressed && styles.pressed]}>
              {preview(b)}
              <View style={styles.cardHead}>
                <ThemedText type="smallBold" numberOfLines={1} style={styles.cardTitle}>
                  {b.label}
                </ThemedText>
                {b.paid ? <ThemedText type="small" style={styles.vip}>VIP</ThemedText> : null}
              </View>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={2} style={styles.cardDesc}>
                {b.description}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.cardMeta}>
                {b.placements.filter((p) => p.cardId).length} cards
                {b.sets > 1 ? ` · ${b.sets} sets` : ''}
                {b.years ? ` · ${b.years}` : ''}
              </ThemedText>
              <View style={[styles.mark, on && styles.markOn]}>
                {on ? <ThemedText style={styles.markTick}>{'✓'}</ThemedText> : null}
              </View>
            </Pressable>
          );
        })}
        {!done && built.length > 0 ? (
          <View style={styles.more}>
            <ActivityIndicator color={Palette.accent} />
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.actions}>
        <ThemedText type="small" themeColor="textSecondary">
          {picked.size === 0
            ? 'Tap a page to keep it'
            : `Keeping ${picked.size} of ${built.length}`}
        </ThemedText>
        <Pressable
          onPress={keep}
          disabled={picked.size === 0}
          style={({ pressed }) => [
            styles.keepBtn,
            picked.size === 0 && styles.keepBtnOff,
            pressed && styles.pressed,
          ]}>
          <ThemedText type="smallBold" style={styles.keepText}>
            {picked.size === 0
              ? 'Add to binder'
              : `Add ${picked.size} page${picked.size === 1 ? '' : 's'}`}
          </ThemedText>
        </Pressable>
      </View>
    </DialogCard>
  );
}

const styles = StyleSheet.create({
  lede: { marginBottom: Spacing.three, lineHeight: 18 },
  loading: { paddingVertical: Spacing.five, alignItems: 'center', gap: Spacing.two },
  scroll: { maxHeight: 460 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three, paddingBottom: Spacing.two },
  card: {
    flexGrow: 1,
    flexBasis: 190,
    maxWidth: 240,
    padding: Spacing.two,
    borderRadius: Radius.panel,
    borderWidth: 1,
    borderColor: Palette.controlBorder,
    backgroundColor: Palette.panelAlt,
    gap: Spacing.one,
  },
  cardOn: { borderColor: Palette.accent, backgroundColor: Palette.accentSoft },
  pressed: { opacity: 0.85 },
  mini: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderRadius: Radius.sm,
    overflow: 'hidden',
    backgroundColor: Palette.hairline,
  },
  cell: { width: `${100 / 3}%`, aspectRatio: 2.5 / 3.5, padding: 1 },
  cellSeed: { padding: 0 },
  cellImg: { width: '100%', height: '100%', borderRadius: 2 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, marginTop: Spacing.one },
  cardTitle: { flexShrink: 1 },
  vip: {
    fontSize: FontSize.tag,
    fontWeight: Weight.bold,
    color: Palette.accentText,
    backgroundColor: Palette.accent,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: Radius.tag,
    overflow: 'hidden',
  },
  cardDesc: { lineHeight: 15 },
  cardMeta: { fontSize: FontSize.micro },
  mark: {
    position: 'absolute',
    top: Spacing.two,
    right: Spacing.two,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Palette.controlBorder,
    backgroundColor: Palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markOn: { backgroundColor: Palette.accent, borderColor: Palette.accent },
  markTick: { color: Palette.accentText, fontSize: FontSize.xs, lineHeight: 14 },
  more: { flexBasis: 190, alignItems: 'center', justifyContent: 'center', minHeight: 120 },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    marginTop: Spacing.three,
    paddingTop: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Palette.hairline,
  },
  keepBtn: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: Radius.pill,
    backgroundColor: Palette.accent,
  },
  keepBtnOff: { backgroundColor: Palette.hairlineStrong },
  keepText: { color: Palette.accentText },
});
