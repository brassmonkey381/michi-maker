/**
 * Owner-only "who liked this binder" list. Opened from the likes badge on the owner's own binder;
 * RLS lets the owner read every like row on their binder. A liker whose profile is private shows
 * as "Someone" (their name is withheld). Public viewers never see this — they only see the count.
 */
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontSize, Palette, Spacing } from '@/constants/theme';
import { sheet } from '@/constants/ui';
import { fetchLikers, type Liker } from '@/data/binderRepo';

/** "3 days ago" / "2 hours ago" / "just now" from an ISO timestamp. */
function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? '' : 's'} ago`;
}

export function LikersSheet({
  visible,
  binderId,
  onClose,
}: {
  visible: boolean;
  binderId: string;
  onClose: () => void;
}) {
  const [likers, setLikers] = useState<Liker[] | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect -- reset to the loading state on open, then resolve */
  useEffect(() => {
    if (!visible) return;
    let active = true;
    setLikers(null);
    fetchLikers(binderId)
      .then((rows) => {
        if (active) setLikers(rows);
      })
      .catch(() => {
        if (active) setLikers([]);
      });
    return () => {
      active = false;
    };
  }, [visible, binderId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={sheet.dialogBackdrop} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.cardWrap}>
          <ThemedView type="backgroundElement" style={[sheet.dialogCard, styles.cardMax]}>
            <View style={styles.header}>
              <ThemedText type="subtitle" style={styles.title}>
                {likers ? `${likers.length} ${likers.length === 1 ? 'like' : 'likes'}` : 'Likes'}
              </ThemedText>
              <Pressable onPress={onClose} hitSlop={8}>
                <ThemedText type="link" themeColor="textSecondary">
                  Close
                </ThemedText>
              </Pressable>
            </View>

            {likers === null ? (
              <View style={styles.center}>
                <ActivityIndicator />
              </View>
            ) : likers.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
                No likes yet. Share your binder to start collecting them.
              </ThemedText>
            ) : (
              <View style={styles.list}>
                {likers.map((l) => (
                  <View key={l.userId} style={styles.row}>
                    <ThemedText type="smallBold" numberOfLines={1} style={styles.name}>
                      {l.username ? `@${l.username}` : 'Someone'}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {timeAgo(l.createdAt)}
                    </ThemedText>
                  </View>
                ))}
              </View>
            )}
          </ThemedView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  cardWrap: { width: '100%', maxWidth: 400 },
  cardMax: { maxHeight: '80%' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: FontSize.h2, lineHeight: 26 },
  center: { paddingVertical: Spacing.five, alignItems: 'center' },
  empty: { lineHeight: 20 },
  list: { gap: Spacing.one },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Palette.hairline,
  },
  name: { flex: 1 },
});
