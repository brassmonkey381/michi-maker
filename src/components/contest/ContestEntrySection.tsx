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

import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { CATEGORIES, CONTEST, contestPhase, type ContestCategory } from '@/data/contest';
import { enterContest, fetchEntry, withdrawEntry } from '@/data/contestRepo';
import type { DemoBinder } from '@/data/binderTypes';
import { isSupabaseConfigured } from '@/lib/env';

export function ContestEntrySection({ binder }: { binder: DemoBinder }) {
  const router = useRouter();
  const phase = contestPhase();
  const overCap = binder.pages.length > CONTEST.pageCap;

  const [entry, setEntry] = useState<ContestCategory | null>(null);
  const [picked, setPicked] = useState<ContestCategory | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let stale = false;
    fetchEntry(binder.id)
      .then((e) => {
        if (stale) return;
        setEntry(e?.category ?? null);
        setPicked(e?.category ?? null);
        setLoaded(true);
      })
      .catch(() => {
        if (!stale) setLoaded(true);
      });
    return () => {
      stale = true;
    };
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
          Entries open soon — {CONTEST.headline}
        </ThemedText>
      ) : overCap ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
          Contest entries are capped at {CONTEST.pageCap} pages; this binder has{' '}
          {binder.pages.length}. Trim it to {CONTEST.pageCap} pages to enter.
        </ThemedText>
      ) : !loaded ? (
        <ActivityIndicator />
      ) : (
        <>
          <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
            {entry
              ? 'Entered! You can switch categories or withdraw until the contest ends.'
              : 'Enter this binder in exactly one category — community votes pick the winners.'}
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
              disabled={!picked || picked === entry || busy}
              style={({ pressed }) => [
                styles.enterBtn,
                (!picked || picked === entry || busy || pressed) && styles.dim,
              ]}>
              <Text style={styles.enterText}>
                {entry ? (picked === entry ? 'Entered ✓' : 'Switch category') : 'Enter contest'}
              </Text>
            </Pressable>
            {entry ? (
              <Pressable onPress={withdraw} disabled={busy} hitSlop={6} style={styles.withdraw}>
                <ThemedText type="small" themeColor="textSecondary">
                  Withdraw
                </ThemedText>
              </Pressable>
            ) : null}
          </View>
          {error ? (
            <ThemedText type="small" style={styles.error}>
              {error}
            </ThemedText>
          ) : null}
        </>
      )}
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
  withdraw: { paddingVertical: Spacing.one },
  dim: { opacity: 0.55 },
  error: { color: Palette.dangerAlt, lineHeight: 18 },
});
