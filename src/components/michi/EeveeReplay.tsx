/**
 * EEVEE, EIGHT WAYS. The same seed card in the middle of a 3×3, and each fill method laying its
 * eight cards around it, clockwise from the top-left, one dissolving in after another. The
 * finished page holds for two seconds, the eight dissolve away, and the next method begins.
 *
 * The cards are the ones the hosted walkthrough (public/auto-fill-methods.html) shows for each
 * method, served from public/auto-fill-art, so the loop is that page in motion rather than a
 * recording of it. Six of the eight methods place cards; the two colour-sheet methods fill the
 * pockets with printed art instead, and are named at the end of the loop rather than faked.
 */
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing, Weight } from '@/constants/theme';

const SEED = 610758;
const ART = (id: number) => `/auto-fill-art/${id}.webp`;

/** Row-major, nine per method, the seed in the middle — exactly as the walkthrough lays them. */
const METHODS: { name: string; pitch: string; cards: number[] }[] = [
  { name: 'Same Pokémon', pitch: 'One species, every era.', cards: [45123, 85316, 86678, 106982, SEED, 85745, 106981, 90137, 89729] },
  { name: 'Evolution line', pitch: 'Families that grow the way this one does.', cards: [542809, 686342, 542888, 550097, SEED, 567278, 642469, 642470, 642269] },
  { name: 'Same artist', pitch: 'One illustrator’s hand across the page.', cards: [42402, 45122, 85534, 89385, SEED, 86859, 88795, 88072, 89386] },
  { name: 'Friends & partners', pitch: 'Who it canonically stands beside.', cards: [201981, 478093, 623591, 264218, SEED, 201355, 171013, 201342, 146731] },
  { name: 'More like this', pitch: 'The cards that look closest to it.', cards: [42371, 154997, 83871, 83485, SEED, 46482, 83690, 83517, 83923] },
  { name: 'Color by type', pitch: 'Its energy type, gathered.', cards: [154998, 83509, 90337, 90085, SEED, 86083, 90643, 497692, 89576] },
];

/** Clockwise from the top-left, skipping the centre. */
const CLOCKWISE = [0, 1, 2, 5, 8, 7, 6, 3];

const STEP_MS = 340;
const FADE_MS = 420;
const HOLD_MS = 2000;
const GAP_MS = 600;

export function EeveeReplay({ width }: { width: number }) {
  const [method, setMethod] = useState(0);
  // How many of the eight are on the page. 0 is the seed alone; 8 is the finished page.
  const [placed, setPlaced] = useState(0);
  useEffect(() => {
    const t = setTimeout(
      () => {
        if (placed < 8) setPlaced(placed + 1);
        else {
          // Clear the eight; the next method starts after their dissolve has run.
          setPlaced(0);
          setMethod((m) => (m + 1) % METHODS.length);
        }
      },
      placed === 0 ? GAP_MS : placed < 8 ? STEP_MS : HOLD_MS,
    );
    return () => clearTimeout(t);
  }, [placed, method]);

  const m = METHODS[method];
  const pad = 10;
  const gap = 6;
  const cw = (width - pad * 2 - gap * 2) / 3;
  const ch = cw * (88 / 63);
  const height = pad * 2 + ch * 3 + gap * 2;
  const rank = (i: number) => CLOCKWISE.indexOf(i);
  return (
    <View style={styles.wrap}>
      <View style={[styles.mat, { width, height, padding: pad }]}>
        {m.cards.map((id, i) => {
          const r = Math.floor(i / 3);
          const c = i % 3;
          const box = { position: 'absolute' as const, left: pad + c * (cw + gap), top: pad + r * (ch + gap), width: cw, height: ch };
          const isSeed = i === 4;
          const on = isSeed || rank(i) < placed;
          return (
            <View key={`${method}-${i}`} style={[styles.pocket, box]}>
              {on ? (
                <Animated.View
                  entering={isSeed ? undefined : FadeIn.duration(FADE_MS)}
                  exiting={isSeed ? undefined : FadeOut.duration(FADE_MS)}
                  style={StyleSheet.absoluteFill}>
                  <Image source={{ uri: ART(id) }} style={styles.card} contentFit="cover" transition={0} />
                </Animated.View>
              ) : null}
              {isSeed ? <Text style={styles.tag}>your card</Text> : null}
            </View>
          );
        })}
      </View>
      <View style={styles.caption}>
        <ThemedText type="smallBold">{m.name}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {m.pitch}
        </ThemedText>
        <View style={styles.dots}>
          {METHODS.map((x, i) => (
            <View key={x.name} style={[styles.dot, i === method && styles.dotOn]} />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: Spacing.two },
  mat: { backgroundColor: '#EDE6D6', borderRadius: 12, position: 'relative' },
  pocket: { backgroundColor: '#DDD4C0', borderRadius: 5, overflow: 'hidden' },
  card: { width: '100%', height: '100%' },
  tag: {
    position: 'absolute',
    bottom: 4,
    alignSelf: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.pill,
    backgroundColor: Palette.accent,
    color: Palette.accentText,
    fontSize: 10,
    fontWeight: Weight.semibold,
  },
  caption: { alignItems: 'center', gap: 2, minHeight: 58 },
  dots: { flexDirection: 'row', gap: 5, marginTop: 4 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Palette.hairlineStrong },
  dotOn: { backgroundColor: Palette.accent },
});
