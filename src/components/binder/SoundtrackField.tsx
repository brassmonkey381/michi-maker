/**
 * THE SOUNDTRACK ROW in the binder and page detail dialogs: what is set, and the way to change
 * it. VIP only — a free or PRO account sees the row and gets the plan offer on tap, the same
 * way covers do. Web only in practice: the file picker is a DOM input; native shows the row
 * and explains.
 *
 * RIGHTS, UP FRONT. Music is the most-litigated upload there is, so the picker does not open
 * until the owner has ticked that they hold the rights to play this track publicly. The tick is
 * stored with the track (attested_at), the same shape the art attestation takes.
 */
import { useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { pillChip } from '@/constants/ui';
import type { BinderTrack } from '@/data/binderTypes';
import { MAX_AUDIO_BYTES, uploadAudio } from '@/lib/uploadAudio';

export function SoundtrackField({
  label,
  track,
  onChange,
  locked,
  onLocked,
}: {
  label: string;
  /** null = explicitly cleared, undefined = never set. The field treats both as "no track". */
  track: BinderTrack | null | undefined;
  onChange: (track: BinderTrack | null) => void;
  /** Not on VIP: the row shows, the tap explains. */
  locked: boolean;
  onLocked: () => void;
}) {
  const [attested, setAttested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const pick = () => {
    setError(null);
    if (locked) {
      onLocked();
      return;
    }
    if (!attested) {
      setError('Tick the rights box first.');
      return;
    }
    if (Platform.OS !== 'web') {
      setError('Add tracks from the web app.');
      return;
    }
    let input = inputRef.current;
    if (!input) {
      input = document.createElement('input');
      input.type = 'file';
      input.accept = 'audio/*';
      input.style.display = 'none';
      document.body.appendChild(input);
      inputRef.current = input;
    }
    input.value = '';
    input.onchange = async () => {
      const file = input?.files?.[0];
      if (!file) return;
      setBusy(true);
      try {
        const { url, bytes } = await uploadAudio(file, file.name);
        onChange({ url, name: file.name.replace(/\.[a-z0-9]+$/i, ''), bytes, attestedAt: new Date().toISOString() });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Upload failed.');
      } finally {
        setBusy(false);
      }
    };
    input.click();
  };

  return (
    <View style={styles.wrap}>
      <ThemedText type="smallBold" style={styles.label}>
        {label}
        <Text style={styles.vip}> · VIP</Text>
      </ThemedText>
      {track ? (
        <View style={styles.row}>
          <ThemedText type="small" numberOfLines={1} style={styles.name}>
            ♪ {track.name}
          </ThemedText>
          <Pressable onPress={pick} disabled={busy} style={({ pressed }) => [pillChip.base, pressed && styles.pressed]}>
            <Text style={pillChip.text}>{busy ? 'Uploading…' : 'Replace'}</Text>
          </Pressable>
          <Pressable onPress={() => onChange(null)} disabled={busy} style={({ pressed }) => [pillChip.base, pressed && styles.pressed]}>
            <Text style={pillChip.text}>Remove</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.row}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.name}>
            No track. MP3, M4A, OGG or WAV, up to {Math.round(MAX_AUDIO_BYTES / 1048576)} MB.
          </ThemedText>
          <Pressable onPress={pick} disabled={busy} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
            <Text style={styles.primaryText}>{busy ? 'Uploading…' : 'Add track'}</Text>
          </Pressable>
        </View>
      )}
      {!track ? (
        <Pressable onPress={() => setAttested((v) => !v)} style={styles.attest} accessibilityRole="checkbox" accessibilityState={{ checked: attested }}>
          <View style={[styles.box, attested && styles.boxOn]}>{attested ? <Text style={styles.tick}>✓</Text> : null}</View>
          <ThemedText type="small" themeColor="textSecondary" style={styles.attestText}>
            I hold the rights to play this track publicly, or it is licensed for it. Commercial songs from a streaming
            service are not.
          </ThemedText>
        </Pressable>
      ) : null}
      {error ? (
        <ThemedText type="small" style={styles.error}>
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
  label: { fontSize: FontSize.label },
  vip: { color: Palette.accent, fontWeight: Weight.semibold },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
  name: { flex: 1, minWidth: 140 },
  primary: { backgroundColor: Palette.accent, borderRadius: Radius.pill, paddingHorizontal: Spacing.three, paddingVertical: 6 },
  primaryText: { color: Palette.accentText, fontSize: FontSize.label, fontWeight: Weight.semibold },
  pressed: { opacity: 0.7 },
  attest: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  box: { width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: Palette.hairlineStrong, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  boxOn: { backgroundColor: Palette.accent, borderColor: Palette.accent },
  tick: { color: Palette.accentText, fontSize: 12, fontWeight: Weight.bold, lineHeight: 14 },
  attestText: { flex: 1, lineHeight: 18 },
  error: { color: Palette.warning },
});
