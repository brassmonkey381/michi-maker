/**
 * THE PRESET PICTURE PICKER (owner, 2026-10-13: "make access to a collection of preselected
 * background images easier"). A grid of thumbnails from data/presetBackdrops: textures where a
 * sleeve or an art backing is chosen, themes where the picture behind the share image is. One tap
 * stores the preset's hosted address, which is an ordinary picture address to everything
 * downstream, so a preset and a pasted link are the same thing once chosen. The link field keeps
 * its place underneath for anyone with a picture of their own.
 *
 * Thumbnails only: the grid never loads a full picture. The one in use is outlined, and its credit
 * is shown under the grid, the way the stock-art search shows who made a picture.
 */
import { Image } from 'expo-image';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { FontSize, Palette, Radius } from '@/constants/theme';
import { type PresetKind, presetFor, presetsOf } from '@/data/presetBackdrops';

export function PresetPictureGrid({
  kind,
  value,
  onPick,
  testID,
}: {
  kind: PresetKind;
  /** The address in use, so the matching tile is outlined. A pasted link matches nothing. */
  value?: string | null;
  onPick: (url: string) => void;
  testID?: string;
}) {
  const presets = presetsOf(kind);
  const chosen = presetFor(value);
  return (
    <View style={styles.box} testID={testID}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {presets.map((p) => {
          const on = chosen?.id === p.id;
          return (
            <Pressable
              key={p.id}
              onPress={() => onPick(p.url)}
              accessibilityRole="button"
              accessibilityLabel={`${p.label}, by ${p.author}`}
              accessibilityState={{ selected: on }}
              testID={testID ? `${testID}-${p.id}` : undefined}
              style={[styles.tile, on && styles.tileOn]}>
              <Image source={{ uri: p.thumb }} style={styles.thumb} contentFit="cover" cachePolicy="memory-disk" transition={0} />
              <Text style={[styles.label, on && styles.labelOn]} numberOfLines={1}>
                {p.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {chosen ? (
        <Text style={styles.credit} testID={testID ? `${testID}-credit` : undefined}>
          {chosen.label}, by{' '}
          <Text style={styles.creditLink} onPress={() => Linking.openURL(chosen.page).catch(() => {})}>
            {chosen.author}
          </Text>{' '}
          on {chosen.provider === 'pexels' ? 'Pexels' : 'Pixabay'}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignSelf: 'stretch', gap: 4 },
  row: { flexDirection: 'row', gap: 6, paddingVertical: 2, paddingRight: 8 },
  tile: { width: 72, borderRadius: Radius.control, borderWidth: 2, borderColor: 'transparent', padding: 2, gap: 2 },
  tileOn: { borderColor: Palette.accent },
  thumb: { width: '100%', aspectRatio: 3 / 2, borderRadius: Radius.control - 2, backgroundColor: Palette.panel },
  label: { fontSize: FontSize.xs, color: Palette.muted, textAlign: 'center' },
  labelOn: { color: Palette.ink, fontWeight: '600' },
  credit: { fontSize: FontSize.xs, color: Palette.muted },
  creditLink: { textDecorationLine: 'underline' },
});
