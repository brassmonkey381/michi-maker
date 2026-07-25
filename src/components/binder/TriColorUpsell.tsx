/**
 * Upsell shown when a FREE user taps the locked "Color match · tri-color" composer method in the
 * AutoFill sheet. A 3-step SLIDING flow that sells the paid Tri-Color Search with the REAL pieces:
 *
 *   1. The picker  — the actual `GradientMixBar` + `HsvColorPicker` (interactive), so they feel the
 *                    up-to-three-colour mixing that drives the search.
 *   2. The fill    — the real composer method row + a pulsing "Fill page" button: one tap composes.
 *   3. The output  — an ACTUAL binder page: we run `composePage('colorTheme', …)` on a showcase
 *                    seed (a Charizard) and render the real card covers, revealed one by one.
 *
 * CTA routes to /plans. Everything is computed client-side from the already-loaded catalog; the
 * gate itself lives in AutoFillSheet (this is just the sell).
 */
import { useRouter } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import {
  Animated,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { GradientMixBar, HsvColorPicker, type Stop } from '@/components/color/ColorPicker';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { sheet } from '@/constants/ui';
import { uuidv4, type DemoPage } from '@/data/binderTypes';
import { composePage } from '@/data/pageComposer';
import type { Catalog, CatalogCard } from '@/lib/catalog';
import { cardThumbUrl, useImageManifest } from '@/lib/catalogConfig';

// A colourful, well-mirrored showcase seed (Charizard ex — SV 151). Falls back to the user's own
// seed, then to a hand-picked spread, if it isn't in the loaded catalog.
const SHOWCASE_SEED_ID = '517045';

// One filled pocket in the output preview.
type Cell = { row: number; col: number; cardId?: string; insertColor?: string };

// Safety net if the live compose returns nothing (e.g. the colour RPC blips): real, colourful
// cards in a page so slide 3 is never empty. Ids from data/exampleCollection.ts.
const FALLBACK: Cell[] = [
  { row: 0, col: 0, cardId: '517017' },
  { row: 0, col: 1, cardId: '509980' },
  { row: 0, col: 2, insertColor: '#F4BCA0' },
  { row: 1, col: 0, cardId: '662184' },
  { row: 1, col: 1, cardId: SHOWCASE_SEED_ID },
  { row: 1, col: 2, cardId: '590026' },
  { row: 2, col: 0, insertColor: '#FAE0D2' },
  { row: 2, col: 1, cardId: '610516' },
  { row: 2, col: 2, insertColor: '#F6E4A0' },
];

export function TriColorUpsell({
  visible,
  onClose,
  catalog,
  seed,
  /** Runs just before navigating to /plans — close the covering AutoFill sheet so /plans shows. */
  onBeforeUpgrade,
}: {
  visible: boolean;
  onClose: () => void;
  catalog: Catalog | null | undefined;
  seed?: CatalogCard;
  onBeforeUpgrade?: () => void;
}) {
  const router = useRouter();
  const { height: winH } = useWindowDimensions();
  useImageManifest(); // so cardThumbUrl resolves once the hashed manifest hydrates

  const [step, setStep] = useState(0);
  const [pagerW, setPagerW] = useState(0);
  // Lazy state (not a ref) so the Animated.Value is stable AND readable during render — the repo's
  // pattern (see GradientMixBar) that satisfies react-hooks/refs.
  const [tx] = useState(() => new Animated.Value(0));
  const pagerH = Math.min(430, Math.round(winH * 0.62));

  useEffect(() => {
    Animated.timing(tx, { toValue: -step * pagerW, duration: 300, useNativeDriver: true }).start();
  }, [step, pagerW, tx]);

  // Reset to the first slide each time the upsell opens.
  useEffect(() => {
    if (visible) setStep(0); // eslint-disable-line react-hooks/set-state-in-effect
  }, [visible]);

  // Live tri-color output for a real binder page (showcase seed, framed centre).
  const [cells, setCells] = useState<Cell[] | null>(null);
  useEffect(() => {
    if (!visible || !catalog) return;
    let active = true;
    const showcase = catalog.getCard(SHOWCASE_SEED_ID) ?? seed;
    if (!showcase) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCells(FALLBACK);
      return;
    }
    const page: DemoPage = {
      id: uuidv4(),
      rows: 3,
      cols: 3,
      slots: [{ id: uuidv4(), row: 1, col: 1, rowSpan: 1, colSpan: 1, type: 'card', cardId: showcase.id }],
    };
    composePage('colorTheme', showcase, catalog, page)
      .then((placements) => {
        if (!active) return;
        const filled: Cell[] = [
          { row: 1, col: 1, cardId: showcase.id },
          ...placements.map((p) => ({ row: p.row, col: p.col, cardId: p.cardId, insertColor: p.insertColor })),
        ];
        // A real fill covers most pockets; if it came back thin, show the curated fallback instead.
        setCells(filled.filter((c) => c.cardId).length >= 5 ? filled : FALLBACK);
      })
      .catch(() => active && setCells(FALLBACK));
    return () => {
      active = false;
    };
  }, [visible, catalog, seed]);

  const goTo = (i: number) => setStep(Math.max(0, Math.min(2, i)));
  const upgrade = () => {
    onClose();
    onBeforeUpgrade?.();
    router.push('/plans');
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={sheet.dialogBackdrop} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.wrap}>
          <ThemedView type="backgroundElement" style={styles.card}>
            {/* Header */}
            <View style={styles.header}>
              <ThemedText type="subtitle" style={styles.title}>
                Color match · tri-color <Text style={styles.pro}>PRO</Text>
              </ThemedText>
              <Pressable onPress={onClose} hitSlop={8}>
                <ThemedText type="link" themeColor="textSecondary">
                  Close
                </ThemedText>
              </Pressable>
            </View>

            {/* Pager viewport */}
            <View
              style={[styles.viewport, { height: pagerH }]}
              onLayout={(e) => setPagerW(e.nativeEvent.layout.width)}>
              <Animated.View style={[styles.row, { width: pagerW * 3, transform: [{ translateX: tx }] }]}>
                <Slide width={pagerW}>
                  <SlidePicker />
                </Slide>
                <Slide width={pagerW}>
                  <SlideFill />
                </Slide>
                <Slide width={pagerW}>
                  <SlideOutput cells={cells} pagerW={pagerW} active={step === 2} />
                </Slide>
              </Animated.View>
            </View>

            {/* Footer: dots + nav */}
            <View style={styles.footer}>
              <Pressable onPress={() => goTo(step - 1)} disabled={step === 0} hitSlop={8}>
                <Text style={[styles.back, step === 0 && styles.hidden]}>‹ Back</Text>
              </Pressable>
              <View style={styles.dots}>
                {[0, 1, 2].map((i) => (
                  <View key={i} style={[styles.dot, i === step && styles.dotOn]} />
                ))}
              </View>
              {step < 2 ? (
                <Pressable onPress={() => goTo(step + 1)} style={styles.nextBtn} hitSlop={8}>
                  <Text style={styles.nextText}>Next ›</Text>
                </Pressable>
              ) : (
                <Pressable onPress={upgrade} style={styles.ctaBtn} hitSlop={8}>
                  <Text style={styles.ctaText}>See plans</Text>
                </Pressable>
              )}
            </View>
          </ThemedView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** One page of the flow — vertical-scrolls if a device is short so nothing ever clips. */
function Slide({ width, children }: { width: number; children: ReactNode }) {
  return (
    <View style={{ width }}>
      <ScrollView
        style={styles.slideScroll}
        contentContainerStyle={styles.slideBody}
        showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
    </View>
  );
}

// ---- Slide 1: the real picker ------------------------------------------------

function SlidePicker() {
  const [stops, setStops] = useState<Stop[]>([
    { pos: 0.15, rgb: [108, 77, 255] },
    { pos: 0.5, rgb: [214, 74, 168] },
    { pos: 0.85, rgb: [251, 140, 78] },
  ]);
  const [active, setActive] = useState(0);
  const setActiveRgb = (rgb: [number, number, number]) =>
    setStops((prev) => prev.map((s, i) => (i === active ? { ...s, rgb } : s)));

  return (
    <>
      <StepHead n={1} kicker="The picker" title="Mix up to three colours" />
      <ThemedText type="small" themeColor="textSecondary" style={styles.lead}>
        Drag the stops to weight each colour. This is the exact tool the search runs on — no energy
        type, just the palette you want.
      </ThemedText>
      <View style={styles.pickerWrap}>
        <GradientMixBar stops={stops} active={active} onChange={setStops} onActive={setActive} />
        <HsvColorPicker rgb={stops[active].rgb} onChange={setActiveRgb} />
      </View>
    </>
  );
}

// ---- Slide 2: the fill button -----------------------------------------------

function SlideFill() {
  const [pulse] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 800, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [pulse]);
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] });

  return (
    <>
      <StepHead n={2} kicker="The fill" title="One tap composes the page" />
      <ThemedText type="small" themeColor="textSecondary" style={styles.lead}>
        Pick a card as the seed, choose the method, and tri-color ranks every card by its real
        palette and lays a whole page — empty pockets only, your placed cards untouched.
      </ThemedText>
      {/* A facsimile of the real AutoFill method row. */}
      <View style={styles.methodRow}>
        <View style={styles.methodText}>
          <View style={styles.methodTitleRow}>
            <ThemedText type="smallBold">Color match · tri-color</ThemedText>
            <View style={styles.proPill}>
              <Text style={styles.proPillText}>PRO</Text>
            </View>
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            Ranks every card by its actual palette for a page that flows edge to edge.
          </ThemedText>
        </View>
      </View>
      <Animated.View style={[styles.fillBtn, { transform: [{ scale }] }]}>
        <Text style={styles.fillBtnText}>✨ Fill page</Text>
      </Animated.View>
      <ThemedText type="small" themeColor="textSecondary" style={styles.hintCenter}>
        ↓ and the page fills like this
      </ThemedText>
    </>
  );
}

