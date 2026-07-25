/**
 * Upsell shown when a FREE user taps the locked "Color match · tri-color" composer method in the
 * AutoFill sheet. A 3-step SLIDING flow that is a genuine LIVE demo of the paid Tri-Color Search —
 * everything is computed client-side from the loaded catalog + colour engine:
 *
 *   1. The picker  — the actual `GradientMixBar` + `HsvColorPicker`. Drag the three stops; the
 *                    colour mix drives a real `searchByColors` (debounced) behind the scenes.
 *   2. The match   — the closest REAL card the search returns for that mix, beside the swatches.
 *   3. The results — a binder page of the real cards the search returned, revealed one by one.
 *
 * Because pages 2 & 3 read off the same live query, dragging a colour on page 1 changes the match
 * and the results. CTA routes to /plans. The gate itself lives in AutoFillSheet (this is the sell).
 */
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
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
import { searchByColors, srgbToLab, useColorIndex, type Lab } from 'tcgscan-browse';

import { GradientMixBar, HsvColorPicker, rgbToHex, stopWeights, type Stop } from '@/components/color/ColorPicker';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { sheet } from '@/constants/ui';
import type { Catalog } from '@/lib/catalog';
import { cardThumbUrl, useImageManifest } from '@/lib/catalogConfig';

// The palette the flow opens on: purple → magenta → orange (the colours the story names).
const TRIAD: Stop[] = [
  { pos: 0.2, rgb: [108, 77, 255] },
  { pos: 0.5, rgb: [214, 74, 168] },
  { pos: 0.8, rgb: [251, 140, 78] },
];

// Safety net if the colour search returns nothing (e.g. the on-device index isn't warm and the
// server path is down): real, colourful cards so the flow is never empty. Ids from
// data/exampleCollection.ts.
const FALLBACK_IDS = ['517045', '610516', '590026', '509980', '517017', '662184'];

export function TriColorUpsell({
  visible,
  onClose,
  catalog,
  /** Runs just before navigating to /plans — close the covering AutoFill sheet so /plans shows. */
  onBeforeUpgrade,
}: {
  visible: boolean;
  onClose: () => void;
  catalog: Catalog | null | undefined;
  onBeforeUpgrade?: () => void;
}) {
  const router = useRouter();
  const { height: winH } = useWindowDimensions();
  useImageManifest(); // so cardThumbUrl resolves once the hashed manifest hydrates
  useColorIndex(true); // warm the on-device colour index so searchByColors has a path

  const [step, setStep] = useState(0);
  const [pagerW, setPagerW] = useState(0);
  const [tx] = useState(() => new Animated.Value(0));
  const pagerH = Math.min(440, Math.round(winH * 0.64));

  // The live colour mix (shared by all three slides).
  const [stops, setStops] = useState<Stop[]>(TRIAD);
  const [active, setActive] = useState(0);
  const query = useMemo<Lab[]>(() => {
    const w = stopWeights(stops);
    return stops.map((s, i) => ({ ...srgbToLab(s.rgb[0], s.rgb[1], s.rgb[2]), w: w[i] })).filter((c) => c.w > 0);
  }, [stops]);

  useEffect(() => {
    Animated.timing(tx, { toValue: -step * pagerW, duration: 300, useNativeDriver: true }).start();
  }, [step, pagerW, tx]);

  useEffect(() => {
    if (visible) setStep(0); // eslint-disable-line react-hooks/set-state-in-effect
  }, [visible]);

  // Live results for the current mix — the exact `searchByColors` the real Tri-Color Search runs,
  // debounced so dragging a stop doesn't fire a request per frame.
  const [results, setResults] = useState<string[] | null>(null);
  useEffect(() => {
    if (!visible || !catalog) return;
    let alive = true;
    const t = setTimeout(() => {
      searchByColors(query, 'noborder', { limit: 18 })
        .then((ids) => {
          if (!alive) return;
          // Keep only ids that resolve to a real, mirrored cover so no pocket renders blank.
          const real = ids.filter((id) => catalog.getCard(id) && cardThumbUrl(id, 245));
          setResults(real.length ? real : FALLBACK_IDS);
        })
        .catch(() => alive && setResults(FALLBACK_IDS));
    }, 350);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [visible, catalog, query]);

  const goTo = (i: number) => setStep(Math.max(0, Math.min(2, i)));
  const upgrade = () => {
    onClose();
    onBeforeUpgrade?.();
    router.push('/plans');
  };

  const heroId = results?.[0];
  const heroCard = heroId && catalog ? catalog.getCard(heroId) : undefined;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={sheet.dialogBackdrop} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.wrap}>
          <ThemedView type="backgroundElement" style={styles.card}>
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

            <View
              style={[styles.viewport, { height: pagerH }]}
              onLayout={(e) => setPagerW(e.nativeEvent.layout.width)}>
              <Animated.View style={[styles.row, { width: pagerW * 3, transform: [{ translateX: tx }] }]}>
                <Slide width={pagerW}>
                  <SlidePicker stops={stops} active={active} onChange={setStops} onActive={setActive} />
                </Slide>
                <Slide width={pagerW}>
                  <SlideMatch card={heroCard} name={heroCard?.name} setName={heroCard?.setName} stops={stops} />
                </Slide>
                <Slide width={pagerW}>
                  <SlideResults results={results} pagerW={pagerW} active={step === 2} />
                </Slide>
              </Animated.View>
            </View>

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
      <ScrollView style={styles.slideScroll} contentContainerStyle={styles.slideBody} showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
    </View>
  );
}

