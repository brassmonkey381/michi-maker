/**
 * MIC-073: THE ONE-TIME HOLIDAY POP-UP (owner review 2026-11-25). Two versions, never both:
 *   - not on a paid plan (guests included) and able to start the holiday trial: thank-you note,
 *     "PRO free until Jan 1", and invite friends for free print codes;
 *   - a paying subscriber: "a special thank you for being a paid subscriber, and their free binder
 *     print codes" (2 codes, a year each). Room for a later extra: add a line to THANKS_LINES.
 * Shown once per browser, a few seconds after the page settles, through the prompt queue so it
 * never stacks on another uninvited dialog. Web only; never on scripted QA visits.
 */
import { useRouter, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { DialogCard } from '@/components/ui/DialogCard';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { syncPrintCodes } from '@/data/checkout';
import { HOLIDAY_CTA_LABEL, holidayActive } from '@/data/holiday';
import { fetchReferralSummary, type PrintCode } from '@/data/referrals';
import { useHolidayTrial } from '@/hooks/use-holiday-trial';
import { useTier } from '@/hooks/use-tier';
import { useTrial } from '@/hooks/use-trial';
import { track } from '@/lib/analytics';
import { endTurn, takeTurn } from '@/lib/promptQueue';
import { useAuth } from '@/store/auth';

const SEEN_KEY = 'michi.holiday2026.popup';
const TURN = 'holiday-popup';
/** Later extras for subscribers go here, one line each. */
const THANKS_LINES: string[] = [];

function seen(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return true;
  }
}
function markSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    // private window: it may show again next visit, which is acceptable
  }
}
function isQaVisit(): boolean {
  try {
    const q = new URL(window.location.href).searchParams;
    return q.get('utm_medium') === 'qa' || q.has('checkout');
  } catch {
    return true;
  }
}

export type HolidayPopupVariant = 'offer' | 'thanks';

/** The dialog itself, with no data access (the preview draws it with demo codes). */
export function HolidayPopupView({
  variant,
  codes,
  onPrimary,
  onClose,
}: {
  variant: HolidayPopupVariant;
  codes: string[];
  onPrimary: () => void;
  onClose: () => void;
}) {
  return (
    <DialogCard title={variant === 'thanks' ? 'Thank you' : 'Happy holidays'} onClose={onClose} maxWidth={420}>
      <View style={styles.body} testID={`holiday-popup-${variant}`}>
        {variant === 'thanks' ? (
          <>
            <Text style={styles.head}>You keep Michi running</Text>
            <ThemedText type="small">
              A special thank you for being a paid subscriber. Here are two free binder print codes, good for a year.
              Use them yourself or give one to a friend.
            </ThemedText>
            {codes.length ? (
              <View style={styles.codes}>
                {codes.map((c) => (
                  <Text key={c} style={styles.code} selectable>
                    {c}
                  </Text>
                ))}
              </View>
            ) : (
              <ThemedText type="small" themeColor="textSecondary">
                Your codes are on the &quot;Invite Friends&quot; page.
              </ThemedText>
            )}
            {THANKS_LINES.map((l) => (
              <ThemedText key={l} type="small">
                {l}
              </ThemedText>
            ))}
            <ThemedText type="small" themeColor="textSecondary">
              In a binder&apos;s print sheet, press &quot;Unlock this binder&quot;, then enter a code under &quot;Add
              promotion code&quot; at checkout.
            </ThemedText>
          </>
        ) : (
          <>
            <Text style={styles.head}>Thank you for building with us</Text>
            <ThemedText type="small">This community made Michi what it is. Here&apos;s a little something back:</ThemedText>
            <ThemedText type="small">
              <Text style={styles.strong}>PRO free until Jan 1.</Text> Start the free trial and keep PRO through the
              holidays.
            </ThemedText>
            <ThemedText type="small">
              <Text style={styles.strong}>Invite friends:</Text> each friend who starts the free trial earns you a free
              binder print code.
            </ThemedText>
          </>
        )}
        <Pressable
          onPress={onPrimary}
          accessibilityRole="button"
          testID="holiday-popup-primary"
          style={({ pressed }) => [styles.btn, pressed && styles.dim]}>
          <Text style={styles.btnText}>{variant === 'thanks' ? 'See my codes' : HOLIDAY_CTA_LABEL}</Text>
        </Pressable>
        <Pressable onPress={onClose} accessibilityRole="button" style={({ pressed }) => [styles.btnQuiet, pressed && styles.dim]}>
          <Text style={styles.btnQuietText}>Maybe later</Text>
        </Pressable>
      </View>
    </DialogCard>
  );
}

export function HolidayPopup() {
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const { isPaid, loading: tierLoading } = useTier();
  const trial = useTrial();
  const holiday = useHolidayTrial();
  const [open, setOpen] = useState<HolidayPopupVariant | null>(null);
  const [codes, setCodes] = useState<string[]>([]);

  const web = Platform.OS === 'web' && typeof window !== 'undefined';
  const paidPlan = isPaid && trial.state !== 'active';
  const variant: HolidayPopupVariant | null = !web || !holidayActive() || tierLoading || holiday.loading
    ? null
    : paidPlan
      ? 'thanks'
      : holiday.eligible
        ? 'offer'
        : null;

  useEffect(() => {
    if (!variant || seen() || isQaVisit()) return;
    const t = setTimeout(() => {
      if (seen() || !takeTurn(TURN)) return;
      setOpen(variant);
      track('holiday.popup_shown', { variant });
      if (variant === 'thanks' && isSignedIn) {
        void syncPrintCodes()
          .then(() => fetchReferralSummary())
          .then((s) =>
            setCodes(
              s.printCodes
                .filter((c: PrintCode) => c.reason === 'subscriber_thanks' && c.state === 'ready' && c.code)
                .map((c: PrintCode) => c.code!),
            ),
          )
          .catch(() => {});
      }
    }, 3000);
    return () => clearTimeout(t);
  }, [variant, isSignedIn]);

  if (!open) return null;
  const close = () => {
    markSeen();
    setOpen(null);
    endTurn(TURN);
  };
  return (
    <HolidayPopupView
      variant={open}
      codes={codes}
      onClose={close}
      onPrimary={() => {
        track('holiday.popup_cta', { variant: open });
        close();
        router.push((open === 'thanks' ? '/invite' : '/plans') as Href);
      }}
    />
  );
}

const styles = StyleSheet.create({
  body: { gap: Spacing.two },
  head: { fontSize: FontSize.lg, fontWeight: Weight.bold, color: Palette.ink },
  strong: { fontWeight: Weight.bold },
  codes: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  code: {
    fontSize: 20,
    fontWeight: Weight.bold,
    letterSpacing: 3,
    color: Palette.ink,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Palette.accent,
    borderRadius: Radius.control,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  btn: {
    minHeight: 44,
    borderRadius: Radius.control,
    backgroundColor: Palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.two,
  },
  btnText: { color: Palette.accentText, fontSize: FontSize.md, fontWeight: Weight.bold },
  btnQuiet: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  btnQuietText: { color: Palette.ink, fontSize: FontSize.control, fontWeight: Weight.semibold },
  dim: { opacity: 0.7 },
});
