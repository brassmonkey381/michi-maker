/**
 * A square avatar that opens someone's public profile.
 *
 * SQUARE, not the circle used in People search: this sits in a row of binder tiles, and a square
 * reads as a sibling of the pages beside it rather than as a stray chat bubble.
 *
 * MOST PEOPLE HAVE NO PICTURE, and that is the normal case rather than an error state. Provider
 * photos were withdrawn in 20260826140000 (published without consent) and are only restored when
 * someone opts back in, so the lettered tile is what the majority will show — it is styled to look
 * deliberate, not like a failed image.
 */
import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Palette, Radius } from '@/constants/theme';

export function ProfileAvatarButton({
  username,
  avatarUrl,
  size = 26,
  onPress,
}: {
  /** The @handle, used for the letter and the accessibility label. */
  username?: string | null;
  avatarUrl?: string | null;
  size?: number;
  onPress: () => void;
}) {
  const letter = (username || '?').trim().charAt(0).toUpperCase();
  const box = { width: size, height: size, borderRadius: Math.max(4, Math.round(size * 0.22)) };
  return (
    <Pressable
      onPress={(e) => {
        // The whole tile is itself a Pressable that opens the BINDER; without this the tap would
        // bubble and open the binder instead of the person.
        e.stopPropagation();
        onPress();
      }}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={username ? `Open @${username}'s profile` : 'Open profile'}
      style={({ pressed }) => [pressed && styles.pressed]}>
      {avatarUrl ? (
        <Image source={{ uri: avatarUrl }} style={[styles.box, box]} contentFit="cover" />
      ) : (
        <View style={[styles.box, styles.letterBox, box]}>
          <ThemedText style={[styles.letter, { fontSize: Math.round(size * 0.5) }]}>
            {letter}
          </ThemedText>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.6 },
  box: { borderRadius: Radius.control, backgroundColor: 'rgba(128,128,128,0.18)' },
  letterBox: { alignItems: 'center', justifyContent: 'center' },
  letter: { color: Palette.accent, fontWeight: '700', lineHeight: undefined },
});
