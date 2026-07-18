/**
 * Report a public binder — the viewer-facing half of the takedown flow (see
 * docs/roadmap/ART-RIGHTS.md). Pick a reason, optionally add detail (for copyright: who holds the
 * rights + a link), submit. The report lands in `content_reports` for the owner to action.
 *
 * Honest UX: on success we thank the reporter and close; a failed insert shows the error, never a
 * dead spinner. Guests can file (they're anonymous-authenticated).
 */
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { sheet } from '@/constants/ui';
import { submitContentReport, type ReportReason } from '@/data/reportRepo';

const REASONS: { key: ReportReason; label: string; hint: string }[] = [
  { key: 'copyright', label: 'Copyright / uses art without permission', hint: 'Tell us who holds the rights and link the original, if you can.' },
  { key: 'inappropriate', label: 'Inappropriate or abusive content', hint: 'What about this binder breaks the rules?' },
  { key: 'other', label: 'Something else', hint: 'Add any detail that helps us look into it.' },
];

export function ReportSheet({ binderId, onClose }: { binderId: string; onClose: () => void }) {
  const [reason, setReason] = useState<ReportReason>('copyright');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    submitContentReport(binderId, reason, details)
      .then(() => setDone(true))
      .catch((e) => setError((e as Error).message))
      .finally(() => setBusy(false));
  };

  const hint = REASONS.find((r) => r.key === reason)?.hint ?? '';

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={sheet.dialogBackdrop} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.cardWrap}>
          <ThemedView type="backgroundElement" style={sheet.dialogCard}>
            <View style={styles.header}>
              <ThemedText type="subtitle" style={styles.title}>
                Report this binder
              </ThemedText>
              <Pressable onPress={onClose} hitSlop={8}>
                <ThemedText type="link" themeColor="textSecondary">
                  Close
                </ThemedText>
              </Pressable>
            </View>

            {done ? (
              <>
                <ThemedText type="small" themeColor="textSecondary" style={styles.body}>
                  Thanks — your report is in. We review reports and remove content that breaks the
                  rules or that a rights holder asks us to take down. Rights holders can also file a
                  formal notice on our DMCA page.
                </ThemedText>
                <Pressable onPress={onClose} style={styles.btn}>
                  <Text style={styles.btnText}>Done</Text>
                </Pressable>
              </>
            ) : (
              <>
                <ThemedText type="small" themeColor="textSecondary" style={styles.body}>
                  Reporting helps keep michi-maker honest. If you hold the rights to art shown here,
                  you can also file a formal takedown on our DMCA page.
                </ThemedText>

                <View style={styles.reasons}>
                  {REASONS.map((r) => {
                    const active = r.key === reason;
                    return (
                      <Pressable
                        key={r.key}
                        onPress={() => setReason(r.key)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: active }}
                        style={[styles.reasonRow, active && styles.reasonRowActive]}>
                        <View style={[styles.radio, active && styles.radioOn]}>
                          {active ? <View style={styles.radioDot} /> : null}
                        </View>
                        <ThemedText type="small" style={styles.reasonLabel}>
                          {r.label}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </View>

                <TextInput
                  value={details}
                  onChangeText={setDetails}
                  placeholder={hint}
                  placeholderTextColor={Palette.muted3}
                  multiline
                  style={styles.input}
                />

                <Pressable onPress={submit} disabled={busy} style={({ pressed }) => [styles.btn, (pressed || busy) && styles.dim]}>
                  {busy ? <ActivityIndicator color={Palette.accentText} /> : <Text style={styles.btnText}>Submit report</Text>}
                </Pressable>

                {error ? (
                  <ThemedText type="small" style={styles.error}>
                    {error}
                  </ThemedText>
                ) : null}
              </>
            )}
          </ThemedView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  cardWrap: { width: '100%', maxWidth: 440 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: FontSize.h2, lineHeight: 26 },
  body: { lineHeight: 19 },
  reasons: { gap: Spacing.one, marginTop: Spacing.one },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.control,
  },
  reasonRowActive: { backgroundColor: Palette.selectionSoft },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: Palette.hairlineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: Palette.accent },
  radioDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: Palette.accent },
  reasonLabel: { flex: 1, lineHeight: 18 },
  input: {
    minHeight: 72,
    borderWidth: 1,
    borderColor: Palette.controlBorder,
    borderRadius: Radius.control,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: FontSize.body,
    color: Palette.ink,
    backgroundColor: Palette.surface,
    textAlignVertical: 'top',
  },
  btn: {
    backgroundColor: Palette.accent,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  btnText: { color: Palette.accentText, fontSize: FontSize.md, fontWeight: Weight.semibold },
  dim: { opacity: 0.6 },
  error: { color: Palette.danger, lineHeight: 18 },
});
