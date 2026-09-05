/**
 * THE PLAYER PILL in the binder header: the track's name, play/pause, a volume dial, and a mute
 * that is remembered across binders. Shown only while a track is set. When the browser has refused
 * an autoplay it reads "tap to play", so the silence says why it is silent.
 *
 * THE DIAL SITS AFTER THE MUTE, not in a menu behind it. Volume on someone else's binder is the
 * control people reach for second (after "make it stop"), and a pill that hides it behind a press
 * would cost two interactions to do the one thing a slider does in one drag. It renders nothing on
 * native, where the player is silent anyway.
 */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

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
  if (!s.url) return null;
  const glyph = s.muted ? '🔇' : s.playing ? '⏸' : '▶';
  const hint = s.muted ? 'muted' : s.blocked ? 'tap to play' : s.playing ? '' : 'paused';
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
  btn: { paddingHorizontal: 4, paddingVertical: 2 },
  pressed: { opacity: 0.6 },
  glyph: { fontSize: 13, color: Palette.ink2 },
  name: { flexShrink: 1, fontSize: FontSize.label, fontWeight: Weight.semibold, color: Palette.ink2 },
  hint: { fontWeight: Weight.regular, color: Palette.muted },
});
