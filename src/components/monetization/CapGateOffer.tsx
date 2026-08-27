/**
 * The upgrade moment AT A WALL — the trial when we can offer it, the upgrade note when we can't.
 *
 * WHY THIS EXISTS. For three weeks the 14-day PRO trial lived in exactly two places: /plans and
 * the print gate. Fourteen people ever saw it, twelve of them within twenty-five minutes of
 * signing up — holding one binder, blocked by nothing, with no idea yet what PRO would be for.
 * Nobody started one. Meanwhile the moment a free user actually hits the 3-binder cap, the app
 * showed a toast and a grey "Upgrade" button pointing at a plans page almost nobody reads.
 *
 * A cap gate is the only place in this product where the user has already told us what they want
 * and been refused. That is where the offer belongs, and (owner call, 2026-08-27) that is the ONLY
 * place it belongs: no time-based nudges, no "you've made two binders" banners. A wall, or nothing.
 *
 * The trial is PRO, so only use this on a wall PRO actually opens — binders (3 → 12), pages per
 * binder (16 → 40), artworks (100 → 1000). On a VIP-only feature the trial would unlock nothing
 * and the offer would be a lie; those keep the plain UpgradePerk.
 *
 * `surface` MUST be the same CapSurface string the gate's trackCapGate() call passes, or the
 * gate → offer → trial funnel stops joining (see trackCapGate in src/lib/analytics.ts).
 */
import { TrialCta, trialOfferVisible } from '@/components/monetization/TrialCta';
import { UpgradePerk } from '@/components/monetization/UpgradePerk';
import { useTrial } from '@/hooks/use-trial';
import type { CapSurface } from '@/lib/analytics';

export function CapGateOffer({
  /** The wall, in the user's terms — used as-is for the upgrade note. */
  message,
  /** The same wall phrased as what the trial opens. Falls back to `message`. */
  trialMessage,
  surface,
  /** Upgrade-note button label (the trial has its own). */
  cta,
  /** Close the covering sheet first, so the plans page — or the unlocked app — is actually visible. */
  onBeforePress,
}: {
  message: string;
  trialMessage?: string;
  surface: CapSurface;
  cta?: string;
  onBeforePress?: () => void;
}) {
  const trial = useTrial();

  // Not `<TrialCta/>` plus a fallback rendered blind: TrialCta returns null for the ineligible, so
  // drawing both would stack two notes on the one screen for everybody who can still be sold to.
  if (trialOfferVisible(trial)) {
    return (
      <TrialCta message={trialMessage ?? message} surface={surface} onBeforeStart={onBeforePress} />
    );
  }
  return <UpgradePerk message={message} cta={cta} onBeforePress={onBeforePress} />;
}
