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
import { Platform } from 'react-native';
import { StatePanel } from 'tcgscan-ui';

import { AuthSheet } from '@/components/auth/AuthSheet';
import { PageShell } from '@/components/layout/PageShell';
import { InviteBody } from '@/components/referrals/InviteBody';
import { ensureReferralCode, fetchReferralSummary, inviteUrl, type ReferralSummary } from '@/data/referrals';
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
      <InviteBody
        summary={summary}
        link={link}
        copied={copied}
        canShare={canShare}
        error={error}
        onCopy={() => void copy()}
        onShare={() => void share()}
      />
    </PageShell>
  );
}
