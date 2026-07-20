/**
 * The plan comparison table — the /subscriptions centerpiece. Ported from the approved draft
 * sheet layout: capability rows down the left, ascending plan columns (Free → PRO → VIP), PRO
 * raised + accent-outlined ("Most popular", yearly price leading), VIP the accent-TINTED hero
 * column ("Best value") — soft selection tint with the standard dark ink ramp, NOT a saturated
 * fill with white text (owner call: dark-on-light like every other surface) — accent-tinted
 * highlight rows for the included-at-every-tier items, and *, †, ‡ footnotes below.
 *
 * Wide content: the table keeps a real minimum width and scrolls horizontally inside its own
 * ScrollView on narrow screens — columns never crush into unreadable slivers.
 *
 * CTAs live in the table's foot row. While checkout is closed they reveal the honest
 * "coming soon" note (CHECKOUT_OPEN in src/data/subscriptions.ts flips them into real checkout
 * launches later).
 */
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { FontSize, Palette, Radius, Shadows, Spacing, Weight } from '@/constants/theme';
import {
  formatMoney,
  previewPlanChange,
  startCheckout,
  type PlanChangePreview,
} from '@/data/checkout';
import {
  CHECKOUT_CLOSED_NOTE,
  CHECKOUT_OPEN,
  COMPARISON,
  FOOTNOTES,
  PLAN_CHANGE_CLOSED_NOTE,
  PLAN_HEADERS,
  planCta,
  type CompareCell,
  type PlanHeader,
} from '@/data/subscriptions';
import { useTier } from '@/hooks/use-tier';
import { useAuth } from '@/store/auth';

/** How far the PRO/VIP header tabs rise above the table body. */
const TAB_RISE = Spacing.four;

function ValueCell({ cell, vip }: { cell: CompareCell; vip?: boolean }) {
  return (
    <>
      <Text style={[styles.value, vip && styles.vipText, cell.strong && styles.valueStrong]}>
        {cell.text}
      </Text>
      {cell.sub ? <Text style={[styles.valueSub, vip && styles.vipSubText]}>{cell.sub}</Text> : null}
    </>
  );
}

