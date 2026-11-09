/**
 * STUDIO › IMAGES (MIC-029). The light safety check's review list, beside Content reports: every
 * custom image it flagged (suggestive, explicit, refused) or could not check, with the model's
 * label and reason. A person decides: Approve (shown to visitors), Remove (cleared and, when the
 * file is ours, deleted: permanent), or Remove and take down the owner's public binders. Nothing
 * here happens on its own; the check only holds images back.
 *
 * "Possible minor" marks an image the model said sexualises someone who appears under 18. That one
 * is not just removed: it follows the NCMEC rule (preserve, report), which stays a human step.
 */
import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Dialog } from 'tcgscan-ui';

import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { decideImageReview, listOpenImageReviews, type ImageReview } from '@/data/imageReviewRepo';

const LABEL: Record<string, string> = {
  explicit: 'Explicit',
  suggestive: 'Suggestive',
  refused: 'Model declined to look',
  unchecked: 'Could not check',
};

export function ImagesPanel() {
  const router = useRouter();
  const [items, setItems] = useState<ImageReview[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<{ item: ImageReview; takedown: boolean } | null>(null);

  const load = useCallback(() => {
    listOpenImageReviews()
      .then(setItems)
      .catch((e) => setError((e as Error).message));
  }, []);
  useEffect(load, [load]);

  const act = async (item: ImageReview, decision: 'approved' | 'removed', takedown = false) => {
    setBusy(item.id);
    setError(null);
    try {
      await decideImageReview(item.id, decision, takedown);
      setItems((list) => (list ?? []).filter((x) => x.id !== item.id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (items === null && !error) {
    return (
      <View style={[styles.panel, styles.loading]}>
        <ActivityIndicator />
      </View>
    );
  }
  return (
    <View style={styles.panel} testID="studio-images">
      <View style={styles.headerRow}>
        <ThemedText type="smallBold">Images to review</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {items?.length ?? 0} waiting
        </ThemedText>
      </View>
      {error ? <ThemedText type="small" style={styles.error}>{error}</ThemedText> : null}
      {items && items.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">Nothing waiting. Flagged images appear here, hidden from visitors until you decide.</ThemedText>
      ) : null}
      {(items ?? []).map((item) => (
        <View key={item.id} style={styles.row}>
          <Image source={{ uri: item.imageUrl }} style={styles.thumb} contentFit="cover" />
          <View style={styles.rowText}>
            <ThemedText type="smallBold">
              {LABEL[item.label ?? 'unchecked'] ?? item.label}
              {item.minorConcern ? '  ·  POSSIBLE MINOR: preserve and report (NCMEC), do not just remove' : ''}
            </ThemedText>
            {item.reason ? <ThemedText type="small" themeColor="textSecondary">{item.reason}</ThemedText> : null}
            <Pressable onPress={() => router.push(`/binder/${item.binderId}` as Href)} accessibilityRole="link">
              <ThemedText type="small" style={styles.link}>Open the binder ({item.binderId.slice(0, 8)}), owner {item.ownerId.slice(0, 8)}</ThemedText>
            </Pressable>
            <View style={styles.actions}>
              <Pressable disabled={busy === item.id} onPress={() => void act(item, 'approved')} style={styles.btn} accessibilityRole="button">
                <ThemedText type="smallBold">Approve</ThemedText>
              </Pressable>
              <Pressable disabled={busy === item.id} onPress={() => setConfirm({ item, takedown: false })} style={[styles.btn, styles.btnDanger]} accessibilityRole="button">
                <ThemedText type="smallBold" style={styles.danger}>Remove</ThemedText>
              </Pressable>
              <Pressable disabled={busy === item.id} onPress={() => setConfirm({ item, takedown: true })} style={[styles.btn, styles.btnDanger]} accessibilityRole="button">
                <ThemedText type="smallBold" style={styles.danger}>Remove + take down owner’s binders</ThemedText>
              </Pressable>
              {busy === item.id ? <ActivityIndicator size="small" /> : null}
            </View>
          </View>
        </View>
      ))}
      <Dialog
        visible={!!confirm}
        title={confirm?.takedown ? 'Remove this image and take down the owner’s public binders?' : 'Remove this image?'}
        body={
          confirm?.takedown
            ? 'The image is cleared from its pocket and its file deleted from storage, which cannot be undone. Every public binder of this owner is taken down (reversible from reports).'
            : 'The image is cleared from its pocket and its file deleted from storage. This cannot be undone.'
        }
        cancel={{ label: 'Keep it', onPress: () => setConfirm(null) }}
        confirm={{
          label: 'Remove',
          tone: 'danger',
          onPress: () => {
            const c = confirm;
            setConfirm(null);
            if (c) void act(c.item, 'removed', c.takedown);
          },
        }}
        onClose={() => setConfirm(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    marginHorizontal: Spacing.four,
    marginBottom: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
    backgroundColor: Palette.panel,
  },
  loading: { alignItems: 'center', paddingVertical: Spacing.three },
  headerRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.three },
  thumb: { width: 96, height: 128, borderRadius: Radius.control, backgroundColor: Palette.hairline },
  rowText: { flex: 1, gap: 4, minWidth: 0 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, alignItems: 'center', marginTop: Spacing.one },
  btn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: Spacing.three, borderRadius: Radius.control, borderWidth: 1, borderColor: Palette.hairlineStrong },
  btnDanger: { borderColor: Palette.danger },
  danger: { color: Palette.danger },
  link: { color: Palette.link },
  error: { color: Palette.danger },
});
