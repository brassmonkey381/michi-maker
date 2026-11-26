/**
 * MIC-069 (owner review 2026-11-25): the print sheet says where a free print code goes, instead
 * of a "Use a free print" button. Codes are Stripe promotion codes for the binder PDF, entered at
 * checkout; anyone can use one, so the note shows for everyone on the web.
 */
import { Platform, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';

export function PrintCodeNote() {
  if (Platform.OS !== 'web') return null;
  return (
    <ThemedText type="small" themeColor="textSecondary" style={styles.note} testID="print-code-note">
      Have a free print code? Press &quot;Unlock this binder&quot;, then enter it at checkout under &quot;Add promotion
      code&quot;. The total goes to $0.00.
    </ThemedText>
  );
}

const styles = StyleSheet.create({ note: { fontSize: 13 } });
