/**
 * `/invite`: refer a friend, paid in free PDF prints (MIC-069, owner 2026-11-25).
 *
 * Your link, a "Copy link" and a "Share" button, how many friends started the free trial and how
 * many paid, and the free prints you have left. Prints are spent from a binder's print sheet
 * ("Use a free print"), so this page only points there.
 *
 * Guests see one panel: an invite link needs a real account (a guest's account is thrown away
 * with its session).
 */
import { useRouter, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatePanel } from 'tcgscan-ui';

import { AuthSheet } from '@/components/auth/AuthSheet';
import { PageShell } from '@/components/layout/PageShell';
import { ThemedText } from '@/components/themed-text';
import { FontSize, MaxContentWidth, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import {
  ensureReferralCode,
  fetchReferralSummary,
  inviteUrl,
  referralCounts,
  type ReferralSummary,
} from '@/data/referrals';
import { track } from '@/lib/analytics';
import { useAuth } from '@/store/auth';

const TITLE = 'Invite Friends';
const DESCRIPTION = 'Share your michi-maker link and earn free PDF prints of your binders.';

export default function InvitePage() {
  const { isSignedIn } = useAuth();
  const router = useRouter();
  const [authOpen, setAuthOpen] = useState(false);
  const [summary, setSummary] = useState<ReferralSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isSignedIn) return;
    let live = true;
    (async () => {
      try {
        await ensureReferralCode();
        const s = await fetchReferralSummary();
        if (live) setSummary(s);
      } catch (e) {
        if (live) setError((e as Error).message);
      }
    })();
    return () => {
      live = false;
    };
  }, [isSignedIn]);

  if (!isSignedIn) {
    return (
      <PageShell title={TITLE} description={DESCRIPTION}>
        <StatePanel
          title="Invite friends, earn free prints"
          body="Create an account to get your own invite link. Each friend who starts the free trial through it earns you a free PDF print of a binder."
          primary={{ label: 'Create account', onPress: () => setAuthOpen(true) }}
          secondary={{ label: 'See plans', onPress: () => router.push('/plans' as Href) }}
        />
        <AuthSheet visible={authOpen} onClose={() => setAuthOpen(false)} />
      </PageShell>
    );
  }

  const link = summary?.code ? inviteUrl(summary.code) : null;
  const counts = referralCounts(summary?.invites ?? []);
  const canShare = Platform.OS === 'web' && typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      track('referral.link_copied', {});
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Copy did not work here. Press and hold the link to copy it.');
    }
  };
  const share = async () => {
    if (!link) return;
    try {
      await navigator.share({ title: 'michi-maker', text: 'Make binder layouts with me on michi-maker', url: link });
      track('referral.link_shared', {});
    } catch {
      // Closing the share sheet is not an error.
    }
  };

  return (
    <PageShell
      title={TITLE}
      description={DESCRIPTION}
      heading="Invite friends, earn free prints"
      lede="Share your link. When a friend starts the free trial, you get a free PDF print. If they stay on and pay, you each get one more.">
      <View style={styles.prose}>
        {error ? (
          <ThemedText type="small" themeColor="textSecondary">
            {error}
          </ThemedText>
        ) : null}
        {!summary && !error ? (
          <View style={styles.center}>
            <ActivityIndicator />
          </View>
        ) : null}

        {link ? (
          <View style={styles.card} testID="invite-link-card">
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.label}>
              Your invite link
            </ThemedText>
            <ThemedText type="default" selectable style={styles.link} testID="invite-link">
              {link}
            </ThemedText>
            <View style={styles.row}>
              <Pressable
                onPress={() => void copy()}
                accessibilityRole="button"
                testID="invite-copy"
                style={({ pressed }) => [styles.btn, pressed && styles.dim]}>
                <Text style={styles.btnText}>{copied ? 'Copied' : 'Copy link'}</Text>
              </Pressable>
              {canShare ? (
                <Pressable
                  onPress={() => void share()}
                  accessibilityRole="button"
                  testID="invite-share"
                  style={({ pressed }) => [styles.btnQuiet, pressed && styles.dim]}>
                  <Text style={styles.btnQuietText}>Share</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}

        {summary ? (
          <View style={styles.stats} testID="invite-stats">
            <Stat value={counts.trialled} label="started the trial" />
            <Stat value={counts.paid} label="paid" />
            <Stat value={summary.creditsLeft} label={summary.creditsLeft === 1 ? 'free print left' : 'free prints left'} />
          </View>
        ) : null}

        {summary && summary.creditsLeft > 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            To use a free print, open one of your binders, open its print sheet, and press &quot;Use a free print&quot;.
          </ThemedText>
        ) : null}

        <View style={styles.rules}>
          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.label}>
            How it works
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            1. A friend opens your link and starts the free trial: you get 1 free print.
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            2. When their trial ends and they pay: you each get 1 more.
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Invite as many friends as you like, and free prints never run out. A friend counts once, for the first link
            they used. If a friend’s payment is refunded, the unused prints it earned are removed. Cancelling a trial
            removes nothing.
          </ThemedText>
        </View>
      </View>
    </PageShell>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  prose: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', gap: Spacing.three },
  center: { paddingVertical: Spacing.six, alignItems: 'center' },
  card: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderWidth: 1,
    borderColor: Palette.hairline,
    borderRadius: Radius.lg,
    backgroundColor: Palette.panelAlt,
  },
  label: { textTransform: 'uppercase', letterSpacing: 0.5 },
  link: { fontWeight: Weight.semibold },
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
  stats: { flexDirection: 'row', gap: Spacing.three },
  stat: {
    flex: 1,
    minWidth: 0,
    padding: Spacing.three,
    borderWidth: 1,
    borderColor: Palette.hairline,
    borderRadius: Radius.lg,
    gap: Spacing.one,
  },
  statValue: { fontSize: 28, fontWeight: Weight.bold, color: Palette.ink },
  rules: { gap: Spacing.two },
});
