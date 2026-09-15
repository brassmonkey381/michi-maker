/**
 * THE INSPECTOR'S CONTROLS: the rows every section is built from.
 *
 * These began life inside BinderScreen, spread across three modals (View, Binder details, Page
 * details) and the pocket colour dialog. They are here so the same rows can be laid out in a
 * modal today and in the docked inspector next (see the inspector plan, 2026-09-14), with no
 * layout of their own: a section is a column of rows, and whatever holds the section decides the
 * width, the scrolling and the chrome.
 */
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ColorField } from '@/components/binder/ColorField';
import { ThemedText } from '@/components/themed-text';
import { FontSize, Palette, Radius, Weight } from '@/constants/theme';
import { WEAR_NONE, isImageRef, resolveWear } from '@/data/pageStyle';
import { useTheme } from '@/hooks/use-theme';

/**
 * A NAMED GROUP OF ROWS (owner, 2026-09-15: "improve groupings"). The settings sheet had grown to
 * nine rows in one column with nothing saying which belonged together, so Zipper sat under Page
 * style as if it were one. A group gives a run of rows a heading and a rule above it, and an
 * optional note for the one thing a heading cannot say (that the view rows are yours, not the
 * binder's).
 */
export function Group({ title, note, children, testID }: { title: string; note?: string; children: React.ReactNode; testID?: string }) {
  return (
    <View style={styles.group} testID={testID}>
      <View style={styles.groupHead}>
        <Text style={styles.groupTitle}>{title}</Text>
        {note ? <Text style={styles.groupNote}>{note}</Text> : null}
      </View>
      <View style={styles.section}>{children}</View>
    </View>
  );
}

/** A labelled row: the name on the left, its controls wrapping after it. */
export function Row({ label, children, testID }: { label: string; children: React.ReactNode; testID?: string }) {
  return (
    <View style={styles.inlineRow} testID={testID}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.inlineLabel}>
        {label}
      </ThemedText>
      {children}
    </View>
  );
}

