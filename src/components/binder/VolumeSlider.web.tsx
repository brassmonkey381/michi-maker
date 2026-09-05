/**
 * The soundtrack's volume dial — web.
 *
 * A raw DOM `<input type="range">` inside the RN tree, the same trick ColorField.web.tsx uses for
 * the colour picker. NOT @react-native-community/slider: that is a native module, and a native
 * module means the next iOS/Android build rather than an OTA push (docs/EAS-NEXT-BUILD.md). The
 * player only makes sound on the web anyway — binderAudio.ts is a silent stub on native — so the
 * control belongs exactly where the audio does, and the native variant renders nothing.
 *
 * `accentColor` paints the filled half and the thumb in one line, and degrades to the browser's own
 * blue on anything that does not support it. Not worth a hand-built track and thumb.
 */
import { StyleSheet, View } from 'react-native';

import { Palette } from '@/constants/theme';

export function VolumeSlider({
  volume,
  onChange,
}: {
  volume: number;
  onChange: (v: number) => void;
}) {
  return (
    <View style={styles.wrap}>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={volume}
        onChange={(e) => onChange(Number(e.currentTarget.value))}
        aria-label="Soundtrack volume"
        title="Soundtrack volume"
        style={{
          width: 64,
          height: 16,
          margin: 0,
          cursor: 'pointer',
          accentColor: Palette.accent,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { justifyContent: 'center' },
});
