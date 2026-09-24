/**
 * The plan comparison table — the /subscriptions centerpiece. Ported from the approved draft
 * sheet layout: capability rows down the left, ascending plan columns (Free → PRO → VIP), PRO
 * raised + accent-outlined ("Most popular", yearly price leading), VIP the accent-TINTED hero
 * column ("Best value") — soft selection tint with the standard dark ink ramp, NOT a saturated
 * fill with white text (owner call: dark-on-light like every other surface) — accent-tinted
 * highlight rows for the included-at-every-tier items, and numbered (1)…(5) footnotes below.
 *
 * Wide content: the table keeps a real minimum width and scrolls horizontally inside its own
 * ScrollView on narrow screens — columns never crush into unreadable slivers.
 *
 * CTAs live in the table's foot row. While checkout is closed they reveal the honest
 * "coming soon" note (CHECKOUT_OPEN in src/data/subscriptions.ts flips them into real checkout
 * launches later).
 */
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { AuthSheet } from '@/components/auth/AuthSheet';
import { useTcgscanOpen } from '@/components/monetization/BundleOffer';
import { Breakpoints, FontSize, Palette, Radius, Shadows, Spacing, Weight } from '@/constants/theme';
import {
  changePlan,
  formatMoney,
  previewPlanChange,
  startCheckout,
  type PlanChangePreview,
} from '@/data/checkout';
import {
  CHECKOUT_CLOSED_NOTE,
  CHECKOUT_OPEN,
  COMPARISON,
  annualAnchor,
  annualSavingPercent,
  FOOTNOTES,
  INCLUDED_EVERYWHERE,
  EVERY_TIER_NOTE,
  PLAN_HEADERS,
  planCta,
  type CompareCell,
  type PlanHeader,
  CROSS_DISCOUNT_RETIRED,
} from '@/data/subscriptions';
import { BUNDLE_PERCENT_OFF, formatMinor, PERCENT_OFF, promoActive, promoPriceMinor } from '@/data/promo';
import { useTier } from '@/hooks/use-tier';
import { useTrial } from '@/hooks/use-trial';
import { useAuth } from '@/store/auth';

/** How far the PRO/VIP header tabs rise above the table body. */
const TAB_RISE = Spacing.four;

/**
 * A bare "✓" glyph reads as an unfinished table; a filled accent disc reads as an answer, and
 * it is the one mark the eye can find while scanning a column at speed. Only PRO gets it, because
 * the whole job of this table is to make one column legible from across the room.
 */
function Tick() {
  return (
    <View style={styles.tick}>
      <Text style={styles.tickMark}>{'✓'}</Text>
    </View>
  );
}

function ValueCell({ cell, vip, pro }: { cell: CompareCell; vip?: boolean; pro?: boolean }) {
  const isTick = cell.text === '✓';
  return (
    <>
      <View style={styles.valueRow}>
        {isTick && pro ? (
          <Tick />
        ) : (
        <Text
          style={[
            styles.value,
            vip && styles.vipText,
            cell.strong && styles.valueStrong,
            cell.strong && pro && styles.valueStrongPro,
            // "No" is information the reader does not need to dwell on. Muted, so the eye slides
            // past it to the column that says yes.
            !pro && cell.text === 'No' && styles.valueNo,
          ]}>
          {cell.text}
        </Text>
        )}
        {/* Sits beside the value rather than under it, so the saving reads as part of the
            headline instead of another line of small print. */}
        {cell.stamp ? (
          <View style={styles.stamp}>
            <Text style={styles.stampText}>{cell.stamp}</Text>
          </View>
        ) : null}
      </View>
      {cell.sub ? <Text style={[styles.valueSub, vip && styles.vipSubText]}>{cell.sub}</Text> : null}
    </>
  );
}

/**
 * The billing subline at the sale price. The stored `sub` quotes list prices in prose ("about
 * $3.33 a month ... or $3.99 month to month"), which would contradict a struck-out header the
 * moment a promotion runs. Derived from the same minor amounts as the headline so the whole
 * column moves together.
 */
function saleSub(head: PlanHeader, percentOff: number): string {
  const perMonth = formatMinor(Math.round(promoPriceMinor(head.yearlyMinor ?? 0, percentOff) / 12));
  const monthly = head.monthlyMinor ? formatMinor(promoPriceMinor(head.monthlyMinor, percentOff)) : null;
  return `about ${perMonth} a month, billed yearly${monthly ? ` · or ${monthly} month to month` : ''}`;
}

