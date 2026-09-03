/**
 * EEVEE, SEVEN WAYS. The same seed card in the middle of a 3×3, and each fill method laying its
 * eight cards around it, clockwise from the top-left, one dissolving in after another. The
 * finished page holds for two seconds; then the next method sweeps round, each old card
 * dissolving out one step ahead of the new card dissolving in.
 *
 * The cards are the ones the hosted walkthrough (public/auto-fill-methods.html) shows for each
 * method, served from public/auto-fill-art, so the loop is that page in motion rather than a
 * recording of it. Seven of the eight methods place cards; Full-page spread fills the pockets
 * with a printed colour sheet instead, and is left out rather than faked. (In that page each
 * grid sits ABOVE its heading — the cards belong to the heading that follows them.)
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
  { name: 'Same Pokémon', pitch: 'One species, every era.', cards: [45154, 86850, 183907, 477251, SEED, 610430, 183560, 232611, 270724] },
  { name: 'Evolution line', pitch: 'The whole family, one of each.', cards: [45123, 85316, 86678, 106982, SEED, 85745, 106981, 90137, 89729] },
  { name: 'Same artist', pitch: 'One illustrator’s hand across the page.', cards: [542809, 686342, 542888, 550097, SEED, 567278, 642469, 642470, 642269] },
  { name: 'Friends & partners', pitch: 'Who it canonically stands beside.', cards: [42402, 45122, 85534, 89385, SEED, 86859, 88795, 88072, 89386] },
  { name: 'More like this', pitch: 'The cards that look closest to it.', cards: [201981, 478093, 623591, 264218, SEED, 201355, 171013, 201342, 146731] },
  { name: 'Color by type', pitch: 'Its energy type, gathered.', cards: [42371, 154997, 83871, 83485, SEED, 46482, 83690, 83517, 83923] },
  { name: 'Color match', pitch: 'Every card ranked by its palette, nearest first.', cards: [154998, 83509, 90337, 90085, SEED, 86083, 90643, 497692, 89576] },
];

/** Clockwise from the top-left, skipping the centre. */
const CLOCKWISE = [0, 1, 2, 5, 8, 7, 6, 3];

const STEP_MS = 340;
const FADE_MS = 420;
const HOLD_MS = 2000;

export function EeveeReplay({ width }: { width: number }) {
  // ONE CLOCKWISE SWEEP DOES BOTH JOBS. Between methods the sweep runs round the eight outer
  // pockets once: at each step the OLD card at that position dissolves out, and the NEW card
  // dissolves in one position behind it. So the page is never cleared — the next page overwrites
  // this one a pocket at a time, removal leading insertion by one step.
  //
  // `step` counts the sweep: 0 is the finished page at rest; steps 1…9 are the transition (nine,
  // because insertion trails removal by one). `method` is the INCOMING method from step 1, which
  // is also when its name appears, so the title leads the cards rather than trailing them.
  const [method, setMethod] = useState(0);
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setTimeout(
      () => {
        if (step === 0) {
          setMethod((m) => (m + 1) % METHODS.length);
          setStep(1);
        } else if (step < 9) setStep(step + 1);
        else setStep(0);
      },
      step === 0 ? HOLD_MS : STEP_MS,
    );
    return () => clearTimeout(t);
  }, [step]);

  const m = METHODS[method];
  const prev = METHODS[(method + METHODS.length - 1) % METHODS.length];
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
          // At rest (step 0) every pocket holds the current method's card. Mid-sweep, a pocket
          // whose rank is behind the sweep holds the new card, the pocket the sweep is on is
          // empty, and pockets ahead of it still hold the previous method's card.
          const p = rank(i);
          const showNew = isSeed || step === 0 || p < step - 1;
          const showOld = !isSeed && step > 0 && p >= step;
          return (
            <View key={i} style={[styles.pocket, box]}>
              {showNew ? (
                <Animated.View
                  key={`new-${method}`}
                  entering={isSeed ? undefined : FadeIn.duration(FADE_MS)}
                  style={StyleSheet.absoluteFill}>
                  <Image source={{ uri: ART(id) }} style={styles.card} contentFit="cover" transition={0} />
                </Animated.View>
              ) : null}
              {showOld ? (
                <Animated.View key={`old-${method}`} exiting={FadeOut.duration(FADE_MS)} style={StyleSheet.absoluteFill}>
                  <Image source={{ uri: ART(prev.cards[i]) }} style={styles.card} contentFit="cover" transition={0} />
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
