/**
 * MIC-069 (owner 2026-11-25): "refund voids the print codes. Let the user(s) know this with a
 * warning message before they cancel." Sits right above "Manage billing" (where cancelling and
 * refunds start) for an account whose payment, as an invited friend, earned free prints.
 * Cancelling itself takes nothing back; only a refund of that payment does.
 */
import { useEffect, useState } from 'react';
import { Platform, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { fetchReferralSummary } from '@/data/referrals';
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

const styles = StyleSheet.create({ note: { fontSize: 13 } });
