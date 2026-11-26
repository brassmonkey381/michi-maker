/**
 * `/r/<code>`: a friend's invite link (MIC-069). Remembers the code in this browser, so the free
 * trial checkout started later can credit whoever shared it, then goes straight to the home page.
 * A bad or unknown code is simply not remembered; the visitor still lands on the site.
 */
import { Redirect, useLocalSearchParams, type Href } from 'expo-router';
import { useState } from 'react';

import { rememberReferralCode } from '@/data/referrals';
import { track } from '@/lib/analytics';

export default function InviteLanding() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  // Lazy state, so it runs once at mount and never in a render loop.
  useState(() => {
    const kept = rememberReferralCode(code);
    track('referral.clicked', { kept });
    return kept;
  });
  return <Redirect href={'/' as Href} />;
}