// ---- Slide 1: the real picker ------------------------------------------------

function SlidePicker({
  stops,
  active,
  onChange,
  onActive,
}: {
  stops: Stop[];
  active: number;
  onChange: (s: Stop[]) => void;
  onActive: (i: number) => void;
}) {
  const setActiveRgb = (rgb: [number, number, number]) =>
    onChange(stops.map((s, i) => (i === active ? { ...s, rgb } : s)));
  return (
    <>
      <StepHead n={1} kicker="The picker" title="Mix up to three colours" />
      <ThemedText type="small" themeColor="textSecondary" style={styles.lead}>
        Drag the stops to weight each colour. This is the exact tool the search runs on — no energy
        type, just the palette you want.
      </ThemedText>
      <View style={styles.pickerWrap}>
        <GradientMixBar stops={stops} active={active} onChange={onChange} onActive={onActive} />
        <HsvColorPicker rgb={stops[active].rgb} onChange={setActiveRgb} />
      </View>
    </>
  );
}

// ---- Slide 2: the closest real card -----------------------------------------

function SlideMatch({
  card,
  name,
  setName,
  stops,
}: {
  card: { id: string } | undefined;
  name?: string;
  setName?: string;
  stops: Stop[];
}) {
  return (
    <>
      <StepHead n={2} kicker="The match" title="A real card in your palette" />
      <ThemedText type="small" themeColor="textSecondary" style={styles.lead}>
        Tri-color reads each card’s actual artwork. Here’s the closest match to your mix — the same
        card the paid search puts first.
      </ThemedText>
      <View style={styles.matchWrap}>
        <View style={styles.swatchCol}>
          {stops.map((s, i) => (
            <View key={i} style={[styles.swatchSm, { backgroundColor: rgbToHex(s.rgb) }]} />
          ))}
        </View>
        <View style={styles.heroCard}>
          {card ? (
            <Image source={{ uri: cardThumbUrl(card.id, 640) }} style={styles.heroImg} resizeMode="cover" />
          ) : (
            <View style={styles.heroLoading} />
          )}
        </View>
      </View>
      {name ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.matchCaption}>
          {name}
          {setName ? ` · ${setName}` : ''}
        </ThemedText>
      ) : null}
    </>
  );
}

// ---- Slide 3: the real search results as a binder page ----------------------

function SlideResults({ results, pagerW, active }: { results: string[] | null; pagerW: number; active: boolean }) {
  const gridW = Math.min(pagerW - Spacing.four * 2, 300);
  const cell = Math.floor((gridW - GRID_GAP * 2) / 3);
  const cellH = Math.round(cell * 1.39);
  const ids = (results ?? []).slice(0, 9);

  return (
    <>
      <StepHead n={3} kicker="The results" title="Your page, palette-matched" />
      <ThemedText type="small" themeColor="textSecondary" style={styles.lead}>
        The real cards the Tri-Color Search returns for your mix — a whole binder page in your exact
        colours, composed in one tap.
      </ThemedText>
      <View style={[styles.grid, { width: cell * 3 + GRID_GAP * 2 }]}>
        {Array.from({ length: 9 }, (_, i) => {
          const id = ids[i];
          const pocket = (
            <View style={[styles.pocket, { width: cell, height: cellH }]}>
              {!results ? (
                <View style={styles.pocketLoading} />
              ) : id ? (
                <Image source={{ uri: cardThumbUrl(id, 245) }} style={{ width: cell, height: cellH }} resizeMode="cover" />
              ) : (
                <View style={styles.pocketLoading} />
              )}
            </View>
          );
          return results && active ? (
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
    <Animated.View style={{ opacity: a, transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }] }}>
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

  // Slide 2 hero
  matchWrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.three, marginTop: Spacing.two },
  swatchCol: { gap: Spacing.two },
  swatchSm: { width: 30, height: 30, borderRadius: Radius.thumb, borderWidth: 2, borderColor: '#FFFFFF' },
  heroCard: { width: 150, height: 209, borderRadius: Radius.control, overflow: 'hidden', backgroundColor: Palette.panel },
  heroImg: { width: 150, height: 209 },
  heroLoading: { flex: 1, backgroundColor: Palette.panel },
  matchCaption: { textAlign: 'center', marginTop: Spacing.two },

  // Slide 3 grid
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP, alignSelf: 'center', marginTop: Spacing.one },
  pocket: { borderRadius: Radius.thumb, overflow: 'hidden', backgroundColor: Palette.panel },
  pocketLoading: { flex: 1, backgroundColor: Palette.panel },

  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { fontSize: FontSize.control, fontWeight: Weight.semibold, color: Palette.muted },
  hidden: { opacity: 0 },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Palette.hairlineStrong },
  dotOn: { backgroundColor: Palette.accent, width: 18 },
  nextBtn: { paddingVertical: Spacing.one, paddingHorizontal: Spacing.two },
  nextText: { fontSize: FontSize.control, fontWeight: Weight.bold, color: Palette.accent },
  ctaBtn: { backgroundColor: Palette.accent, paddingVertical: Spacing.two, paddingHorizontal: Spacing.four, borderRadius: Radius.pill },
  ctaText: { color: Palette.accentText, fontWeight: Weight.bold, fontSize: FontSize.control },
});
