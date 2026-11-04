/**
 * THE MAT CUSTOMIZER (owner, 2026-11-03; data/matStyle.ts): what the art view's stock card looks
 * like. The paper (a colour, or a picture from the presets, the artists shelf, an upload or a
 * link), the ink, the face, and which lines of the card's data the mat carries.
 *
 * One panel at two levels: the binder's settings style every mat, and the page bar's Art view
 * popover styles one page's, with "Use binder's" to hand the choice back. The panel never knows
 * which: it shows `value` and reports a patch, and the host decides where the patch lands.
 */
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ArtistShelf } from '@/components/binder/ArtistShelf';
import { ArtUploadButton } from '@/components/binder/ArtUploadButton';
import { ColorBox, ImageLinkField, PillButton, Row, Seg, ToggleChip, styles } from '@/components/binder/inspector/controls';
import { PresetPictureGrid } from '@/components/binder/PresetPictureGrid';
import { FontSize, Palette } from '@/constants/theme';
import { DEFAULT_MAT_INK, DEFAULT_MAT_PAPER, MAT_FIELDS, MAT_FONTS, matFields, type MatStyle, type MatStylePatch } from '@/data/matStyle';

const MAT_NAMES: { id: 'card' | 'clean'; label: string }[] = [
  { id: 'card', label: 'As printed' },
  { id: 'clean', label: 'Species only' },
];

export function MatPanel({
  value,
  onChange,
  fieldKey,
  inherit,
  testID,
}: {
  /** The style in effect here (the page's own, or the binder's when the page has none). */
  value: MatStyle | undefined;
  onChange: (patch: MatStylePatch) => void;
  /** Re-keys the colour fields when the thing being styled changes. */
  fieldKey: string;
  /** At the page level: the pill that hands the mat back to the binder, shown when the page has its own. */
  inherit?: { label: string; own: boolean; onPress: () => void };
  testID?: string;
}) {
  const pictured = !!value?.picture;
  const [pickerOpen, setPickerOpen] = useState(false);
  const showPicker = pictured || pickerOpen;
  const shown = matFields(value);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const toggle = (id: (typeof MAT_FIELDS)[number]['id']) => {
    const next = shown.includes(id) ? shown.filter((f) => f !== id) : [...shown, id];
    onChange({ fields: next });
  };
  return (
    <View style={styles.wearRows} testID={testID}>
      <Row label="Paper">
        <ColorBox fieldKey={`${fieldKey}-paper`} value={value?.paper ?? DEFAULT_MAT_PAPER} onChange={(paper) => onChange({ paper })} />
        <PillButton label="Picture" active={pictured} onPress={() => setPickerOpen((v) => !v)} testID={testID ? `${testID}-picture` : undefined} />
        {pictured ? <PillButton label="No picture" onPress={() => onChange({ picture: null })} testID={testID ? `${testID}-no-picture` : undefined} /> : null}
        {inherit?.own ? <PillButton label={inherit.label} onPress={inherit.onPress} testID={testID ? `${testID}-inherit` : undefined} /> : null}
      </Row>
      {showPicker ? <PresetPictureGrid kind="texture" value={value?.picture} onPick={(picture) => onChange({ picture })} testID={testID ? `${testID}-presets` : undefined} /> : null}
      {showPicker ? <ArtistShelf surface="mat" value={value?.picture} onPick={(picture) => onChange({ picture })} testID={testID ? `${testID}-artists` : undefined} /> : null}
      {showPicker ? (
        <View style={local.uploadRow}>
          <ArtUploadButton
            onUploaded={(picture) => {
              setUploadError(null);
              onChange({ picture });
            }}
            onError={setUploadError}
          />
          <Text style={local.note}>{uploadError ?? 'A picture of your own, over the paper.'}</Text>
        </View>
      ) : null}
      {showPicker ? <ImageLinkField value={value?.picture} onChange={(picture) => onChange({ picture })} testID={testID ? `${testID}-link` : undefined} /> : null}
      <Row label="Ink">
        <ColorBox fieldKey={`${fieldKey}-ink`} value={value?.ink ?? DEFAULT_MAT_INK} onChange={(ink) => onChange({ ink })} />
      </Row>
      <Row label="Name" testID={testID ? `${testID}-name` : undefined}>
        <Seg options={MAT_NAMES} value={value?.name ?? 'card'} onChange={(name) => onChange({ name: name === 'clean' ? 'clean' : null })} />
      </Row>
      <Row label="Font" testID={testID ? `${testID}-font` : undefined}>
        <Seg options={MAT_FONTS} value={value?.font ?? 'serif'} onChange={(font) => onChange({ font: font === 'serif' ? null : font })} />
      </Row>
      <Row label="Lines" testID={testID ? `${testID}-fields` : undefined}>
        <View style={local.chips}>
          {MAT_FIELDS.map((f) => (
            <ToggleChip key={f.id} label={f.label} on={shown.includes(f.id)} onPress={() => toggle(f.id)} accessibilityLabel={`${f.label}: ${f.blurb}`} />
          ))}
        </View>
      </Row>
      <Text style={local.note}>The name always shows; Species only cleans it to the Pokémon it is a card of. HP and Rarity sit beside the name. Lines that do not fit a small pocket are left off, as before.</Text>
    </View>
  );
}

const local = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, flexShrink: 1 },
  uploadRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  note: { flex: 1, fontSize: FontSize.xs, color: Palette.muted, lineHeight: 15 },
});
