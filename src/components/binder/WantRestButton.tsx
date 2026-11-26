/**
 * MIC-041: "Mark every card I don't own as WANT" (owner, 2026-11-25), a row in a binder's settings.
 * Owner review 2026-11-26: a compact control, no explanatory copy, and, since it is a big action,
 * a short confirm pop-up that states the count: "Mark 37 cards as WANT?" with "Mark all" and
 * "Cancel". Signed-in accounts only (a guest has no list to keep).
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DialogCard } from '@/components/ui/DialogCard';
import { toggleChip } from '@/constants/ui';
import { unownedToWant } from '@/data/collectionLists';
import { useCollectionLists } from '@/hooks/use-collection-lists';
import { useAuth } from '@/store/auth';

// Owner review 2026-11-26: inline with Owned and Prices, labelled just "Mark all" and a heart.
export const WANT_REST_LABEL = 'Mark all ♥';

/** The chip and its confirm pop-up, with no data access (the review preview draws it). */
export function WantRestView({
  count,
  asking,
  busy,
  done,
  onStart,
  onConfirm,
  onCancel,
}: {
  count: number;
  asking: boolean;
  busy: boolean;
  done: string | null;
  onStart: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <Pressable
        onPress={onStart}
        disabled={count === 0}
        accessibilityRole="button"
        accessibilityLabel="Mark every card I don't own as WANT"
        testID="want-rest-start"
        style={[toggleChip.base, count === 0 && styles.off]}>
        <Text style={toggleChip.text}>{WANT_REST_LABEL}</Text>
      </Pressable>
      {done ? <Text style={styles.done}>{done}</Text> : null}
      {asking ? (
        <DialogCard title={`Mark ${count} ${count === 1 ? 'card' : 'cards'} as WANT?`} onClose={onCancel} maxWidth={360}>
          <View style={styles.row} testID="want-rest-confirm-dialog">
            <Pressable onPress={onCancel} accessibilityRole="button" style={[toggleChip.base, styles.chip]}>
              <Text style={[toggleChip.text, styles.text]}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              disabled={busy}
              accessibilityRole="button"
              testID="want-rest-confirm"
              style={[toggleChip.base, toggleChip.active, styles.chip]}>
              <Text style={[toggleChip.text, toggleChip.textActive, styles.text]}>Mark all</Text>
            </Pressable>
          </View>
        </DialogCard>
      ) : null}
    </>
  );
}

export function WantRestButton({ cardIds, owned }: { cardIds: string[]; owned: ReadonlySet<string> }) {
  const { user } = useAuth();
  const lists = useCollectionLists();
  const [asking, setAsking] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!user || user.is_anonymous || !lists.ready) return null;

  const toAdd = unownedToWant(cardIds, owned, lists.wantedIds);
  return (
    <WantRestView
      count={toAdd.length}
      asking={asking}
      busy={busy}
      done={done}
      onStart={() => {
        setDone(null);
        setAsking(true);
      }}
      onCancel={() => setAsking(false)}
      onConfirm={async () => {
        setBusy(true);
        try {
          await lists.addWant(toAdd);
          setDone(`${toAdd.length} added`);
        } catch (e) {
          setDone(e instanceof Error ? e.message : 'That did not save');
        } finally {
          setBusy(false);
          setAsking(false);
        }
      }}
    />
  );
}

const styles = StyleSheet.create({
  chip: { paddingHorizontal: 12, alignSelf: 'flex-start' },
  text: { fontSize: 13 },
  off: { opacity: 0.4 },
  done: { fontSize: 13, color: '#2f7fc1', fontWeight: '600' },
  row: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
});