// ---- Slide 3: the real binder output ----------------------------------------

function SlideOutput({ cells, pagerW, active }: { cells: Cell[] | null; pagerW: number; active: boolean }) {
  const gridW = Math.min(pagerW - Spacing.four * 2, 300);
  const cell = Math.floor((gridW - GRID_GAP * 2) / 3);
  const cellH = Math.round(cell * 1.39);
  const byPos = new Map((cells ?? []).map((c) => [`${c.row},${c.col}`, c]));

  return (
    <>
      <StepHead n={3} kicker="The output" title="Your page, palette-matched" />
      <ThemedText type="small" themeColor="textSecondary" style={styles.lead}>
        A real fill from the Tri-Color Search — eight pockets composed around one card into a single
        colour story.
      </ThemedText>
      <View style={[styles.grid, { width: cell * 3 + GRID_GAP * 2 }]}>
        {Array.from({ length: 9 }, (_, i) => {
          const r = Math.floor(i / 3);
          const c = i % 3;
          const item = byPos.get(`${r},${c}`);
          const pocket = (
            <View style={[styles.pocket, { width: cell, height: cellH }]}>
              {!cells ? (
                <View style={styles.pocketLoading} />
              ) : item?.cardId ? (
                <Image
                  source={{ uri: cardThumbUrl(item.cardId, 245) }}
                  style={{ width: cell, height: cellH }}
                  resizeMode="cover"
                />
              ) : item?.insertColor ? (
                <View style={[styles.insert, { backgroundColor: item.insertColor }]} />
              ) : (
                <View style={styles.pocketLoading} />
              )}
            </View>
          );
          // Reveal the cards one by one once the fill is ready and we're on this slide.
          return cells && active ? (
            <Reveal key={i} delay={i * 70}>
              {pocket}
            </Reveal>
          ) : (
            <View key={i}>{pocket}</View>
          );
        })}
      </View>
      <ThemedText type="small" themeColor="textSecondary" style={styles.hintCenter}>
        Unlock this with any PRO or VIP plan. Free keeps “Color by type”.
      </ThemedText>
    </>
  );
}

