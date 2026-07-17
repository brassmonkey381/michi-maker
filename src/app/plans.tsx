/**
 * `/plans` — the plan page (formerly /subscriptions and /pricing, which redirect here). Layout ported
 * from the approved comparison-sheet draft: masthead, the plan comparison table (PLAN_HEADERS +
 * COMPARISON in src/data/subscriptions.ts), the one-time PDF product, and the signed-in user's
 * current plan + usage meters. Honest while checkout is closed: everything is free in beta and
 * CTAs reveal the coming-soon line (CHECKOUT_OPEN flips them into real checkout launches later).
 */
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { PageShell } from '@/components/layout/PageShell';
import { BundleOffer } from '@/components/monetization/BundleOffer';
import { PlanComparison } from '@/components/monetization/PlanComparison';
import { PlanUsageSection } from '@/components/monetization/TierUsage';
import { ThemedText } from '@/components/themed-text';
import {
  FontSize,
  MaxContentWidth,
  MaxContentWidthWide,
  Palette,
  Radius,
  Shadows,
  Spacing,
  Weight,
} from '@/constants/theme';
import { ONE_TIME_PDF } from '@/data/subscriptions';
import { useTier } from '@/hooks/use-tier';
import { useAuth } from '@/store/auth';

export default function PlansScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { checkout } = useLocalSearchParams<{ checkout?: string }>();
  const { isPaid, refresh } = useTier();

  // Back from Stripe Checkout: fulfillment is webhook-driven and lags the redirect by a few
  // seconds, so poll the entitlement read until the tier flips (or we give up quietly — the
  // banner keeps the user informed either way, never a dead spinner).
  const settling = checkout === 'success' && !isPaid;
  useEffect(() => {
    if (!settling) return;
    let polls = 0;
    const id = setInterval(() => {
      refresh();
      if (++polls >= 10) clearInterval(id);
    }, 2000);
    return () => clearInterval(id);
  }, [settling, refresh]);

  return (
    <PageShell
      title="Plans"
      description="michi-maker plans: Free, PRO, and VIP."
      maxWidth={MaxContentWidthWide}>
      {/* ── masthead ─────────────────────────────────── */}
      <View style={styles.masthead}>
        <View style={styles.chip}>
          <ThemedText type="smallBold" style={styles.chipText}>
            michi-maker plans
          </ThemedText>
        </View>
        <ThemedText type="subtitle" style={styles.h1}>
          Build binders free. Upgrade when your collection outgrows them.
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.lede}>
          Every plan includes the full binder editor, Slice Studio, and your pages synced across
          web, iOS, and Android. Everything is free while michi-maker is in beta. These are the
          plans that are coming, so you know exactly where the shelves end.
        </ThemedText>
      </View>

      {checkout === 'success' ? (
        <View style={styles.banner}>
          <ThemedText type="smallBold" style={styles.bannerTitle}>
            {isPaid ? 'Your plan is active. Welcome aboard!' : 'Payment received'}
          </ThemedText>
          {!isPaid ? (
            <ThemedText type="small" themeColor="textSecondary">
              Your purchase unlocks in a moment — this page checks automatically.
            </ThemedText>
          ) : null}
          {/* POST-CHECKOUT BUNDLE UPSELL — a fresh member who lacks TCGScan Pro is offered the
              discounted add-on right here (BundleOffer self-gates: paid + no tcgscan_pro). */}
          <BundleOffer />
        </View>
      ) : checkout === 'cancelled' ? (
        <View style={styles.banner}>
          <ThemedText type="small" themeColor="textSecondary">
            Checkout cancelled — nothing was charged.
          </ThemedText>
        </View>
      ) : null}

      {/* Remount on tier flip so the table's own entitlement read (Current plan tag) refreshes. */}
      <PlanComparison key={`plans-${isPaid}`} />

      {/* ── one-time product ─────────────────────────── */}
      <View style={styles.oneTime}>
        <ThemedText type="smallBold" style={styles.oneTimeTitle}>
          Not ready to subscribe? One-time unlock
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.oneTimeBlurb}>
          <ThemedText type="smallBold">{ONE_TIME_PDF.price}</ThemedText> · {ONE_TIME_PDF.name}.{' '}
          {ONE_TIME_PDF.blurb}
        </ThemedText>
      </View>

      {/* ── signed-in: current plan + usage ──────────── */}
      {user ? (
        <View style={styles.prose}>
          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionLabel}>
            Your plan
          </ThemedText>
          <PlanUsageSection key={`usage-${isPaid}`} />
          <ThemedText
            type="linkPrimary"
            style={styles.historyLink}
            onPress={() => router.push('/purchases' as Href)}>
            My Purchases ›
          </ThemedText>
        </View>
      ) : null}

      <View style={styles.prose}>
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
  masthead: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    alignItems: 'center',
    gap: Spacing.three,
    marginBottom: Spacing.five,
  },
  chip: {
    backgroundColor: Palette.selectionSoft,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
  },
  chipText: {
    fontSize: FontSize.sm,
    color: Palette.link,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    fontWeight: Weight.semibold,
  },
  h1: { textAlign: 'center' },
  lede: { lineHeight: 22, textAlign: 'center' },
  banner: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    borderRadius: Radius.control,
    borderWidth: 1,
    borderColor: Palette.accent,
    backgroundColor: Palette.selectionSoft,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    marginBottom: Spacing.four,
    gap: 2,
  },
  bannerTitle: { color: Palette.link },
  prose: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  oneTime: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Palette.hairline,
    backgroundColor: Palette.panelAlt,
    padding: Spacing.four,
    marginTop: Spacing.five,
    marginBottom: Spacing.five,
    gap: Spacing.two,
    ...Shadows.page,
  },
  oneTimeTitle: { fontSize: FontSize.control },
  oneTimeBlurb: { lineHeight: 19 },
  sectionLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.three,
    marginTop: Spacing.two,
  },
  historyLink: { fontSize: FontSize.label, marginTop: Spacing.two },
  smallPrint: { fontSize: FontSize.sm, lineHeight: 18, marginTop: Spacing.four },
  smallPrintLink: { fontSize: FontSize.sm },
});
