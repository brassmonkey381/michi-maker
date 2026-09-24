/**
 * The two offers beside the plans table: FOUNDER (lifetime PRO, one payment, 100 of them) and the
 * TWO-APP BUNDLE (PRO here and in TCGScan on one membership). tcgscan-app docs/TIER-REWORK.md.
 *
 * THE FOUNDER COUNTER IS A COUNT OF REAL MEMBERSHIPS. `michi_founder_count()` counts ledger rows
 * and nothing is added to it here: no floor, no head start. If the number cannot be read (the
 * function is not deployed yet, or the network failed) the card simply shows no counter; it never
 * falls back to a guess. At 100 the button goes and the card says so; stripe-checkout refuses a
 * 101st on its own, so the page and the server agree without trusting each other.
 *
 * THE BUNDLE SAYS WHERE THE APPS ARE, plainly: TCGScan runs in the browser today, its iPhone app is
 * in App Store review, Android is planned. Nobody should buy expecting an app that is not in a
 * store yet.
 *
 * While checkout is closed (CHECKOUT_OPEN off) the cards still show and the buttons say so: a
 * price page with a hole in it reads as broken.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { startCheckout } from '@/data/checkout';
import { CHECKOUT_OPEN } from '@/data/subscriptions';
import { useTier } from '@/hooks/use-tier';
import { useTrial } from '@/hooks/use-trial';
import { track } from '@/lib/analytics';
import { SHOW_CROSS_APP } from '@/lib/crossApp';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/store/auth';

const FOUNDER_LIMIT = 100;
const FOUNDER_KEY = 'michi_pro_founder';
const BUNDLE_YEARLY_KEY = 'bundle_pro_yearly';
const BUNDLE_MONTHLY_KEY = 'bundle_pro_monthly';

export function OfferCards() {
  const { isSignedIn } = useAuth();
  const { isPaid } = useTier();
  const trial = useTrial();
  const [taken, setTaken] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let on = true;
    // Schema-agnostic, the way data/trial.ts reaches its RPCs: michi_founder_count is not in the
    // generated Database types until the migration is applied and the types are regenerated.
    void (supabase as unknown as SupabaseClient).rpc('michi_founder_count').then(({ data, error }) => {
      if (on && !error && typeof data === 'number') setTaken(data);
    });
    return () => {
      on = false;
    };
  }, []);

  // A paying member has nothing to buy here; someone on the free trial still does.
  if (isPaid && trial.state !== 'active') return null;

  const soldOut = taken !== null && taken >= FOUNDER_LIMIT;

  const buy = async (lookupKey: string) => {
    if (busy) return;
    setNote(null);
    if (!CHECKOUT_OPEN) return setNote('Checkout opens shortly. Nothing has been charged.');
    if (!isSignedIn) return setNote('Sign in first, so the membership lands on your account.');
    setBusy(lookupKey);
    try {
      // startCheckout emits offer.checkout_start / offer.checkout_failed itself.
      await startCheckout(lookupKey, { surface: 'offer_cards' }); // navigates away on success
    } catch (e) {
      setNote((e as Error).message || 'Checkout could not be started. Nothing was charged.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>FOUNDER</Text>
        <ThemedText type="subtitle">
          $119.99 <ThemedText type="small" themeColor="textSecondary">once</ThemedText>
        </ThemedText>
        <ThemedText type="small">PRO for life. One payment, no renewals.</ThemedText>
        {taken !== null ? (
          <ThemedText type="smallBold" accessibilityLabel={`${taken} of ${FOUNDER_LIMIT} Founder memberships taken`}>
            {taken} of {FOUNDER_LIMIT} taken
          </ThemedText>
        ) : null}
        {soldOut ? (
          <ThemedText type="small" themeColor="textSecondary">All {FOUNDER_LIMIT} Founder memberships are taken.</ThemedText>
        ) : (
          <BuyButton lookupKey={FOUNDER_KEY} label="Become a Founder" busy={busy} onBuy={buy} />
        )}
      </View>

      {SHOW_CROSS_APP ? (
      <View style={styles.card}>
        <Text style={styles.eyebrow}>BOTH APPS</Text>
        <ThemedText type="subtitle">
          $74.99 <ThemedText type="small" themeColor="textSecondary">a year, or $8.99 a month</ThemedText>
        </ThemedText>
        <ThemedText type="small">PRO in michi-maker and in TCGScan on one membership.</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          TCGScan works in your browser today. Its iPhone app is in App Store review and Android is planned. Your
          membership covers each of them the day it arrives.
        </ThemedText>
        <View style={styles.btnRow}>
          <BuyButton lookupKey={BUNDLE_YEARLY_KEY} label="Yearly" busy={busy} onBuy={buy} />
          <BuyButton lookupKey={BUNDLE_MONTHLY_KEY} label="Monthly" busy={busy} onBuy={buy} />
        </View>
      </View>
      ) : null}

      {note ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
          {note}
        </ThemedText>
      ) : null}
    </View>
  );
}

function BuyButton({
  lookupKey,
  label,
  busy,
  onBuy,
}: {
  lookupKey: string;
  label: string;
  /** The lookup key whose checkout is opening, or null. Every button locks while one is. */
  busy: string | null;
  onBuy: (lookupKey: string) => Promise<void>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: busy !== null, busy: busy === lookupKey }}
      disabled={busy !== null}
      onPress={() => void onBuy(lookupKey)}
      style={({ pressed }) => [styles.btn, (pressed || busy !== null) && styles.dim]}>
      <Text style={styles.btnText}>
        {busy === lookupKey ? 'Opening checkout…' : CHECKOUT_OPEN ? label : `${label} (opens shortly)`}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three, paddingVertical: Spacing.three },
  card: {
    flexGrow: 1,
    flexBasis: 280,
    gap: Spacing.two,
    padding: Spacing.four,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
  },
  eyebrow: { color: Palette.accent, fontSize: FontSize.sm, fontWeight: Weight.semibold, letterSpacing: 1 },
  btnRow: { flexDirection: 'row', gap: Spacing.two },
  btn: {
    flexGrow: 1,
    backgroundColor: Palette.accent,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
  },
  btnText: { color: Palette.accentText, fontSize: FontSize.md, fontWeight: Weight.semibold },
  note: { flexBasis: '100%' },
  dim: { opacity: 0.6 },
});
