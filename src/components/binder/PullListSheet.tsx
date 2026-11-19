/**
 * TCG-035 "Pull these cards": turns a binder of cards you own into a BiBo pull list.
 *
 * Michi picks one owned copy per pocket (data/pullList.ts) and writes the list (data/pullListRepo.ts).
 * The checklist, the commit and the undo are BiBo's. Nothing in the collection moves from here.
 *
 * Redesign rules (MIC-017): one centred card, 48 px buttons, 13 px floor, stacked rows.
 */
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontSize, Palette, Radii, Radius, Spacing, Weight } from '@/constants/theme';
import type { DemoBinder } from '@/data/binderTypes';
import { claimedByEntry } from '@/data/ownedCopies';
import { planPull, pocketsOf, pullSummary, type CopySpot, type PullPlan } from '@/data/pullList';
import { BIBO_PULL_LINK_LIVE, biboPullUrl, fetchCopyWhere, homeCollection, savePullList, type CopyWhere } from '@/data/pullListRepo';
import { useOwnedCopies } from '@/hooks/use-owned-copies';
import { track } from '@/lib/analytics';
import { useAuth } from '@/store/auth';
import { useBinders } from '@/store/binders';

const TINT = '#e8effd';
const TINT_INK = '#1d4ed8';
const TINT_EDGE = '#9db5ef';

const SPOT_LABEL: Record<'loose' | 'piles' | 'binder', string> = {
  loose: 'Loose cards',
  piles: 'Stacks and boxes',
  binder: 'Other binders',
};
const group = (s: CopySpot) => (s === 'loose' ? 'loose' : s === 'binder' ? 'binder' : 'piles');

