/**
 * Contest entry controls for one binder — lives in the ShareSheet, because entering requires a
 * PUBLIC binder and sharing is where that decision is made. Pick exactly one category (chips),
 * Enter/Withdraw; the page cap is guarded here with a human message (and enforced again by RLS).
 * Self-contained: loads the binder's current entry itself, renders nothing when the contest is
 * over or the backend is missing.
 */
import { useRouter, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { ConfirmDialog } from '@/components/binder/ConfirmDialog';
import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { CATEGORIES, CONTEST, contestPhase, type ContestCategory } from '@/data/contest';
import { enterContest, fetchEntry, withdrawEntry } from '@/data/contestRepo';
import type { DemoBinder } from '@/data/binderTypes';
import { isSupabaseConfigured } from '@/lib/env';

export function ContestEntrySection({
  binder,
  onEntryChange,
}: {
  binder: DemoBinder;
  /** Reports the entry state up (on load and after enter/withdraw) — the ShareSheet uses it to
   *  gate flipping pages public past the contest cap. */
  onEntryChange?: (category: ContestCategory | null) => void;
}) {
  const router = useRouter();
  const phase = contestPhase();
  // The cap counts PUBLIC pages — a binder of any size can enter by hiding pages down to the cap.
  const publicPages = binder.pages.filter((p) => p.isPublic ?? true).length;
  const overCap = publicPages > CONTEST.pageCap;

  const [entry, setEntryState] = useState<ContestCategory | null>(null);
  const [picked, setPicked] = useState<ContestCategory | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Withdrawing is destructive (it drops the entry and, on re-entry, resets the tie-breaker time),
  // so it goes through a confirm dialog rather than firing on the first tap.
  const [confirmingWithdraw, setConfirmingWithdraw] = useState(false);
  const setEntry = (c: ContestCategory | null) => {
    setEntryState(c);
    onEntryChange?.(c);
  };

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let stale = false;
    fetchEntry(binder.id)
      .then((e) => {
        if (stale) return;
        setEntryState(e?.category ?? null);
        onEntryChange?.(e?.category ?? null);
        setPicked(e?.category ?? null);
        setLoaded(true);
      })
      .catch(() => {
        if (!stale) setLoaded(true);
      });
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [binder.id]);

  if (!isSupabaseConfigured || phase === 'ended') return null;

  const submit = async () => {
    if (!picked || busy) return;
    setBusy(true);
    setError(null);
    try {
      await enterContest(binder.id, picked);
      setEntry(picked);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await withdrawEntry(binder.id);
      setEntry(null);
      setPicked(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.box}>
      <View style={styles.headRow}>
        <ThemedText type="smallBold">🏆 {CONTEST.name}</ThemedText>
        <Pressable onPress={() => router.push('/contest' as Href)} hitSlop={6}>
          <ThemedText type="small" style={styles.rulesLink}>
            Prizes & rules ›
          </ThemedText>
        </Pressable>
      </View>

      {phase === 'upcoming' ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
          Entries open soon. {CONTEST.headline}
        </ThemedText>
      ) : overCap && !entry ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
          Contest entries can show at most {CONTEST.pageCap} public pages; this binder has{' '}
          {publicPages}. Hide pages (tap them above) down to {CONTEST.pageCap} to enter. Binders of
          any size can enter this way.
        </ThemedText>
      ) : !loaded ? (
        <ActivityIndicator />
      ) : (
        <>
          {entry ? (
            // Entered: the category is FINAL (no update path server-side). Show it locked;
            // withdrawing is the only exit — and re-entering resets your entry time.
            <>
              <View style={styles.chips}>
                <View style={[styles.chip, styles.chipActive]}>
                  <Text style={[styles.chipText, styles.chipTextActive]}>
                    ✓ {CATEGORIES.find((c) => c.slug === entry)?.label ?? entry}
                  </Text>
                </View>
              </View>
              <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
                Entered! Category choice is final. Withdrawing removes the entry (re-entering
                later resets your entry time).
              </ThemedText>
              <View style={styles.actions}>
                <Pressable
                  onPress={() => setConfirmingWithdraw(true)}
                  disabled={busy}
                  style={({ pressed }) => [styles.withdrawBtn, (busy || pressed) && styles.dim]}>
                  <Text style={styles.withdrawText}>Withdraw entry</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
                Enter this binder in exactly one category, and community votes pick the winners.
                Choose carefully: the category can’t be changed after entering.
              </ThemedText>
              <View style={styles.chips}>
                {CATEGORIES.map((c) => {
                  const active = picked === c.slug;
                  return (
                    <Pressable
                      key={c.slug}
                      onPress={() => setPicked(c.slug)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active }}
                      style={[styles.chip, active && styles.chipActive]}
                      hitSlop={2}>
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {c.flagship ? '★ ' : ''}
                        {c.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={styles.actions}>
                <Pressable
                  onPress={submit}
                  disabled={!picked || busy}
                  style={({ pressed }) => [styles.enterBtn, (!picked || busy || pressed) && styles.dim]}>
                  <Text style={styles.enterText}>Enter contest</Text>
                </Pressable>
              </View>
            </>
          )}
          {error ? (
            <ThemedText type="small" style={styles.error}>
              {error}
            </ThemedText>
          ) : null}
        </>
      )}

      <ConfirmDialog
        spec={
          confirmingWithdraw
            ? {
                title: 'Withdraw your entry?',
                message:
                  'This removes this binder from the contest. You can re-enter until entries close, but re-entering resets your entry time (the final tie-breaker).',
                confirmLabel: 'Withdraw entry',
                destructive: true,
                onConfirm: withdraw,
              }
            : null
        }
        onClose={() => setConfirmingWithdraw(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Palette.accent,
    backgroundColor: Palette.selectionSoft,
  },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  rulesLink: { color: Palette.accent, fontWeight: Weight.semibold },
  hint: { lineHeight: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
    backgroundColor: Palette.surface,
  },
  chipActive: { borderColor: Palette.accent, backgroundColor: Palette.accent },
  chipText: { fontSize: 12, fontWeight: Weight.semibold, color: Palette.ink2 },
  chipTextActive: { color: Palette.accentText },
  actions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  enterBtn: {
    backgroundColor: Palette.accent,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  enterText: { color: Palette.accentText, fontSize: 13, fontWeight: Weight.bold },
  withdrawBtn: {
    backgroundColor: Palette.danger,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  withdrawText: { color: Palette.accentText, fontSize: 13, fontWeight: Weight.bold },
  dim: { opacity: 0.55 },
  error: { color: Palette.dangerAlt, lineHeight: 18 },
});
