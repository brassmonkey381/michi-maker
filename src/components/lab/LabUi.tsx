/**
 * The owner labs' building blocks (MIC-080): the admin gate, a 44 pt button, a panel, a 13 pt
 * monospace line and a fold. Theme tokens only.
 */
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import NotFound from '@/app/+not-found';
import { PageShell } from '@/components/layout/PageShell';
import { ThemedText } from '@/components/themed-text';
import { FontSize, MaxContentWidthWide, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { useIsAdmin } from '@/lib/useIsAdmin';

/** Admins see the page; everyone else gets the ordinary not-found page, and nothing is fetched. */
export function LabGate({ title, children }: { title: string; children: () => ReactNode }) {
  const ok = useIsAdmin();
  if (ok === null) {
    return (
      <PageShell title={title} maxWidth={MaxContentWidthWide}>
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      </PageShell>
    );
  }
  if (!ok) return <NotFound />;
  return (
    <PageShell title={title} maxWidth={MaxContentWidthWide} footer={false} keyboardShouldPersistTaps="handled">
      <Head1 text={title} />
      {children()}
    </PageShell>
  );
}

function Head1({ text }: { text: string }) {
  return (
    <ThemedText type="title" style={styles.h1}>
      {text}
    </ThemedText>
  );
}

export function LabButton({
  label,
  onPress,
  busy,
  disabled,
  tone = 'plain',
  testID,
  a11yLabel,
}: {
  label: string;
  /** What a screen reader says, when the visible label is short. */
  a11yLabel?: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  tone?: 'plain' | 'primary' | 'good' | 'bad';
  testID?: string;
}) {
  const off = disabled || busy;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel ?? label}
      testID={testID}
      style={({ pressed }) => [
        styles.btn,
        tone === 'primary' && styles.btnPrimary,
        tone === 'good' && styles.btnGood,
        tone === 'bad' && styles.btnBad,
        (pressed || off) && styles.dim,
      ]}>
      {busy ? <ActivityIndicator size="small" color={tone === 'plain' ? undefined : Palette.white} /> : null}
      <Text style={[styles.btnText, tone !== 'plain' && styles.btnTextOn]}>{label}</Text>
    </Pressable>
  );
}

export function LabInput(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={Palette.muted}
      autoCorrect={false}
      autoCapitalize="none"
      {...props}
      style={[styles.input, props.multiline && styles.inputMulti, props.style]}
    />
  );
}

export function Panel({ title, sub, children, testID }: { title: string; sub?: string; children?: ReactNode; testID?: string }) {
  return (
    <View style={styles.panel} testID={testID}>
      <ThemedText type="smallBold">{title}</ThemedText>
      {sub ? <Text style={styles.sub}>{sub}</Text> : null}
      {children}
    </View>
  );
}

/** A 13 pt line of monospace, selectable on the web. */
export function Mono({ children, tone }: { children: ReactNode; tone?: 'muted' | 'danger' | 'ok' }) {
  return (
    <Text selectable style={[styles.mono, tone === 'muted' && styles.muted, tone === 'danger' && styles.danger, tone === 'ok' && styles.ok]}>
      {children}
    </Text>
  );
}

export function Line({ children, bold, tone }: { children: ReactNode; bold?: boolean; tone?: 'muted' | 'danger' }) {
  return <Text selectable style={[styles.line, bold && styles.bold, tone === 'muted' && styles.muted, tone === 'danger' && styles.danger]}>{children}</Text>;
}

/** A fold: a 44 pt header that opens and closes its body. */
export function Fold({ title, children, initiallyOpen = false }: { title: string; children: () => ReactNode; initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <View style={styles.fold}>
      <Pressable onPress={() => setOpen((o) => !o)} accessibilityRole="button" style={({ pressed }) => [styles.foldHead, pressed && styles.dim]}>
        <Text style={[styles.line, styles.bold]}>{`${open ? 'Hide' : 'Show'} ${title}`}</Text>
      </Pressable>
      {open ? children() : null}
    </View>
  );
}

export const labStyles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, alignItems: 'center' },
  grow: { flexGrow: 1, flexShrink: 1, minWidth: 0 },
});

const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' });

const styles = StyleSheet.create({
  center: { paddingVertical: Spacing.five, alignItems: 'center' },
  h1: { fontSize: FontSize.title, lineHeight: 30, marginBottom: Spacing.three },
  btn: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.control,
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
    backgroundColor: Palette.panel,
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimary: { backgroundColor: Palette.accent, borderColor: Palette.accent },
  btnGood: { backgroundColor: Palette.success, borderColor: Palette.success },
  btnBad: { backgroundColor: Palette.danger, borderColor: Palette.danger },
  btnText: { fontSize: FontSize.body, fontWeight: Weight.semibold, color: Palette.ink },
  btnTextOn: { color: Palette.white },
  dim: { opacity: 0.6 },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: Palette.controlBorder,
    borderRadius: Radius.control,
    paddingHorizontal: Spacing.three,
    fontSize: FontSize.md,
    color: Palette.ink,
    backgroundColor: Palette.surface,
  },
  inputMulti: { minHeight: 160, paddingVertical: Spacing.two, fontSize: FontSize.label, fontFamily: mono, textAlignVertical: 'top' },
  panel: {
    borderWidth: 1,
    borderColor: Palette.hairline,
    borderRadius: Radius.control,
    backgroundColor: Palette.panel,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  sub: { fontSize: FontSize.label, color: Palette.muted },
  mono: { fontFamily: mono, fontSize: FontSize.label, lineHeight: 19, color: Palette.ink2 },
  line: { fontSize: FontSize.body, lineHeight: 20, color: Palette.ink },
  bold: { fontWeight: Weight.semibold },
  muted: { color: Palette.muted },
  danger: { color: Palette.danger },
  ok: { color: Palette.success },
  fold: { gap: Spacing.two },
  foldHead: { minHeight: 44, justifyContent: 'center' },
});