export function PlanComparison() {
  const { tier: heldTier, capSet, loading, refresh, isPaid, tcgscanIsPaid, tcgscanIsYearly } = useTier();
  // VIP is retired from sale; a VIP row that still exists is PRO as far as this page is concerned.
  const tier = heldTier === 'vip' ? 'pro' : heldTier;
  const { isSignedIn } = useAuth();
  const { opening, open } = useTcgscanOpen();
  // Cross-app bundle: a member holding a sibling TCGScan tier earns 60% off PRO/VIP. Mirror the
  // /plans banner gate exactly — shown to FREE and TRIAL holders, hidden from a fully-paid plan.
  // The server (stripe-checkout) is the source of truth for the charged price and for term-level
  // bundle matching; this only mirrors the banner's promise on the page.
  const onTrial = useTrial().state === 'active';
  // tcgscanIsPaid, not hasTcgscanPro: a TRIALLING sibling earns no bundle, so quoting 60% off
  // monthly here would advertise a price stripe-checkout now refuses.
  const bundleEligible = !CROSS_DISCOUNT_RETIRED && !loading && tcgscanIsPaid && !(isPaid && !onTrial);
  // PER-TERM, mirroring the server's bundleQualifies (src/data/bundle.ts): a YEARLY plan gets the
  // 60% bundle ONLY when the qualifying tcgscan sibling is itself billed yearly; a MONTHLY plan
  // gets it for any active sibling. So a monthly/comp-sibling holder sees 60% on monthly and
  // the normal 20%/list on yearly — never a yearly 60% the checkout won't honour.
  const bundleYearly = bundleEligible && tcgscanIsYearly;
  // BETTER-OF (mirrors stripe-checkout): the bundle beats the promo, and unlike the promo it does
  // NOT depend on the promo clock — a bundle-eligible user sees 60% even when promoActive() is off.
  // Both are display only: the coupon is attached server-side at checkout.
  const onSaleYearly = bundleYearly || promoActive();
  const yearlyPercentOff = bundleYearly ? BUNDLE_PERCENT_OFF : PERCENT_OFF;
  const onSaleMonthly = bundleEligible || promoActive();
  const monthlyPercentOff = bundleEligible ? BUNDLE_PERCENT_OFF : PERCENT_OFF;
  // Footnotes start folded; see the block that renders them.
  const [notesOpen, setNotesOpen] = useState(false);
  // The Free column's "Sign in free to start" opens the account sheet in place.
  const [authOpen, setAuthOpen] = useState(false);
  // THE TABLE IS AS WIDE AS ITS BLOCK, never wider. Inside a horizontal ScrollView a child is
  // sized to its content, and a cell's content is the longest unbroken line its text could be,
  // so every sub-line of detail widened the table past the page and the VIP column fell off the
  // right edge. Measured width in, wrapping follows; the 720 floor is where panning takes over.
  const [blockW, setBlockW] = useState(0);
  const { width } = useWindowDimensions();
  // A PHONE CANNOT PAN TO A PRICE IT CANNOT SEE. Four columns need 720px; at 375 the table showed
  // the labels and a sliver of Free, with the whole PRO column and its buy button off the right
  // edge and no scrollbar to say so (the indicator is hidden here, deliberately, for the wide
  // case). Below this width the comparison stops being a table and becomes two cards.
  const phone = width < Breakpoints.phone;
  // The note under the pressed CTA: the coming-soon line while checkout is closed, a sign-in
  // nudge for guests, or a checkout error. Never a silent no-op.
  const [note, setNote] = useState<{ tier: string; text: string; error?: boolean } | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const buy = async (plan: PlanHeader, lookupKey?: string) => {
    if (!CHECKOUT_OPEN) {
      setNote({ tier: plan.tier, text: CHECKOUT_CLOSED_NOTE });
      return;
    }
    if (!lookupKey || busyKey) return;
    if (!isSignedIn) {
      setNote({ tier: plan.tier, text: 'Sign in (free) first, plans attach to your account.' });
      return;
    }
    setNote(null);
    setBusyKey(lookupKey);
    try {
      // Always ask for the cross-app bundle: the server only applies the coupon when the
      // buyer actually holds a TCGScan tier (sibling verification) — a no-op for everyone
      // else. This is what makes tcgscan's reverse "save 60% on michi" deep link real.
      await startCheckout(lookupKey, { bundle: true, surface: 'plan_comparison' }); // navigates away on success
    } catch (e) {
      setNote({ tier: plan.tier, text: (e as Error).message });
    } finally {
      setBusyKey(null);
    }
  };

  const [freeHead, proHead] = PLAN_HEADERS;
  // Twelve months at the monthly rate, and what the yearly plan saves against it. Always true while
  // both prices are, so it needs no promotion behind it and nothing expires.
  const annualList = annualAnchor(proHead);
  const annualSaving = annualSavingPercent(proHead);
  // An account on the legacy Free caps reads ITS numbers in the Free column (CompareRow.freeLegacy).
  const freeCell = (row: (typeof COMPARISON)[number]) => (capSet === 'legacy_free' && row.freeLegacy ? row.freeLegacy : row.free);

  // Real prorated cost of each upgrade available to an existing subscriber, so the CTA can quote
  // a number instead of promising "you only pay the difference". Read-only on Stripe's side.
  // Keyed by lookup key; a plan with no entry simply renders without a price.
  const [previews, setPreviews] = useState<Record<string, PlanChangePreview>>({});
  /** Which plan column is awaiting an explicit confirm — nothing is charged on first click. */
  const [confirmSwitch, setConfirmSwitch] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  /** Tier we just paid to move onto; reload the page when the entitlement catches up. */
  const [awaitingTier, setAwaitingTier] = useState<string | null>(null);

  // FULL RELOAD once the switch lands, not just a state update. useTier has no shared cache —
  // every call site fetches independently — so polling refresh() here updated this component's
  // CTA row while the plan chip and usage meters elsewhere kept saying PRO until a manual
  // refresh. Owner hit exactly that after the first live upgrade. The reload fires when THIS
  // hook instance sees the new tier (webhooks lag by seconds), with a 15s fallback so a slow
  // webhook still lands somewhere honest.
  useEffect(() => {
    if (!awaitingTier || Platform.OS !== 'web') return;
    if (tier === awaitingTier) {
      window.location.reload();
      return;
    }
    const bail = setTimeout(() => window.location.reload(), 15000);
    const poll = setInterval(refresh, 1500);
    return () => {
      clearTimeout(bail);
      clearInterval(poll);
    };
  }, [awaitingTier, tier, refresh]);
  useEffect(() => {
    if (loading) return;
    // Only a paying subscriber has anything to prorate — planCta calls that case 'switch'.
    const upgrades = PLAN_HEADERS.filter(
      (p) => p.tier !== 'free' && planCta(p, tier, onTrial).kind === 'switch' && p.yearlyKey,
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
      .catch(() => {}); // a missing price is better than a wrong one, just omit it
    return () => {
      live = false;
    };
    // onTrial belongs here too: a trial holds no subscription, so it turns every 'switch' into a
    // purchase and there is nothing left to prorate. If it changes under an open page (a refresh
    // lands after checkout), the previews have to be recomputed rather than left as the trial's.
  }, [loading, tier, onTrial]);

  /**
   * One paid column's foot cell. What it offers depends entirely on the viewer's current plan
   * (see planCta): no downgrades, no active button on the plan you already hold, and upgrades
   * from a paid plan are a subscription SWITCH rather than a second purchase.
   */
  /** Free's foot cell. Never a purchase: a sign-up for guests, "your plan" for Free users, and
   *  nothing for subscribers (that would be a downgrade). Same planCta rules as the paid columns. */
  /**
   * The two column heads, as functions rather than inline JSX, because the phone layout needs the
   * same prices and the same "Your current plan" marker. Two copies of the sale/annual-saving
   * logic would drift the day one of them is edited, and the one nobody is looking at would be
   * the one quoting the wrong price. Plain functions, matching freeFoot/paidFoot below: a
   * component defined during render would remount on every keystroke.
   */
  const freeHeadBody = () => (
    <>
      <Text style={styles.tierName}>{freeHead.name}</Text>
      <Text style={styles.tierPrice}>{freeHead.price}</Text>
      <Text style={styles.tierSub}>{freeHead.sub}</Text>
      {!loading && tier === 'free' ? <Text style={styles.current}>Your current plan</Text> : null}
    </>
  );

  const proHeadBody = () => (
    <>
      <View style={styles.badgePro}>
        <Text style={styles.badgeProText}>{proHead.badge}</Text>
      </View>
      <Text style={styles.tierName}>{proHead.name}</Text>
      {/*
        WHAT THE STRUCK PRICE COMPARES AGAINST. On a bundle it is the list yearly price, because
        the bundle genuinely discounts it. Otherwise it is twelve months at the monthly rate,
        which is the honest thing an annual plan is cheaper than. Striking the yearly price
        against a coupon on itself flatters the number and expires.
      */}
      {onSaleYearly ? (
        <Text style={styles.tierWas}>{proHead.price}</Text>
      ) : annualList ? (
        <Text style={styles.tierWas}>{annualList}</Text>
      ) : null}
      <View style={styles.priceRow}>
        <Text style={styles.tierPrice}>
          {onSaleYearly && proHead.yearlyMinor
            ? formatMinor(promoPriceMinor(proHead.yearlyMinor, yearlyPercentOff))
            : proHead.price}
          <Text style={styles.tierPer}>{proHead.per}</Text>
        </Text>
        {!onSaleYearly && annualSaving ? (
          <View style={styles.saveSticker}>
            <Text style={styles.saveStickerText}>Save {annualSaving}%</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.tierSub}>{onSaleYearly ? saleSub(proHead, yearlyPercentOff) : proHead.sub}</Text>
      {!loading && tier === 'pro' ? <Text style={styles.current}>Your current plan</Text> : null}
    </>
  );

  /**
   * ONE CARD PER PLAN, PRO FIRST. A comparison table works by letting the eye travel sideways
   * between two columns; a phone has no sideways, so the comparison is carried by repeating each
   * capability's name inside both cards instead. PRO leads because it is what the page is for and
   * because it was the half that used to be off-screen entirely.
   */
  const planCards = () => (
    <View style={styles.phoneCards}>
      {[
        { key: 'pro', head: proHeadBody, cell: (row: (typeof COMPARISON)[number]) => row.pro, pro: true, foot: () => paidFoot(proHead) },
        { key: 'free', head: freeHeadBody, cell: (row: (typeof COMPARISON)[number]) => freeCell(row), pro: false, foot: freeFoot },
      ].map((col) => (
        <View key={col.key} style={[styles.phoneCard, col.pro && styles.phoneCardPro]} testID={`plan-card-${col.key}`}>
          <View style={styles.phoneHead}>{col.head()}</View>
          <View style={styles.phoneRows}>
            {COMPARISON.map((row) => (
              <View key={row.capability} style={[styles.phoneRow, row.highlight && styles.phoneRowHl]}>
                <Text style={[styles.phoneRowLabel, row.highlight && styles.hlLabel]}>
                  {row.capability}
                  {row.mark ? <Text style={styles.mark}>{row.mark}</Text> : ''}
                </Text>
                <View style={styles.phoneRowValue}>
                  <ValueCell cell={col.cell(row)} pro={col.pro} />
                </View>
              </View>
            ))}
          </View>
          <View style={styles.phoneFoot}>{col.foot()}</View>
        </View>
      ))}
    </View>
  );

  const freeFoot = () => {
    if (loading) return null;
    const cta = planCta(freeHead, tier);
    // A BUTTON, NOT A SENTENCE (owner, 2026-09-21). It told a guest what to do and gave them
    // nothing to press; the sign-in was a scroll away, in the header. Outlined rather than filled,
    // so PRO's button stays the loudest thing in the row.
    if (cta.kind === 'signIn') {
      return (
        <Pressable
          onPress={() => setAuthOpen(true)}
          accessibilityRole="button"
          testID="plans-free-signin"
          style={({ pressed }) => [styles.btnOutline, pressed && styles.dim]}>
          <Text style={styles.btnOutlineText}>Sign in free to start</Text>
        </Pressable>
      );
    }
    if (cta.kind === 'current') return <Text style={styles.footCurrent}>Your current plan</Text>;
    return null;
  };

  const paidFoot = (plan: PlanHeader) => {
    // Resolve nothing until the tier is known — a flash of "Choose PRO" at someone who already
    // pays for PRO is exactly the wrong first impression.
    if (loading) return <View style={styles.footPlaceholder} />;
    const cta = planCta(plan, tier, onTrial);

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

    // The confirm step for a plan change. Shows the exact amount that will be charged, because
    // this button moves money the moment it's pressed — there is no hosted page after it.
    if (isSwitch && confirmSwitch === plan.tier) {
      const price = preview ? formatMoney(preview.amountDue, preview.currency) : null;
      return (
        <View style={styles.switchConfirm}>
          <Text style={styles.switchConfirmText}>
            {price
              ? `Charge ${price} to your card on file now and move to ${plan.name} for the rest of your year?`
              : `Move to ${plan.name} for the rest of your year?`}
            {/* The PRORATED print total, from the same server maths that writes the ledger, 
                never the fresh-year number, which over-promised 36 to a mid-term upgrader. */}
            {preview?.termPrints != null
              ? ` You’ll have ${preview.termPrints} included prints for your year in total.`
              : ''}
          </Text>
          <View style={styles.switchRow}>
            <Pressable
              onPress={() => setConfirmSwitch(null)}
              disabled={switching}
              style={({ pressed }) => [styles.switchCancel, pressed && styles.dim]}>
              <Text style={styles.switchCancelText}>Not now</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                if (!key || switching) return;
                setSwitching(true);
                setNote(null);
                changePlan(key)
                  .then((r) => {
                    setConfirmSwitch(null);
                    setNote({
                      tier: plan.tier,
                      text: r.alreadyOnPlan
                        ? 'You’re already on this plan.'
                        : `You’re on ${plan.name}. Updating the page…`,
                    });
                    // Hand off to the reload effect above: poll until the entitlement lands,
                    // then reload the whole page so every surface agrees at once.
                    setAwaitingTier(plan.tier);
                  })
                  .catch((e) =>
                    setNote({ tier: plan.tier, text: (e as Error).message, error: true }),
                  )
                  .finally(() => setSwitching(false));
              }}
              disabled={switching}
              style={({ pressed }) => [styles.btn, styles.switchGo, (pressed || switching) && styles.dim]}>
              {switching ? (
                <ActivityIndicator color={Palette.accentText} />
              ) : (
                <Text style={styles.btnText}>{price ? `Pay ${price}` : 'Confirm'}</Text>
              )}
            </Pressable>
          </View>
          {note?.tier === plan.tier ? (
            <Text style={[styles.ctaNote, note.error && styles.ctaError]}>{note.text}</Text>
          ) : null}
        </View>
      );
    }

    return (
      <>
        <Pressable
          onPress={() => {
            // A switch must NEVER open Checkout — that starts a second subscription and bills
            // both plans. It goes through change_plan, which moves the existing subscription and
            // charges exactly the amount shown below the button. Confirm first: this takes money.
            if (isSwitch) {
              setConfirmSwitch(plan.tier);
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
              ? `${formatMoney(preview.amountDue, preview.currency)} to upgrade, prorated for the rest of your year`
              : 'Nothing to pay, your remaining credit covers it'}
          </Text>
        ) : null}
        {/* The month-to-month link is a NEW-subscription choice. Offering it on an upgrade would
            imply we can move an existing yearly plan onto monthly billing, which we can't yet. */}
        {CHECKOUT_OPEN && !isSwitch && plan.monthlyKey ? (
          <Pressable onPress={() => buy(plan, plan.monthlyKey)} disabled={!!busyKey} hitSlop={4}>
            <Text style={styles.monthlyLink}>
              {busyKey === plan.monthlyKey
                ? 'Opening checkout…'
                : onSaleMonthly && plan.monthlyMinor
                  ? `or ${formatMinor(promoPriceMinor(plan.monthlyMinor, monthlyPercentOff))} month to month`
                  : plan.monthlyLabel}
            </Text>
          </Pressable>
        ) : null}
        {note?.tier === plan.tier ? <Text style={styles.ctaNote}>{note.text}</Text> : null}
      </>
    );
  };

  return (
    // Everything in the block shares ONE width. The footnotes used to sit in the full shell
    // (1440 on this page) capped at 720 and left-aligned, while the table centred itself at
    // 1040 — so the fine print visibly failed to line up with the table above it.
    <View style={styles.block} onLayout={(e) => setBlockW(e.nativeEvent.layout.width)}>
      {phone ? planCards() : (
      <>
      {/* The indicator is hidden, not the scrolling: RN Web renders a horizontal ScrollView with
          a permanent scrollbar TRACK even when nothing overflows, which is the useless bar this
          table used to show at every width. Panning still works on genuinely narrow screens,
          where four columns cannot fit no matter how tight the table gets. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}>
        <View style={[styles.table, blockW > 0 && { width: Math.max(720, blockW) }]}>
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
              {/*
                WHAT THE STRUCK PRICE COMPARES AGAINST. On a bundle it is the list yearly price,
                because the bundle genuinely discounts it. Otherwise it is twelve months at the
                monthly rate, which is the honest thing an annual plan is cheaper than. Striking
                the yearly price against a coupon on itself flatters the number and expires.
              */}
              {onSaleYearly ? (
                <Text style={styles.tierWas}>{proHead.price}</Text>
              ) : annualList ? (
                <Text style={styles.tierWas}>{annualList}</Text>
              ) : null}
              <View style={styles.priceRow}>
                <Text style={styles.tierPrice}>
                  {onSaleYearly && proHead.yearlyMinor
                    ? formatMinor(promoPriceMinor(proHead.yearlyMinor, yearlyPercentOff))
                    : proHead.price}
                  <Text style={styles.tierPer}>{proHead.per}</Text>
                </Text>
                {!onSaleYearly && annualSaving ? (
                  <View style={styles.saveSticker}>
                    <Text style={styles.saveStickerText}>Save {annualSaving}%</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.tierSub}>{onSaleYearly ? saleSub(proHead, yearlyPercentOff) : proHead.sub}</Text>
              {!loading && tier === 'pro' ? <Text style={styles.current}>Your current plan</Text> : null}
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
                <ValueCell cell={freeCell(row)} />
              </View>
              <View style={[styles.cell, styles.proCol, row.highlight && styles.hlCellPro]}>
                <ValueCell cell={row.pro} pro />
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
          </View>
        </View>
      </ScrollView>
      </>
      )}

      {/* Everything the columns agreed on, said once instead of twice per row. */}
      <View style={styles.everyPlan}>
        <Text style={styles.everyPlanText}>
          <Text style={styles.everyPlanLead}>In every plan: </Text>
          {INCLUDED_EVERYWHERE.join(' · ')}
        </Text>
        <Text style={[styles.everyPlanText, styles.everyPlanNote]}>{EVERY_TIER_NOTE}</Text>
      </View>

      {/* ── footnotes ─────────────────────────────────────
          Folded away by default. Six paragraphs of small print were the last thing on the page,
          and the terms they carry (print pools, proration, what a one-time unlock covers) matter
          to someone comparing plans and to nobody else. Present, one tap away, not the closing
          impression. */}
      <Pressable
        onPress={() => setNotesOpen((v) => !v)}
        hitSlop={6}
        style={({ pressed }) => [styles.notesToggle, pressed && { opacity: 0.7 }]}>
        <Text style={styles.notesToggleText}>
          {notesOpen ? 'Hide the fine print ▴' : 'The fine print ▾'}
        </Text>
      </Pressable>
      <View style={[styles.footnotes, !notesOpen && styles.hidden]}>
        {FOOTNOTES.map((f, i) => (
          <Text key={f.mark || `note-${i}`} style={styles.footnote}>
            {f.mark ? <Text style={styles.mark}>{f.mark}</Text> : null}
            {f.text}
            {f.link ? (
              <Text
                style={styles.footnoteLink}
                // A TCGScan address carries the sign-in handoff; anything else opens plainly. The
                // handoff takes a moment to mint, so the label says so instead of sitting there.
                onPress={() => open(f.link!.url)}>
                {' '}
                {opening ? 'Opening…' : f.link.label}
              </Text>
            ) : null}
          </Text>
        ))}
      </View>
      <AuthSheet visible={authOpen} onClose={() => setAuthOpen(false)} />
    </View>
  );
}

/**
 * The shared width for the table, its footnotes, and anything on /plans that is supposed to line
 * up with it. Exported because the sections BELOW the table were capped at MaxContentWidth (800)
 * and centred, which inset their left edge by 120px against a 1040 table — close enough to look
 * like a mistake rather than a margin.
 */
export const PLAN_BLOCK_WIDTH = 1040;
const BLOCK_WIDTH = PLAN_BLOCK_WIDTH;

const styles = StyleSheet.create({
  everyPlan: { paddingTop: Spacing.three, paddingHorizontal: Spacing.two },
  everyPlanText: { color: Palette.muted, fontSize: FontSize.sm, lineHeight: 18 },
  everyPlanLead: { fontWeight: Weight.semibold, color: Palette.ink },
  /** The second line under the table: what no plan gates. Spaced off the first so the two
   *  read as separate facts rather than one run-on sentence. */
  everyPlanNote: { marginTop: 6 },
  notesToggle: { alignSelf: 'flex-start', paddingVertical: Spacing.two, paddingHorizontal: Spacing.two },
  notesToggleText: { color: Palette.link, fontSize: FontSize.sm, fontWeight: Weight.semibold },
  // display:none rather than unmounting: the marks in the table point at these, and a reader who
  // opens them should not have the page reflow underneath the row they were reading.
  hidden: { display: 'none' },
  block: { width: '100%', maxWidth: BLOCK_WIDTH, alignSelf: 'center' },
  // The block already caps the width, so the content container just fills it. (Horizontal
  // alignment inside a horizontal ScrollView is justifyContent, never alignSelf on the child —
  // alignSelf would move the table on the VERTICAL axis.)
  scroll: { flexGrow: 1 },
  // The plans page hands PageShell MaxContentWidthWide (1440), which this table would otherwise
  // fill edge to edge — sprawling on a large monitor and crowding the right column everywhere
  // else. maxWidth caps it ~13% below that and centres it; minWidth keeps four columns legible
  // before the ScrollView starts panning on narrow screens.
  // minWidth keeps four columns legible; below that the ScrollView pans, which is the right
  // trade on a narrow window. At full width the block cap means nothing overflows.
  table: { minWidth: 720, flex: 1, paddingTop: TAB_RISE },

  // ── the phone's two cards ──────────────────────────────────────────────────
  phoneCards: { gap: Spacing.three, paddingTop: Spacing.two },
  phoneCard: {
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
    borderRadius: Radius.lg,
    backgroundColor: Palette.surface,
    overflow: 'hidden',
  },
  /** The one being sold carries the accent, the way the PRO column does in the table. */
  phoneCardPro: { borderWidth: 2, borderColor: Palette.accent },
  phoneHead: { padding: Spacing.four, gap: 4, alignItems: 'flex-start' },
  phoneRows: { borderTopWidth: 1, borderTopColor: Palette.hairline },
  // Label left, value right, wrapping rather than clipping: some values are a sentence.
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: Spacing.two,
    paddingVertical: 10,
    paddingHorizontal: Spacing.four,
    borderBottomWidth: 1,
    borderBottomColor: Palette.hairline,
  },
  phoneRowHl: { backgroundColor: Palette.selectionSoft },
  phoneRowLabel: { fontSize: FontSize.body, color: Palette.ink2, flexShrink: 1, minWidth: 0 },
  phoneRowValue: { alignItems: 'flex-end', flexShrink: 0 },
  phoneFoot: { padding: Spacing.four },
  row: { flexDirection: 'row', alignItems: 'stretch' },

  cell: {
    flexGrow: 1,
    flexBasis: 0,
    // Flex items default to min-width:auto, i.e. they refuse to shrink below their content's
    // intrinsic width. With long capability sublines that pushed the whole table wider than its
    // shell and clipped the VIP column off the right edge. Allowing 0 lets the text wrap instead.
    minWidth: 0,
    paddingVertical: Spacing.three,
    // Tightened from `three` (16) to buy back horizontal room without touching column ratios.
    paddingHorizontal: Spacing.two,
    justifyContent: 'center',
    gap: 2,
    backgroundColor: Palette.surface,
    borderTopWidth: 1,
    borderTopColor: Palette.hairline,
  },
  // 0.85, down from 1.3. The capability labels are short ("Binders", "Sharing") and were taking
  // ~28% of the table; the plan columns carry the dense copy and need the room. This hands the
  // difference to the three plan columns, VIP most of all.
  labelCell: { flexGrow: 0.85, borderLeftWidth: 1, borderLeftColor: Palette.hairline },
  freeCol: { flexGrow: 1 },
  /**
   * THE FEATURED COLUMN IS FILLED, not just outlined. VIP used to carry the tint (see vipCol
   * below, kept for the styles it still shares); when VIP was retired PRO inherited its borders
   * and not its fill, which left the column we actually sell reading as plain white with a line
   * around it. accentSoft is the text-bearing tint, so labels on it still clear WCAG-AA.
   */
  /**
   * ONE COLUMN IS BLUE AND NOTHING ELSE IS. The first pass tinted the PRO column accentSoft AND
   * banded three rows in selectionSoft, which are nearly the same pale blue (#E7EEFD against
   * #e8f0fe): everything was faintly blue, so nothing read as featured. Blue now means exactly one
   * thing on this table, and the band went neutral to protect that.
   */
  proCol: {
    flexGrow: 1.1,
    backgroundColor: Palette.accentSoft,
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
    // DEEPER THAN THE BODY, which is how a pricing card is built: the plan and its price sit on a
    // stronger field, the capability list on a lighter one, and the eye starts at the price.
    backgroundColor: Palette.selectionTint,
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
  /** The plan name is a label above the price, not a headline: small, spaced, out of the way. */
  tierName: {
    fontSize: FontSize.label,
    fontWeight: Weight.bold,
    color: Palette.ink,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  /**
   * TABULAR FIGURES AND NEGATIVE TRACKING. $49.99 set in proportional digits beside a struck $72
   * wanders; tabular locks the columns of digits, and pulling the tracking in slightly is what
   * makes a large price read as one object rather than five characters.
   */
  tierPrice: {
    fontSize: FontSize.title,
    fontWeight: Weight.bold,
    color: Palette.ink,
    marginTop: 2,
    letterSpacing: -0.6,
    fontVariant: ['tabular-nums'],
  },
  // The struck list price above the sale figure: smaller and quieter, so the column still leads
  // with what you would actually pay, while leaving something to compare it against.
  tierWas: {
    fontSize: FontSize.sm,
    color: Palette.muted,
    textDecorationLine: 'line-through',
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  /** The price and its saving sticker share a baseline, so the sticker reads as part of the price. */
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, flexWrap: 'wrap' },
  /**
   * SOLID ACCENT, not a tint. The header field is selectionTint now, and a selectionSoft chip on
   * top of it is two near-identical blues with the saving lost between them. Reversed out on the
   * accent it is the second thing the eye finds, right after the price it modifies.
   */
  saveSticker: {
    backgroundColor: Palette.accent,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.two,
    paddingVertical: 3,
  },
  saveStickerText: {
    fontSize: FontSize.xs,
    fontWeight: Weight.bold,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: Palette.accentText,
  },
  tierPer: { fontSize: FontSize.label, fontWeight: Weight.medium, color: Palette.muted },
  tierSub: { fontSize: FontSize.sm, color: Palette.muted, lineHeight: 16 },
  current: { fontSize: FontSize.sm, fontWeight: Weight.semibold, color: Palette.link, marginTop: 4 },

  badgePro: {
    alignSelf: 'flex-start',
    backgroundColor: Palette.surface,
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
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, flexWrap: 'wrap' },
  value: { fontSize: FontSize.body, color: Palette.ink2, lineHeight: 19 },
  stamp: {
    borderRadius: Radius.pill,
    backgroundColor: Palette.selectionSoft,
    paddingHorizontal: Spacing.one + 2,
    paddingVertical: 1,
  },
  stampText: {
    fontSize: FontSize.xs,
    fontWeight: Weight.bold,
    color: Palette.link,
    fontVariant: ['tabular-nums'],
  },
  valueStrong: { fontWeight: Weight.semibold, color: Palette.ink },
  valueSub: { fontSize: FontSize.sm, color: Palette.muted, lineHeight: 16 },
  // The VIP column's text is the same dark ink ramp as every other light surface (owner call).
  vipText: { color: Palette.ink },
  vipSubText: { color: Palette.muted },
  mark: { color: Palette.link, fontWeight: Weight.bold },

  /* highlight rows */
  /**
   * NEUTRAL, not blue. These three rows are a band so they read as one block, but a blue band
   * beside a blue column is two blues competing and neither winning. panelAlt groups them without
   * spending the accent, which the PRO column needs all of.
   */
  hlCell: { backgroundColor: Palette.panelAlt },
  hlLabel: { color: Palette.ink },
  /**
   * The PRO cell inside a highlighted row. It cannot take hlCell: selectionSoft and accentSoft are
   * nearly the same pale blue, so the band would swallow the column exactly where the column is
   * making its case. selectionTint is the next step up, which keeps PRO the deepest thing in the
   * row it is winning.
   */
  /** Inside the band the PRO cell steps up too, so the column stays the deepest thing in it. */
  hlCellPro: { backgroundColor: Palette.selectionTint },
  /** PRO's Unlimited in the primary, so the column reads as the answer. */
  valueStrongPro: { color: Palette.link, fontWeight: Weight.bold },
  /** The Free side of a row PRO wins. Present, readable, and not competing for attention. */
  valueNo: { color: Palette.muted },
  /** The filled accent disc that replaces a bare tick glyph in the PRO column. */
  tick: {
    width: 22,
    height: 22,
    borderRadius: Radius.pill,
    backgroundColor: Palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickMark: {
    color: Palette.accentText,
    fontSize: FontSize.sm,
    fontWeight: Weight.bold,
    lineHeight: 16,
  },

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
    minHeight: 42,
    justifyContent: 'center',
    // A primary action on a tinted field needs to sit ON it, not in it.
    ...Shadows.page,
  },
  btnText: { color: Palette.accentText, fontSize: FontSize.body, fontWeight: Weight.semibold },
  /** The Free column's action: the same box as `btn`, drawn as an outline. */
  btnOutline: {
    borderRadius: Radius.pill,
    borderWidth: 1.5,
    borderColor: Palette.accent,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    minHeight: 42,
    justifyContent: 'center',
  },
  btnOutlineText: { color: Palette.accent, fontSize: FontSize.body, fontWeight: Weight.semibold },
  dim: { opacity: 0.7 },
  switchConfirm: { gap: Spacing.two, width: '100%' },
  switchConfirmText: {
    fontSize: FontSize.sm,
    color: Palette.ink,
    lineHeight: 17,
    textAlign: 'center',
  },
  switchRow: { flexDirection: 'row', gap: Spacing.two, alignItems: 'center' },
  switchGo: { flex: 1 },
  switchCancel: {
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 38,
  },
  switchCancelText: { color: Palette.link, fontSize: FontSize.sm, fontWeight: Weight.semibold },
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
  // A failed payment must not read like a muted aside — the first live failure went unnoticed.
  ctaError: { color: Palette.danger, fontWeight: Weight.semibold },
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

  /* footnotes — full block width, so they start on the table's left edge */
  footnotes: { gap: Spacing.one, marginTop: Spacing.three },
  footnote: { fontSize: FontSize.sm, color: Palette.muted, lineHeight: 18 },
  footnoteLink: { color: Palette.accent, fontWeight: Weight.semibold },
});