export function PullListSheet({ binder, onClose }: { binder: DemoBinder; onClose: () => void }) {
  const store = useBinders();
  const { user } = useAuth();
  const entries = useOwnedCopies();
  const [where, setWhere] = useState<Map<string, CopyWhere> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ listId: string; kept: number; added: number } | null>(null);

  const entryIds = useMemo(() => (entries ?? []).map((e) => e.entryId), [entries]);
  useEffect(() => {
    if (!entries) return;
    let live = true;
    fetchCopyWhere(entryIds)
      .then((m) => live && setWhere(m))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [entries, entryIds]);

  const plan = useMemo(() => {
    if (!entries || !where) return null;
    const claimed = claimedByEntry(store.userBinders.flatMap((b) => b.pages.flatMap((p) => p.slots)));
    return planPull(pocketsOf(binder.pages), entries, claimed, (id) => where.get(id)?.spot ?? 'loose');
  }, [entries, where, store.userBinders, binder.pages]);

  const counts = useMemo(() => {
    const c: PullCounts = { loose: 0, piles: 0, binder: 0 };
    for (const i of plan?.items ?? []) c[group(i.spot)]++;
    return c;
  }, [plan]);

  const make = async () => {
    if (!plan || !where || !user || plan.items.length === 0) return;
    const collectionId = homeCollection(plan.items, where);
    if (!collectionId) return setError('Could not tell which collection these cards are in.');
    setBusy(true);
    setError(null);
    try {
      const dims = new Map(binder.pages.map((p, i) => [i + 1, { rows: p.rows, cols: p.cols }]));
      const r = await savePullList({ userId: user.id, binderId: binder.id, items: plan.items, dims, collectionId });
      setSaved(r);
      track('pull_list.made', { cards: plan.items.length, kept: r.kept, short: plan.short });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return <PullListView title={binder.title} plan={plan} counts={counts} busy={busy} saved={saved} error={error} onMake={make} onClose={onClose} />;
}

export type PullCounts = { loose: number; piles: number; binder: number };

/**
 * The sheet itself, with no data access: the container above feeds it. Kept apart so the screens
 * can be checked (and screenshotted) with demo data and no account.
 */
export function PullListView({
  title,
  plan,
  counts,
  busy,
  saved,
  error,
  onMake,
  onClose,
}: {
  title: string;
  plan: PullPlan | null;
  counts: PullCounts;
  busy: boolean;
  saved: { listId: string; kept: number; added: number } | null;
  error: string | null;
  onMake: () => void;
  onClose: () => void;
}) {
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.cardWrap}>
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold" style={styles.title}>
              Pull these cards
            </ThemedText>
            <Text style={styles.body} numberOfLines={2}>
              {title}
            </Text>

            {!plan && !error ? (
              <View style={styles.center}>
                <ActivityIndicator color={TINT_INK} />
                <Text style={styles.muted}>Finding your copies…</Text>
              </View>
            ) : null}

            {plan && !saved ? (
              <>
                <Text style={styles.body}>{pullSummary(plan)}</Text>
                {plan.items.length > 0 ? (
                  <View style={styles.list}>
                    {(Object.keys(SPOT_LABEL) as (keyof typeof SPOT_LABEL)[])
                      .filter((k) => counts[k] > 0)
                      .map((k) => (
                        <View key={k} style={styles.countRow}>
                          <Text style={styles.countLabel}>{SPOT_LABEL[k]}</Text>
                          <Text style={styles.countNum}>{counts[k]}</Text>
                        </View>
                      ))}
                  </View>
                ) : null}
                <Text style={styles.muted}>
                  BiBo lists every card with its exact spot, in walking order. Check each one off as you find it. Nothing moves in your
                  collection until you tap &quot;Commit&quot; in BiBo.
                </Text>
                <Pressable
                  onPress={onMake}
                  disabled={busy || plan.items.length === 0}
                  accessibilityRole="button"
                  accessibilityLabel="Make the pull list"
                  style={({ pressed }) => [styles.primary, (busy || plan.items.length === 0) && styles.disabled, pressed && styles.pressed]}>
                  <Text style={styles.primaryText}>{busy ? 'Saving…' : 'Make the pull list'}</Text>
                </Pressable>
              </>
            ) : null}

            {saved ? (
              <>
                <Text style={styles.body}>
                  {saved.kept > 0
                    ? `Pull list updated. ${saved.kept} already checked off, ${saved.added} added.`
                    : `Pull list ready: ${saved.added} ${saved.added === 1 ? 'card' : 'cards'}.`}
                </Text>
                {BIBO_PULL_LINK_LIVE ? (
                  <Pressable
                    onPress={() => Linking.openURL(biboPullUrl(saved.listId))}
                    accessibilityRole="link"
                    accessibilityLabel="Open in BiBo"
                    style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
                    <Text style={styles.primaryText}>Open in BiBo</Text>
                  </Pressable>
                ) : (
                  <Text style={styles.muted}>Open BiBo on your phone to check them off. The list is waiting in your collection.</Text>
                )}
              </>
            ) : null}

            {error ? <Text style={styles.error}>Could not make the pull list. {error}</Text> : null}

            <Pressable onPress={onClose} style={styles.cancel} hitSlop={6} accessibilityRole="button">
              <Text style={styles.cancelText}>{saved ? 'Done' : 'Cancel'}</Text>
            </Pressable>
          </ThemedView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}


const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: Palette.scrim45, alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  cardWrap: { width: '100%', maxWidth: 380 },
  card: { borderRadius: Radii.page, padding: Spacing.three, gap: Spacing.two },
  title: { fontSize: FontSize.control },
  body: { fontSize: FontSize.body, color: Palette.ink, lineHeight: 20 },
  muted: { fontSize: FontSize.body, color: Palette.muted, lineHeight: 20 },
  center: { alignItems: 'center', gap: 8, paddingVertical: Spacing.three },
  list: { gap: 6 },
  countRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 44, paddingHorizontal: 14, borderRadius: Radius.control, backgroundColor: '#e9e7e3' },
  countLabel: { fontSize: FontSize.control, fontWeight: Weight.semibold, color: Palette.ink },
  countNum: { fontSize: FontSize.control, fontWeight: Weight.bold, color: Palette.ink },
  primary: { minHeight: 48, borderRadius: Radius.control, borderWidth: 1, borderColor: TINT_EDGE, backgroundColor: TINT, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  primaryText: { fontSize: FontSize.control, fontWeight: Weight.semibold, color: TINT_INK },
  disabled: { opacity: 0.5 },
  error: { fontSize: FontSize.body, color: '#b42318' },
  cancel: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: FontSize.control, fontWeight: Weight.semibold, color: Palette.muted },
  pressed: { opacity: 0.7 },
});