export function PlanComparison() {
  const { tier, loading } = useTier();
  const { isSignedIn } = useAuth();
  // The note under the pressed CTA: the coming-soon line while checkout is closed, a sign-in
  // nudge for guests, or a checkout error. Never a silent no-op.
  const [note, setNote] = useState<{ tier: string; text: string } | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const buy = async (plan: PlanHeader, lookupKey?: string) => {
    if (!CHECKOUT_OPEN) {
      setNote({ tier: plan.tier, text: CHECKOUT_CLOSED_NOTE });
      return;
    }
    if (!lookupKey || busyKey) return;
    if (!isSignedIn) {
      setNote({ tier: plan.tier, text: 'Sign in (free) first — plans attach to your account.' });
      return;
    }
    setNote(null);
    setBusyKey(lookupKey);
    try {
      await startCheckout(lookupKey); // navigates away on success
    } catch (e) {
      setNote({ tier: plan.tier, text: (e as Error).message });
    } finally {
      setBusyKey(null);
    }
  };

  const [freeHead, proHead, vipHead] = PLAN_HEADERS;

  // Real prorated cost of each upgrade available to an existing subscriber, so the CTA can quote
  // a number instead of promising "you only pay the difference". Read-only on Stripe's side.
  // Keyed by lookup key; a plan with no entry simply renders without a price.
  const [previews, setPreviews] = useState<Record<string, PlanChangePreview>>({});
  useEffect(() => {
    if (loading) return;
    // Only a paying subscriber has anything to prorate — planCta calls that case 'switch'.
    const upgrades = PLAN_HEADERS.filter(
      (p) => p.tier !== 'free' && planCta(p, tier).kind === 'switch' && p.yearlyKey,
    );
    if (!upgrades.length) return;
    let live = true;
    Promise.all(
      upgrades.map(async (p) => [p.yearlyKey!, await previewPlanChange(p.yearlyKey!)] as const),
    )
      .then((pairs) => {
        if (!live) return;
        const next: Record<string, PlanChangePreview> = {};
        for (const [key, preview] of pairs) if (preview) next[key] = preview;
        setPreviews(next);
      })
      .catch(() => {}); // a missing price is better than a wrong one — just omit it
    return () => {
      live = false;
    };
  }, [loading, tier]);

  /**
   * One paid column's foot cell. What it offers depends entirely on the viewer's current plan
   * (see planCta): no downgrades, no active button on the plan you already hold, and upgrades
   * from a paid plan are a subscription SWITCH rather than a second purchase.
   */
  /** Free's foot cell. Never a purchase: a sign-up for guests, "your plan" for Free users, and
   *  nothing for subscribers (that would be a downgrade). Same planCta rules as the paid columns. */
  const freeFoot = () => {
    if (loading) return null;
    const cta = planCta(freeHead, tier);
    if (cta.kind === 'signIn') return <Text style={styles.valueSub}>Sign in free to start</Text>;
    if (cta.kind === 'current') return <Text style={styles.footCurrent}>Your current plan</Text>;
    return null;
  };

  const paidFoot = (plan: PlanHeader) => {
    // Resolve nothing until the tier is known — a flash of "Choose PRO" at someone who already
    // pays for PRO is exactly the wrong first impression.
    if (loading) return <View style={styles.footPlaceholder} />;
    const cta = planCta(plan, tier);

    if (cta.kind === 'none') return <View style={styles.footPlaceholder} />;
    if (cta.kind === 'current') {
      return <Text style={styles.footCurrent}>Your current plan</Text>;
    }
    // 'signIn' is the Free column's case and never reaches a paid column — but keep this total
    // so a future tier can't silently fall through to a purchase button.
    if (cta.kind === 'signIn') return <View style={styles.footPlaceholder} />;

    const isSwitch = cta.kind === 'switch';
    const key = plan.yearlyKey;
    const preview = key ? previews[key] : undefined;
    return (
      <>
        <Pressable
          onPress={() => {
            // A switch must never open Checkout: that starts a second subscription and bills
            // both plans. Until plan changes are wired it says so plainly.
            if (isSwitch) {
              setNote({ tier: plan.tier, text: PLAN_CHANGE_CLOSED_NOTE });
              return;
            }
            void buy(plan, key);
          }}
          disabled={!!busyKey}
          style={({ pressed }) => [styles.btn, (pressed || !!busyKey) && styles.dim]}>
          {busyKey === key ? (
            <ActivityIndicator color={Palette.accentText} />
          ) : (
            <Text style={styles.btnText}>{cta.label}</Text>
          )}
        </Pressable>
        {/* The real prorated figure from Stripe, not an estimate we computed. Only ever shown on
            an upgrade, where "what does this actually cost me today" is the open question. */}
        {isSwitch && preview ? (
          <Text style={styles.prorated}>
            {preview.amountDue > 0
              ? `${formatMoney(preview.amountDue, preview.currency)} today, prorated for the rest of your year`
              : 'Nothing to pay today — your remaining credit covers it'}
          </Text>
        ) : null}
        {/* The month-to-month link is a NEW-subscription choice. Offering it on an upgrade would
            imply we can move an existing yearly plan onto monthly billing, which we can't yet. */}
        {CHECKOUT_OPEN && !isSwitch && plan.monthlyKey ? (
          <Pressable onPress={() => buy(plan, plan.monthlyKey)} disabled={!!busyKey} hitSlop={4}>
            <Text style={styles.monthlyLink}>
              {busyKey === plan.monthlyKey ? 'Opening checkout…' : plan.monthlyLabel}
            </Text>
          </Pressable>
        ) : null}
        {note?.tier === plan.tier ? <Text style={styles.ctaNote}>{note.text}</Text> : null}
      </>
    );
  };

  return (
    <View>
      {/* The indicator is hidden, not the scrolling: RN Web renders a horizontal ScrollView with
          a permanent scrollbar TRACK even when nothing overflows, which is the useless bar this
          table used to show at every width. Panning still works on genuinely narrow screens,
          where four columns cannot fit no matter how tight the table gets. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}>
        <View style={styles.table}>
          {/* ── header row ─────────────────────────────── */}
          <View style={styles.row}>
            <View style={[styles.cell, styles.labelCell, styles.headLabel]} />
            <View style={[styles.cell, styles.freeCol, styles.headCell]}>
              <Text style={styles.tierName}>{freeHead.name}</Text>
              <Text style={styles.tierPrice}>{freeHead.price}</Text>
              <Text style={styles.tierSub}>{freeHead.sub}</Text>
              {!loading && tier === 'free' ? <Text style={styles.current}>Your current plan</Text> : null}
            </View>
            <View style={[styles.cell, styles.proCol, styles.headCell, styles.proHead]}>
              <View style={styles.badgePro}>
                <Text style={styles.badgeProText}>{proHead.badge}</Text>
              </View>
              <Text style={styles.tierName}>{proHead.name}</Text>
              <Text style={styles.tierPrice}>
                {proHead.price}
                <Text style={styles.tierPer}>{proHead.per}</Text>
              </Text>
              <Text style={styles.tierSub}>{proHead.sub}</Text>
              {!loading && tier === 'pro' ? <Text style={styles.current}>Your current plan</Text> : null}
            </View>
            <View style={[styles.cell, styles.vipCol, styles.headCell, styles.vipHead]}>
              <View style={styles.badgeVip}>
                <Text style={styles.badgeVipText}>{vipHead.badge}</Text>
              </View>
              <Text style={[styles.tierName, styles.vipText]}>{vipHead.name}</Text>
              <Text style={[styles.tierPrice, styles.vipText]}>
                {vipHead.price}
                <Text style={[styles.tierPer, styles.vipSubText]}>{vipHead.per}</Text>
              </Text>
              <Text style={[styles.tierSub, styles.vipSubText]}>{vipHead.sub}</Text>
              {!loading && tier === 'vip' ? (
                <Text style={styles.current}>Your current plan</Text>
              ) : null}
            </View>
          </View>

          {/* ── capability rows ────────────────────────── */}
          {COMPARISON.map((row) => (
            <View key={row.capability} style={styles.row}>
              <View style={[styles.cell, styles.labelCell, row.highlight && styles.hlCell]}>
                <Text style={[styles.label, row.highlight && styles.hlLabel]}>
                  {row.capability}
                  {row.mark ? <Text style={styles.mark}>{row.mark}</Text> : ''}
                </Text>
              </View>
              <View style={[styles.cell, styles.freeCol, row.highlight && styles.hlCell]}>
                <ValueCell cell={row.free} />
              </View>
              <View style={[styles.cell, styles.proCol, row.highlight && styles.hlCell]}>
                <ValueCell cell={row.pro} />
              </View>
              <View style={[styles.cell, styles.vipCol]}>
                <ValueCell cell={row.vip} vip />
              </View>
            </View>
          ))}

          {/* ── CTA foot row ───────────────────────────── */}
          <View style={styles.row}>
            <View style={[styles.cell, styles.labelCell, styles.footCell, styles.footLabel]} />
            <View style={[styles.cell, styles.freeCol, styles.footCell]}>
              {freeFoot()}
            </View>
            <View style={[styles.cell, styles.proCol, styles.footCell, styles.proFoot]}>
              {paidFoot(proHead)}
            </View>
            <View style={[styles.cell, styles.vipCol, styles.footCell, styles.vipFoot]}>
              {paidFoot(vipHead)}
            </View>
          </View>
        </View>
      </ScrollView>

      {/* ── footnotes ─────────────────────────────────── */}
      <View style={styles.footnotes}>
        {FOOTNOTES.map((f) => (
          <Text key={f.mark} style={styles.footnote}>
            <Text style={styles.mark}>{f.mark}</Text> {f.text}
            {f.link ? (
              <Text
                style={styles.footnoteLink}
                onPress={() => void Linking.openURL(f.link!.url).catch(() => {})}>
                {' '}
                {f.link.label}
              </Text>
            ) : null}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1 },
  // 720, down from 860: the page shell caps readable content well below the old figure, so the
  // table demanded more width than it was ever given and overflowed on ordinary screens. Columns
  // still hold their proportions; the capability subs just wrap a line earlier.
  table: { minWidth: 720, flex: 1, paddingTop: TAB_RISE },
  row: { flexDirection: 'row', alignItems: 'stretch' },

  cell: {
    flexGrow: 1,
    flexBasis: 0,
    paddingVertical: Spacing.three,
    // Tightened from `three` (16) to buy back horizontal room without touching column ratios.
    paddingHorizontal: Spacing.two,
    justifyContent: 'center',
    gap: 2,
    backgroundColor: Palette.surface,
    borderTopWidth: 1,
    borderTopColor: Palette.hairline,
  },
  labelCell: { flexGrow: 1.3, borderLeftWidth: 1, borderLeftColor: Palette.hairline },
  freeCol: { flexGrow: 1 },
  proCol: {
    flexGrow: 1.1,
    borderLeftWidth: 2,
    borderRightWidth: 2,
    borderLeftColor: Palette.accent,
    borderRightColor: Palette.accent,
  },
  vipCol: {
    flexGrow: 1.25,
    backgroundColor: Palette.selectionSoft,
    borderTopColor: Palette.hairline,
    borderRightWidth: 2,
    borderRightColor: Palette.accent,
  },

  /* header row */
  headLabel: { backgroundColor: 'transparent', borderTopWidth: 0, borderLeftWidth: 0 },
  headCell: { justifyContent: 'flex-end', paddingVertical: Spacing.four, backgroundColor: Palette.panel },
  proHead: {
    marginTop: -TAB_RISE,
    borderTopWidth: 2,
    borderTopColor: Palette.accent,
    borderTopLeftRadius: Radius.actionBar,
    borderTopRightRadius: Radius.actionBar,
    backgroundColor: Palette.surface,
    ...Shadows.page,
  },
  vipHead: {
    marginTop: -TAB_RISE,
    borderTopWidth: 2,
    borderTopColor: Palette.accent,
    borderTopLeftRadius: Radius.actionBar,
    borderTopRightRadius: Radius.actionBar,
    backgroundColor: Palette.selectionTint,
    ...Shadows.page,
  },
  tierName: { fontSize: FontSize.control, fontWeight: Weight.bold, color: Palette.ink },
  tierPrice: { fontSize: FontSize.title, fontWeight: Weight.bold, color: Palette.ink, marginTop: 2 },
  tierPer: { fontSize: FontSize.label, fontWeight: Weight.medium, color: Palette.muted },
  tierSub: { fontSize: FontSize.sm, color: Palette.muted, lineHeight: 16 },
  current: { fontSize: FontSize.sm, fontWeight: Weight.semibold, color: Palette.link, marginTop: 4 },

  badgePro: {
    alignSelf: 'flex-start',
    backgroundColor: Palette.selectionSoft,
    borderRadius: Radius.pill,
    paddingVertical: 2,
    paddingHorizontal: Spacing.two,
    marginBottom: Spacing.two,
  },
  badgeProText: {
    fontSize: FontSize.xs,
    fontWeight: Weight.bold,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: Palette.link,
  },
  badgeVip: {
    alignSelf: 'flex-start',
    backgroundColor: Palette.accent,
    borderRadius: Radius.pill,
    paddingVertical: 2,
    paddingHorizontal: Spacing.two,
    marginBottom: Spacing.two,
  },
  badgeVipText: {
    fontSize: FontSize.xs,
    fontWeight: Weight.bold,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: Palette.accentText,
  },

  /* capability cells */
  label: { fontSize: FontSize.body, fontWeight: Weight.semibold, color: Palette.ink, lineHeight: 19 },
  value: { fontSize: FontSize.body, color: Palette.ink2, lineHeight: 19 },
  valueStrong: { fontWeight: Weight.semibold, color: Palette.ink },
  valueSub: { fontSize: FontSize.sm, color: Palette.muted, lineHeight: 16 },
  // The VIP column's text is the same dark ink ramp as every other light surface (owner call).
  vipText: { color: Palette.ink },
  vipSubText: { color: Palette.muted },
  mark: { color: Palette.link, fontWeight: Weight.bold },

  /* highlight rows */
  hlCell: { backgroundColor: Palette.selectionSoft },
  hlLabel: { color: Palette.link },

  /* foot row */
  footCell: { borderBottomWidth: 1, borderBottomColor: Palette.hairline, paddingBottom: Spacing.four },
  footLabel: { backgroundColor: 'transparent', borderBottomWidth: 0 },
  proFoot: {
    borderBottomWidth: 2,
    borderBottomColor: Palette.accent,
    borderBottomLeftRadius: Radius.actionBar,
    borderBottomRightRadius: Radius.actionBar,
  },
  vipFoot: {
    borderBottomWidth: 2,
    borderBottomColor: Palette.accent,
    borderBottomLeftRadius: Radius.actionBar,
    borderBottomRightRadius: Radius.actionBar,
  },
  btn: {
    backgroundColor: Palette.accent,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    minHeight: 38,
    justifyContent: 'center',
  },
  btnText: { color: Palette.accentText, fontSize: FontSize.body, fontWeight: Weight.semibold },
  dim: { opacity: 0.7 },
  prorated: {
    fontSize: FontSize.sm,
    color: Palette.ink2,
    fontWeight: Weight.semibold,
    textAlign: 'center',
    lineHeight: 16,
    marginTop: Spacing.one,
  },
  monthlyLink: {
    fontSize: FontSize.sm,
    color: Palette.link,
    marginTop: Spacing.one,
    textAlign: 'center',
  },
  ctaNote: { fontSize: FontSize.sm, color: Palette.muted, lineHeight: 16, marginTop: Spacing.one },
  // Keeps the foot row's height stable when a column offers nothing (downgrades, or while the
  // tier is still resolving) so the table doesn't jump as the entitlement read lands.
  footPlaceholder: { minHeight: 38 },
  footCurrent: {
    fontSize: FontSize.body,
    fontWeight: Weight.semibold,
    color: Palette.link,
    textAlign: 'center',
    minHeight: 38,
    lineHeight: 38,
  },

  /* footnotes */
  footnotes: { gap: Spacing.one, marginTop: Spacing.three, maxWidth: 720 },
  footnote: { fontSize: FontSize.sm, color: Palette.muted, lineHeight: 18 },
  footnoteLink: { color: Palette.accent, fontWeight: Weight.semibold },
});
