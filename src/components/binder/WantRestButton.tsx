/**
 * MIC-041: "Mark every card I don't own as WANT" (owner, 2026-11-25), in a binder's settings.
 * Two taps, so a stray one never fills the Want list: the first says how many cards it would add,
 * the second adds them. Signed-in accounts only (a guest has no list to keep).
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { toggleChip } from '@/constants/ui';
import { unownedToWant } from '@/data/collectionLists';
import { useCollectionLists } from '@/hooks/use-collection-lists';
import { useAuth } from '@/store/auth';

export function WantRestButton({ cardIds, owned }: { cardIds: string[]; owned: ReadonlySet<string> }) {
  const { user } = useAuth();
  const lists = useCollectionLists();
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!user || user.is_anonymous || !lists.ready) return null;

  const toAdd = unownedToWant(cardIds, owned, lists.wantedIds);
  const go = async () => {
    setBusy(true);
    try {
      await lists.addWant(toAdd);
      setNote(`${toAdd.length} ${toAdd.length === 1 ? 'card' : 'cards'} added to your Want list`);
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'That did not save');
    } finally {
      setBusy(false);
      setAsking(false);
    }
  };

  return (
    <View style={styles.wrap} testID="want-rest">
      {asking ? (
        <View style={styles.row}>
          <Pressable
            onPress={go}
            disabled={busy}
            accessibilityRole="button"
            testID="want-rest-confirm"
            style={[toggleChip.base, toggleChip.active]}>
            <Text style={[toggleChip.text, toggleChip.textActive]}>{`Add ${toAdd.length} to WANT`}</Text>
          </Pressable>
          <Pressable onPress={() => setAsking(false)} accessibilityRole="button" style={toggleChip.base}>
            <Text style={toggleChip.text}>Cancel</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          onPress={() => {
            setNote(toAdd.length ? null : 'Every card here is already owned or on your Want list');
            if (toAdd.length) setAsking(true);
          }}
          accessibilityRole="button"
          testID="want-rest-start"
          style={toggleChip.base}>
          <Text style={toggleChip.text}>{'♥ Mark every card I don’t own as WANT'}</Text>
        </Pressable>
      )}
      {note ? (
        <ThemedText type="small" themeColor="textSecondary">
          {note}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
