/**
 * `/pricing` — the plan value-prop page: plan cards, the one-time PDF product, the signed-in
 * user's current plan and usage, and the capability comparison. Honest while checkout is closed:
 * everything is free in beta, CTAs reveal the coming-soon line (CHECKOUT_OPEN in
 * src/data/pricing.ts flips them into real checkout launches later).
 */
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { PageShell } from '@/components/layout/PageShell';
import { ComparisonTable } from '@/components/monetization/ComparisonTable';
import { PlanCard } from '@/components/monetization/PlanCard';
import { PlanUsageSection } from '@/components/monetization/TierUsage';
import { ThemedText } from '@/components/themed-text';
import {
  Fonts,
  FontSize,
  MaxContentWidth,
  MaxContentWidthWide,
  Palette,
  Radius,
  Shadows,
  Spacing,
} from '@/constants/theme';
import {
  CHECKOUT_CLOSED_NOTE,
  CHECKOUT_OPEN,
  COMPARISON,
  ONE_TIME_PDF,
  PLANS,
} from '@/data/pricing';
import { useTier } from '@/hooks/use-tier';
import { useAuth } from '@/store/auth';

export default function PricingScreen() {
  const router = useRouter();
  const { tier, loading } = useTier();
  const { user } = useAuth();
  // Which plan's CTA was pressed while checkout is closed (shows the honest note under it).
  const [revealedPlan, setRevealedPlan] = useState<string | null>(null);

  const selectPlan = (name: string) => {
    if (!CHECKOUT_OPEN) {
      setRevealedPlan(name);
      return;
    }
    // Checkout launch lands here when the provider is wired (carry the Supabase user id).
  };

  return (
    <PageShell
      title="Pricing"
      description="michi-maker plans: Free, PRO, and VIP."
      maxWidth={MaxContentWidthWide}>
      <View style={styles.prose}>
        <ThemedText type="subtitle" style={styles.h1}>
          Plans for every shelf
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.lede}>
          Everything is free while michi-maker is in beta. These are the plans that are coming,
          so you know exactly where the shelves end.
        </ThemedText>
      </View>

      <View style={styles.cards}>
        {PLANS.map((plan) => (
          <PlanCard
            key={plan.tier}
            plan={plan}
            isCurrent={!loading && tier === plan.tier}
            onSelect={() => selectPlan(plan.name)}
            note={revealedPlan === plan.name && !CHECKOUT_OPEN ? CHECKOUT_CLOSED_NOTE : null}
          />
        ))}
      </View>

      {/* One-time print product */}
      <View style={styles.oneTime}>
        <View style={styles.oneTimeText}>
          <ThemedText type="smallBold" style={styles.oneTimeName}>
            {ONE_TIME_PDF.name} · {ONE_TIME_PDF.price}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.oneTimeBlurb}>
            {ONE_TIME_PDF.blurb}
          </ThemedText>
        </View>
      </View>

      {/* Signed-in: current plan + usage */}
      {user ? (
        <View style={styles.prose}>
          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionLabel}>
            Your plan
          </ThemedText>
          <PlanUsageSection />
        </View>
      ) : null}

      <View style={styles.prose}>
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionLabel}>
          Compare plans
        </ThemedText>
        <ComparisonTable rows={COMPARISON} />
        <ThemedText type="small" themeColor="textSecondary" style={styles.smallPrint}>
          Prices may change before plans open. New to the craft? Start with the{' '}
          <ThemedText
            type="linkPrimary"
            style={styles.smallPrintLink}
            onPress={() => router.push('/learn' as Href)}>
            how-to guides
          </ThemedText>{' '}
          on the How-to page.
        </ThemedText>
      </View>
    </PageShell>
  );
}

const styles = StyleSheet.create({
  prose: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  h1: { fontFamily: Fonts?.brand, marginBottom: Spacing.two },
  lede: { lineHeight: 22, marginBottom: Spacing.five },
  cards: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
    alignItems: 'stretch',
    marginBottom: Spacing.five,
  },
  oneTime: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Palette.hairline,
    backgroundColor: Palette.panelAlt,
    padding: Spacing.four,
    marginBottom: Spacing.five,
    ...Shadows.page,
  },
  oneTimeText: { gap: Spacing.one },
  oneTimeName: { fontSize: FontSize.control },
  oneTimeBlurb: { lineHeight: 19 },
  sectionLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.three,
    marginTop: Spacing.two,
  },
  smallPrint: { fontSize: FontSize.sm, lineHeight: 18, marginTop: Spacing.four },
  smallPrintLink: { fontSize: FontSize.sm },
});