/** A segmented control: one of a short list, the chosen one lifted. */
export function Seg<T extends string>({
  options,
  value,
  onChange,
  labelOf,
}: {
  options: readonly { id: T; label: string; blurb?: string }[];
  value: T;
  onChange: (id: T) => void;
  /** The accessible name when the label alone does not say enough. */
  labelOf?: (o: { id: T; label: string; blurb?: string }) => string;
}) {
  return (
    <View style={styles.segGroup}>
      {options.map((o) => {
        const active = o.id === value;
        return (
          <Pressable
            key={o.id}
            onPress={() => onChange(o.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={labelOf ? labelOf(o) : o.blurb ? `${o.label}: ${o.blurb}` : o.label}
            style={[styles.seg, active && styles.segActive]}>
            <Text style={[styles.segText, active && styles.segTextActive]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A chip that is on or off, for a set where several can be on at once. */
export function ToggleChip({ label, on, onPress, accessibilityLabel }: { label: string; on: boolean; onPress: () => void; accessibilityLabel?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={accessibilityLabel ?? label}>
      <View style={[styles.chip, on && styles.chipActive]}>
        <Text style={[styles.chipText, on && styles.chipTextActive]}>{label}</Text>
      </View>
    </Pressable>
  );
}

export function PillButton({
  label,
  onPress,
  tone = 'default',
  disabled = false,
  active = false,
  testID,
}: {
  label: string;
  onPress: () => void;
  tone?: 'default' | 'danger';
  disabled?: boolean;
  /** The pill names the current state (a chosen option), not an action: outlined in the brand colour. */
  active?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      style={({ pressed }) => [
        styles.pill,
        tone === 'danger' && styles.pillDanger,
        active && styles.pillActive,
        pressed && styles.pressed,
        disabled && styles.pillDisabled,
      ]}>
      <Text style={[styles.pillText, tone === 'danger' && styles.pillTextDanger, active && styles.pillTextActive]}>{label}</Text>
    </Pressable>
  );
}

/** A colour swatch in the width every colour row shares, so the rows line up. */
export function ColorBox({ fieldKey, value, onChange }: { fieldKey: string; value?: string; onChange: (hex: string) => void }) {
  return (
    <View style={styles.colorFieldBox}>
      <ColorField key={fieldKey} value={value} onChange={onChange} />
    </View>
  );
}

/**
 * ONE ROW OF WHAT A POCKET WEARS: a sleeve colour, or an art backing, at the binder, the page or
 * the pocket. Three states (owner, 2026-09-14): a colour of its own, "None" (bare here even if the
 * layer above wears one), or nothing set, which inherits. The colour swatch always shows what is
 * in effect so the picker opens on it; `inherit` is the pill that hands the choice back up (absent
 * at the binder, which has nothing above it, so there "None" and clearing are the same thing).
 */
/**
 * A PICTURE BY LINK (owner, 2026-09-15). A field for an image address; it hands over the address
 * once it is one (http or https), on Enter or when the field is left, and never anything else, so
 * a half-typed link changes nothing. Shows the current picture's address when there is one.
 */
export function ImageLinkField({ value, onChange, testID }: { value?: string; onChange: (url: string) => void; testID?: string }) {
  const theme = useTheme();
  const [text, setText] = useState(isImageRef(value) ? value : '');
  // WHAT HAPPENED TO THE LINK (owner, 2026-09-15: "how do we know if it worked?"). The address is
  // applied the moment it is a complete http(s) link, with no Enter needed (a popover that closes
  // on an outside tap never got the blur), and a small preview of it reports whether the picture
  // loads: a page address or a host that refuses hotlinks fails here, in words, not in silence.
  // What the preview learned about an address, remembered with the address it is about, so a
  // result for the previous link never describes the next one.
  const [loaded, setLoaded] = useState<{ uri: string; ok: boolean } | null>(null);
  const trimmed = text.trim();
  const usable = isImageRef(trimmed);
  const status: 'idle' | 'loading' | 'ok' | 'failed' = !trimmed
    ? 'idle'
    : !usable
      ? 'failed'
      : loaded?.uri === trimmed
        ? loaded.ok
          ? 'ok'
          : 'failed'
        : 'loading';
  useEffect(() => {
    if (!usable || trimmed === value) return;
    const t = setTimeout(() => onChange(trimmed), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- apply once per typed address
  }, [trimmed]);
  const note =
    status === 'ok'
      ? 'Picture loaded. It is in use.'
      : status === 'failed'
        ? trimmed && !usable
          ? 'Paste a full link that starts with https://'
          : 'That link did not load. It needs to point straight at an image (a .jpg or .png address), and some sites refuse to be linked.'
        : status === 'loading'
          ? 'Loading the picture…'
          : 'Paste a direct link to an image.';
  return (
    <View style={styles.linkBox}>
      <View style={styles.linkRow}>
        {usable ? (
          <View style={styles.linkPreview}>
            <ColorPreview uri={trimmed} onLoad={() => setLoaded({ uri: trimmed, ok: true })} onError={() => setLoaded({ uri: trimmed, ok: false })} />
          </View>
        ) : null}
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="https://… image link"
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          testID={testID}
          style={[styles.fieldInput, styles.linkInput, { color: theme.text, borderColor: theme.backgroundSelected, backgroundColor: theme.backgroundElement }]}
        />
      </View>
      <Text style={[styles.linkNote, status === 'failed' && styles.linkNoteBad, status === 'ok' && styles.linkNoteGood]} testID={testID ? `${testID}-status` : undefined}>
        {note}
      </Text>
    </View>
  );
}

/** The link's picture, small, only to learn whether it loads. */
function ColorPreview({ uri, onLoad, onError }: { uri: string; onLoad: () => void; onError: () => void }) {
  return <Image source={{ uri }} style={styles.linkPreviewImg} contentFit="cover" cachePolicy="memory-disk" transition={0} onLoad={onLoad} onError={onError} />;
}

export function WearRow({
  label,
  fieldKey,
  own,
  above,
  inherit,
  onChange,
  testID,
}: {
  label: string;
  fieldKey: string;
  /** This layer's own value: a colour, a picture, WEAR_NONE, or nothing. */
  own: string | null | undefined;
  /** What the layers above resolve to, already reduced. */
  above?: string;
  /** Label of the hand-it-back pill, e.g. "Use binder's". Omit at the top layer. */
  inherit?: string;
  /** A colour, a picture, WEAR_NONE, or null to inherit. */
  onChange: (value: string | null) => void;
  testID?: string;
}) {
  const isNone = own === WEAR_NONE;
  const inEffect = resolveWear(own, above);
  const pictured = isImageRef(inEffect);
  // The link field shows when the value in effect IS a picture, or when asked for.
  const [linkOpen, setLinkOpen] = useState(false);
  const showLink = pictured || linkOpen;
  return (
    <View style={styles.wearRows}>
      <Row label={label}>
        <ColorBox fieldKey={`${fieldKey}-${isNone ? 'none' : pictured ? 'picture' : 'colour'}`} value={pictured ? undefined : (inEffect ?? '#ffffff')} onChange={onChange} />
        <PillButton label="Picture" active={pictured} onPress={() => setLinkOpen((v) => !v)} testID={testID ? `${testID}-picture` : undefined} />
        <PillButton label="None" active={isNone} onPress={() => onChange(inherit ? WEAR_NONE : null)} testID={testID ? `${testID}-none` : undefined} />
        {inherit && own ? <PillButton label={inherit} onPress={() => onChange(null)} testID={testID ? `${testID}-inherit` : undefined} /> : null}
      </Row>
      {showLink ? <ImageLinkField value={pictured ? inEffect : undefined} onChange={onChange} testID={testID ? `${testID}-link` : undefined} /> : null}
    </View>
  );
}

export function LabeledInput({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
  style,
  testID,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  multiline?: boolean;
  style?: object;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <View style={style}>
      <Text style={[styles.fieldMiniLabel, { color: theme.textSecondary }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        multiline={multiline}
        testID={testID}
        style={[
          styles.fieldInput,
          multiline && styles.fieldInputMulti,
          { color: theme.text, borderColor: theme.backgroundSelected, backgroundColor: theme.backgroundElement },
        ]}
      />
    </View>
  );
}

export const styles = StyleSheet.create({
  /** A section: rows down a column, the same gap the modals used. */
  section: { gap: 10, alignSelf: 'stretch' },
  /** Groups down a column: each brings its own rule, so nothing sits between them. */
  groups: { alignSelf: 'stretch' },
  /** A group: a rule, its name, then its rows. Groups stack with no extra gap; the rule is the gap. */
  group: { alignSelf: 'stretch', gap: 8, paddingTop: 10, paddingBottom: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Palette.hairline },
  groupHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: 8 },
  groupTitle: { fontSize: FontSize.xs, fontWeight: Weight.semibold, textTransform: 'uppercase', letterSpacing: 0.6, color: Palette.muted },
  groupNote: { fontSize: FontSize.xs, color: Palette.muted },
  inlineRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  /** A fixed column, so every row's first control starts at the same x whatever its name's length. */
  inlineLabel: { minWidth: 76, marginRight: 2 },
  colorFieldBox: { width: 170 },
  segGroup: { flexDirection: 'row', alignItems: 'center', backgroundColor: Palette.panel, borderRadius: Radius.pill, padding: 2 },
  seg: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: Radius.pill },
  segActive: {
    backgroundColor: Palette.surface,
    shadowColor: '#000000',
    shadowOpacity: 0.1,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  segText: { fontSize: FontSize.label, color: Palette.muted, fontWeight: Weight.medium },
  segTextActive: { color: Palette.ink, fontWeight: Weight.semibold },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: Radius.pill, backgroundColor: Palette.panel },
  chipActive: { backgroundColor: Palette.accent },
  chipText: { fontSize: FontSize.label, color: Palette.ink2 },
  chipTextActive: { color: Palette.accentText, fontWeight: Weight.semibold },
  pill: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: Radius.pill, backgroundColor: Palette.panel },
  pillDisabled: { opacity: 0.4 },
  pillDanger: { backgroundColor: Palette.dangerBg },
  pillActive: { backgroundColor: Palette.surface, borderWidth: 1.5, borderColor: Palette.accent, paddingVertical: 6.5, paddingHorizontal: 12.5 },
  pillText: { fontSize: FontSize.body, fontWeight: Weight.semibold, color: Palette.ink2 },
  pillTextDanger: { color: Palette.dangerAlt },
  pillTextActive: { color: Palette.accent },
  pressed: { opacity: 0.7 },
  fieldMiniLabel: { fontSize: FontSize.xs, fontWeight: Weight.semibold, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 },
  fieldInput: { borderWidth: 1, borderRadius: Radius.control, paddingHorizontal: 10, paddingVertical: 6, fontSize: FontSize.control },
  fieldInputMulti: { minHeight: 36, textAlignVertical: 'top' },
  /** A wear row and, under it, its picture link when one is wanted. */
  wearRows: { gap: 6, alignSelf: 'stretch' },
  linkBox: { gap: 4, alignSelf: 'stretch' },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  linkInput: { flex: 1, minWidth: 0, fontSize: FontSize.label },
  linkPreview: { width: 36, height: 36, borderRadius: Radius.control, overflow: 'hidden', backgroundColor: Palette.panel, borderWidth: 1, borderColor: Palette.hairline },
  linkPreviewImg: { width: 36, height: 36 },
  linkNote: { fontSize: FontSize.xs, color: Palette.muted, lineHeight: 15 },
  linkNoteBad: { color: Palette.dangerAlt },
  linkNoteGood: { color: Palette.ink2 },
});
