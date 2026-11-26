/**
 * "Use a free print" in a binder's print sheet (MIC-069). Shows only when the account has free
 * prints from inviting friends, and only on the web (printing and every purchase are web only).
 *
 * Two taps, like every spend in the sheet: the button, then "Use 1 free print" in the inline
 * confirm. The server writes the same unlock a purchase writes, so `onRedeemed` (the sheet's tier
 * refresh) turns the sheet into its normal download step.
 */
import { useRouter, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { fetchReferralSummary, redeemPrintCredit } from '@/data/referrals';
import { track } from '@/lib/analytics';
import { useAuth } from '@/store/auth';

export function FreePrintButton({ binderId, onRedeemed }: { binderId: string; onRedeemed: () => void }) {
  const { isSignedIn } = useAuth();
  const router = useRouter();
  const [left, setLeft] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSignedIn || Platform.OS !== 'web') return;
    let live = true;
    fetchReferralSummary()
      .then((s) => live && setLeft(s.creditsLeft))
      .catch(() => live && setLeft(0));
    return () => {
      live = false;
    };
  }, [isSignedIn]);

  if (!left || left < 1) return null;

  const redeem = async () => {
    setBusy(true);
    setError(null);
    try {
      await redeemPrintCredit(binderId);
      track('referral.print_redeemed', {});
      setLeft(left - 1);
      setConfirming(false);
      onRedeemed();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.box} testID="free-print">
      {confirming ? (
        <>
          <ThemedText type="smallBold">Use 1 free print on this binder?</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            It unlocks this binder as it is right now, the same as buying it, and that version is yours to download
            again forever.
          </ThemedText>
          <View style={styles.row}>
            <Pressable
              onPress={() => void redeem()}
              disabled={busy}
              testID="free-print-confirm"
              style={({ pressed }) => [styles.btn, (pressed || busy) && styles.dim]}>
              {busy ? <ActivityIndicator color={Palette.accentText} /> : <Text style={styles.btnText}>Use 1 free print</Text>}
            </Pressable>
            <Pressable
              onPress={() => setConfirming(false)}
              disabled={busy}
              style={({ pressed }) => [styles.btnQuiet, pressed && styles.dim]}>
              <Text style={styles.btnQuietText}>Not now</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <Pressable
          onPress={() => setConfirming(true)}
          testID="free-print-use"
          style={({ pressed }) => [styles.btn, pressed && styles.dim]}>
          <Text style={styles.btnText}>{`Use a free print (${left} left)`}</Text>
        </Pressable>
      )}
      {error ? (
        <ThemedText type="small" themeColor="textSecondary">
          {error}
        </ThemedText>
      ) : null}
      <ThemedText type="linkPrimary" style={styles.small} onPress={() => router.push('/invite' as Href)}>
        Free prints come from inviting friends ›
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: Spacing.two },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  btn: {
    minHeight: 44,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.control,
    backgroundColor: Palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { color: Palette.accentText, fontSize: FontSize.md, fontWeight: Weight.bold },
  btnQuiet: {
    minHeight: 44,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.control,
    borderWidth: 1,
    borderColor: Palette.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnQuietText: { color: Palette.ink, fontSize: FontSize.md, fontWeight: Weight.semibold },
  dim: { opacity: 0.7 },
  small: { fontSize: 13 },
});