function Reveal({ delay, children }: { delay: number; children: ReactNode }) {
  const [a] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(a, { toValue: 1, duration: 340, delay, useNativeDriver: true }).start();
  }, [a, delay]);
  return (
    <Animated.View
      style={{ opacity: a, transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }] }}>
      {children}
    </Animated.View>
  );
}

function StepHead({ n, kicker, title }: { n: number; kicker: string; title: string }) {
  return (
    <View style={styles.stepHead}>
      <Text style={styles.kicker}>
        {n} / 3 · {kicker.toUpperCase()}
      </Text>
      <ThemedText type="subtitle" style={styles.stepTitle}>
        {title}
      </ThemedText>
    </View>
  );
}

const GRID_GAP = 5;

const styles = StyleSheet.create({
  wrap: { width: '100%', maxWidth: 460, maxHeight: '92%' },
  card: { borderRadius: Radius.sheet, padding: Spacing.four, gap: Spacing.three, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: FontSize.h2, lineHeight: 26 },
  pro: { fontSize: FontSize.tag, color: '#6C4DFF', fontWeight: '700', letterSpacing: 0.5 },

  viewport: { overflow: 'hidden' },
  row: { flexDirection: 'row', height: '100%' },
  slideScroll: { flex: 1 },
  slideBody: { paddingHorizontal: Spacing.one, paddingBottom: Spacing.two, gap: Spacing.two },

  stepHead: { gap: 2, marginBottom: Spacing.one },
  kicker: { fontSize: FontSize.tag, letterSpacing: 1, color: '#6C4DFF', fontWeight: '700' },
  stepTitle: { fontSize: FontSize.md, lineHeight: 24 },
  lead: { lineHeight: 20 },
  hintCenter: { textAlign: 'center', lineHeight: 18, marginTop: Spacing.one },

  pickerWrap: { gap: Spacing.two, marginTop: Spacing.one },

  methodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.three,
    borderRadius: Radius.panel,
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
    marginTop: Spacing.one,
  },
  methodText: { flex: 1, gap: 2 },
  methodTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  proPill: {
    paddingVertical: 1,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.pill,
    backgroundColor: Palette.panel,
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
  },
  proPillText: { fontSize: FontSize.tag, color: Palette.ink2, fontWeight: '700', letterSpacing: 0.5 },
  fillBtn: {
    alignSelf: 'center',
    backgroundColor: Palette.accent,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.five,
    borderRadius: Radius.pill,
    marginTop: Spacing.two,
  },
  fillBtnText: { color: Palette.accentText, fontWeight: Weight.bold, fontSize: FontSize.control },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
    alignSelf: 'center',
    marginTop: Spacing.one,
  },
  pocket: {
    borderRadius: Radius.thumb,
    overflow: 'hidden',
    backgroundColor: Palette.panel,
  },
  pocketLoading: { flex: 1, backgroundColor: Palette.panel },
  insert: { flex: 1 },

  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { fontSize: FontSize.control, fontWeight: Weight.semibold, color: Palette.muted },
  hidden: { opacity: 0 },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Palette.hairlineStrong },
  dotOn: { backgroundColor: Palette.accent, width: 18 },
  nextBtn: { paddingVertical: Spacing.one, paddingHorizontal: Spacing.two },
  nextText: { fontSize: FontSize.control, fontWeight: Weight.bold, color: Palette.accent },
  ctaBtn: {
    backgroundColor: Palette.accent,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.pill,
  },
  ctaText: { color: Palette.accentText, fontWeight: Weight.bold, fontSize: FontSize.control },
});
