/**
 * MIC-069 (owner 2026-11-25): "refund voids the print codes. Let the user(s) know this with a
 * warning message before they cancel." Sits right above "Manage billing" (where cancelling and
 * refunds start) for an account whose payment, as an invited friend, earned free prints.
 * Cancelling itself takes nothing back; only a refund of that payment does.
 */
import { useEffect, useState } from 'react';
import { Platform, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Palette } from '@/constants/theme';
import { fetchReferralSummary } from '@/data/referrals';
import { HOLIDAY_CANCEL_NOTE } from '@/data/holiday';
import { useHolidayTrial } from '@/hooks/use-holiday-trial';
import { useAuth } from '@/store/auth';

export function RefundPrintWarning() {
  const { isSignedIn } = useAuth();
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!isSignedIn || Platform.OS !== 'web') return;
    let live = true;
    fetchReferralSummary()
      .then((s) => live && setShow(s.invitedStatus === 'paid'))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [isSignedIn]);
  if (!show) return null;
  return (
    <ThemedText type="small" themeColor="textSecondary" style={styles.note} testID="refund-print-warning">
      Before you cancel: cancelling keeps your free print codes. If your payment is refunded, the unused codes it
      earned stop working, for you and for the friend who invited you.
    </ThemedText>
  );
}

/**
 * MIC-073 (owner review): the cancel rule of the holiday trial, said where cancelling starts.
 * Shown only to an account on a holiday trial right now.
 */
export function HolidayCancelWarning() {
  const holiday = useHolidayTrial();
  if (!holiday.onHolidayTrial) return null;
  return (
    <ThemedText type="small" style={[styles.note, styles.warn]} testID="holiday-cancel-warning">
      {`Your free trial runs until Jan 1. ${HOLIDAY_CANCEL_NOTE} Your account goes back to free, and you can start PRO again later at the regular price.`}
    </ThemedText>
  );
}

const styles = StyleSheet.create({ note: { fontSize: 13 }, warn: { color: Palette.warning ?? Palette.ink } });
