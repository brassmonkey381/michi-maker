/**
 * THE PLAYER PILL in the binder header: the track's name, play/pause, a volume dial, and a mute
 * that is remembered across binders. Shown only while a track is set.
 *
 * WHEN THE BROWSER HAS REFUSED THE AUTOPLAY the pill stops being a status readout and becomes an
 * invitation. This is the common case, not the edge one: arriving from a shared link is not a user
 * gesture, so Chrome refuses on a first visit and the binder that was built around its soundtrack
 * opens silent. It used to say so in four muted words after the track name, which nobody read; the
 * owner's report was "I don't see anything now, just a play button". So refused now means the whole
 * pill wears the accent, reads "Tap to play" first and the track name second, presses anywhere
 * along its length, and breathes until it is dealt with.
 *
 * THE PULSE IS THE ONLY MOVING THING IN A BINDER HEADER, which is what makes it work and also what
 * makes it rude if it outstays its welcome. It runs only while playback is actually blocked, so the
 * first press, the first gesture anywhere on the page (the player arms one), or a mute all end it.
 * Reduce motion gets the accent and the copy without the movement.
 *
 * THE DIAL SITS AFTER THE MUTE, not in a menu behind it. Volume on someone else's binder is the
 * control people reach for second (after "make it stop"), and a pill that hides it behind a press
 * would cost two interactions to do the one thing a slider does in one drag. It renders nothing on
 * native, where the player is silent anyway.
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { VolumeSlider } from '@/components/binder/VolumeSlider';
import {
  getPlayerState,
  setMuted,
  setVolume,
  subscribePlayer,
  togglePlay,
  type PlayerState,
} from '@/lib/binderAudio';

export function TrackPill() {
  const [s, setS] = useState<PlayerState>(getPlayerState);
  useEffect(() => subscribePlayer(setS), []);

  // Refused, and not because the reader muted it: that is a decision, and a decision does not need
  // pestering. Only a browser's refusal does.
  const blocked = s.blocked && !s.muted;

  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((on) => alive && setReduceMotion(on))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  // useState, not useRef: the value is created once either way, and reading `.current` during
  // render is what the refs rule forbids.
  const [pulse] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!blocked || reduceMotion) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [blocked, reduceMotion, pulse]);

  if (!s.url) return null;

  const glyph = s.muted ? '🔇' : s.playing ? '⏸' : '▶';
  const hint = s.muted ? 'muted' : s.playing ? '' : 'paused';
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.045] });

  if (blocked) {
    // One target, the whole pill: the thing being asked for is a press, so every part of it presses.
    return (
      <Animated.View style={{ transform: [{ scale }] }}>
        <Pressable
          onPress={togglePlay}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Play the soundtrack, ${s.name}`}
          style={({ pressed }) => [styles.pill, styles.pillBlocked, pressed && styles.pressed]}>
          <Text style={styles.glyphBlocked}>▶</Text>
          <Text numberOfLines={1} style={styles.callToAction}>
            Tap to play
            {s.name ? <Text style={styles.nameBlocked}> · {s.name}</Text> : null}
          </Text>
        </Pressable>
      </Animated.View>
    );
  }

  return (
    <View style={styles.pill}>
      <Pressable
        onPress={() => (s.muted ? setMuted(false) : togglePlay())}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={s.playing ? 'Pause the soundtrack' : 'Play the soundtrack'}
        style={({ pressed }) => [styles.btn, pressed && styles.pressed]}>
        <Text style={styles.glyph}>{glyph}</Text>
      </Pressable>
      <Text numberOfLines={1} style={styles.name}>
        {s.name}
        {hint ? <Text style={styles.hint}> · {hint}</Text> : null}
      </Text>
      <Pressable
        onPress={() => setMuted(!s.muted)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={s.muted ? 'Unmute soundtracks' : 'Mute soundtracks'}
        style={({ pressed }) => [styles.btn, pressed && styles.pressed]}>
        <Text style={styles.glyph}>{s.muted ? '🔈' : '🔉'}</Text>
      </Pressable>
      {/* Shows where the dial is even while muted, rather than vanishing and taking the pill's
          width with it. Dragging up from silence unmutes (see setVolume). */}
      <VolumeSlider volume={s.muted ? 0 : s.volume} onChange={setVolume} />
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: 320,
    paddingHorizontal: Spacing.two,
    paddingVertical: 3,
    borderRadius: Radius.pill,
    backgroundColor: Palette.panel,
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
  },
  /** The invitation: accent ground, and roomier than the quiet pill so it reads as a button. */
  pillBlocked: {
    gap: 6,
    paddingHorizontal: Spacing.three,
    paddingVertical: 6,
    backgroundColor: Palette.accent,
    borderColor: Palette.accent,
  },
  btn: { paddingHorizontal: 4, paddingVertical: 2 },
  pressed: { opacity: 0.6 },
  glyph: { fontSize: 13, color: Palette.ink2 },
  glyphBlocked: { fontSize: 13, color: Palette.accentText },
  name: { flexShrink: 1, fontSize: FontSize.label, fontWeight: Weight.semibold, color: Palette.ink2 },
  hint: { fontWeight: Weight.regular, color: Palette.muted },
  callToAction: {
    flexShrink: 1,
    fontSize: FontSize.label,
    fontWeight: Weight.semibold,
    color: Palette.accentText,
  },
  /** The track name still travels, just behind the ask rather than in front of it. */
  nameBlocked: { fontWeight: Weight.regular, opacity: 0.85 },
});
