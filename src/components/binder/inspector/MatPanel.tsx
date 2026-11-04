/**
 * THE MAT CUSTOMIZER (owner, 2026-11-03; data/matStyle.ts): what the art view's stock card looks
 * like. The paper (a colour, or a picture from the presets, the artists shelf, an upload or a
 * link), the ink, the face, which lines of the card's data the mat carries, how each section
 * sits, and how the ink stays readable over a busy picture: an outline, a scrim, or an ink that
 * follows the picture (owner, 2026-11-03: "ship them all as options for the user to pick from").
 *
 * One panel at two levels: the binder's settings style every mat, and the page bar's Art view
 * popover styles one page's, with "Use binder's" to hand the choice back. The panel never knows
 * which: it shows `value` and reports a patch, and the host decides where the patch lands.
 */
import { useState } from 'react';
import { Image as RNImage, StyleSheet, Text, View } from 'react-native';

import { ArtistShelf } from '@/components/binder/ArtistShelf';
import { ArtUploadButton } from '@/components/binder/ArtUploadButton';
import { ColorBox, ImageLinkField, PillButton, Row, Seg, ToggleChip, styles } from '@/components/binder/inspector/controls';
import { PresetPictureGrid } from '@/components/binder/PresetPictureGrid';
import { FontSize, Palette } from '@/constants/theme';
import { DEFAULT_MAT_INK, DEFAULT_MAT_PAPER, MAT_ALIGNS, MAT_FIELDS, MAT_FONTS, MAT_SCRIMS, matFields, spreadFits, spreadMinimum, type MatAlign, type MatName, type MatStyle, type MatStylePatch } from '@/data/matStyle';

const MAT_NAMES: { id: MatName; label: string }[] = [
  { id: 'card', label: 'As printed' },
  { id: 'clean', label: 'Species only' },
  { id: 'none', label: 'None' },
];

const MAT_HALOS: { id: 'off' | 'thin' | 'wide'; label: string; blurb: string }[] = [
  { id: 'off', label: 'Off', blurb: 'No outline.' },
  { id: 'thin', label: 'Thin', blurb: 'A thin outline round every line, in the paper colour.' },
  { id: 'wide', label: 'Wide', blurb: 'A wider outline, and the small lines in the full ink.' },
];

/** The stock layout, then the three sides (matStyle.ts MatAlign). */
const SECTION_ALIGNS: { id: 'stock' | MatAlign; label: string }[] = [{ id: 'stock', label: 'Stock' }, ...MAT_ALIGNS];

export function MatPanel({
  value,
  onChange,
  fieldKey,
  inherit,
  grid,
  testID,
}: {
  /** The style in effect here (the page's own, or the binder's when the page has none). */
  value: MatStyle | undefined;
  onChange: (patch: MatStylePatch) => void;
  /** Re-keys the colour fields when the thing being styled changes. */
  fieldKey: string;
  /** At the page level: the pill that hands the mat back to the binder, shown when the page has its own. */
  inherit?: { label: string; own: boolean; onPress: () => void };
  /**
   * The pocket grid the picture would spread across: the page's own, or at the binder level the
   * largest page's. Decides the picture's minimum size (matStyle.ts spreadMinimum).
   */
  grid?: { rows: number; cols: number };
  testID?: string;
}) {
  const pictured = !!value?.picture;
  const [pickerOpen, setPickerOpen] = useState(false);
  const showPicker = pictured || pickerOpen;
  const shown = matFields(value);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [spreadNote, setSpreadNote] = useState<string | null>(null);
  const spreading = value?.spread === 'page';
  // Across the page needs a picture with enough pixels for one slice per pocket. The size is
  // measured when the pill is pressed, so a picture from any source (preset, shelf, upload, link)
  // is judged the same way, and a small one is refused with the size it would need.
  const toggleSpread = () => {
    if (spreading) {
      setSpreadNote(null);
      onChange({ spread: null });
      return;
    }
    if (!value?.picture || !grid) return;
    const min = spreadMinimum(grid.rows, grid.cols);
    RNImage.getSize(
      value.picture,
      (w, h) => {
        if (spreadFits(w, h, grid.rows, grid.cols)) {
          setSpreadNote(null);
          onChange({ spread: 'page' });
        } else {
          setSpreadNote(`Too small to spread: this picture is ${w}×${h}, and a ${grid.rows}×${grid.cols} page needs at least ${min.w}×${min.h}.`);
        }
      },
      () => setSpreadNote(`Could not measure this picture. It needs at least ${min.w}×${min.h} pixels for a ${grid.rows}×${grid.cols} page.`),
    );
  };
  const toggle = (id: (typeof MAT_FIELDS)[number]['id']) => {
    const next = shown.includes(id) ? shown.filter((f) => f !== id) : [...shown, id];
    onChange({ fields: next });
  };
  return (
    <View style={styles.wearRows} testID={testID}>
      <Row label="Paper">
        <ColorBox fieldKey={`${fieldKey}-paper`} value={value?.paper ?? DEFAULT_MAT_PAPER} onChange={(paper) => onChange({ paper })} />
        <PillButton label="Picture" active={pictured} onPress={() => setPickerOpen((v) => !v)} testID={testID ? `${testID}-picture` : undefined} />
        {pictured && grid ? <PillButton label="Across the page" active={spreading} onPress={toggleSpread} testID={testID ? `${testID}-spread` : undefined} /> : null}
        {pictured ? <PillButton label="No picture" onPress={() => onChange({ picture: null })} testID={testID ? `${testID}-no-picture` : undefined} /> : null}
        {inherit?.own ? <PillButton label={inherit.label} onPress={inherit.onPress} testID={testID ? `${testID}-inherit` : undefined} /> : null}
      </Row>
      {spreadNote ? <Text style={local.note} testID={testID ? `${testID}-spread-note` : undefined}>{spreadNote}</Text> : null}
      {spreading && !spreadNote ? <Text style={local.note}>One picture across the page: each mat shows its slice, and empty pockets fill in with theirs.</Text> : null}
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
        {pictured ? <ToggleChip label="Follows the picture" on={!!value?.autoInk} onPress={() => onChange({ autoInk: value?.autoInk ? null : true })} accessibilityLabel="Ink follows the picture: dark ink where the picture is light under the text, light ink where it is dark, mat by mat" /> : null}
      </Row>
      <Row label="Outline" testID={testID ? `${testID}-halo` : undefined}>
        <Seg options={MAT_HALOS} value={value?.halo ?? 'off'} onChange={(halo) => onChange({ halo: halo === 'off' ? null : halo })} />
      </Row>
      {pictured ? (
        <Row label="Scrim" testID={testID ? `${testID}-scrim` : undefined}>
          <Seg
            options={MAT_SCRIMS}
            value={(MAT_SCRIMS.find((o) => o.value === (value?.scrim ?? 0)) ?? MAT_SCRIMS[value?.scrim ? 2 : 0]).id}
            onChange={(id) => {
              const found = MAT_SCRIMS.find((o) => o.id === id);
              onChange({ scrim: found && found.value > 0 ? found.value : null });
            }}
          />
          <Text style={local.note}>Tints the picture toward the paper under the text.</Text>
        </Row>
      ) : null}
      <Row label="Name" testID={testID ? `${testID}-name` : undefined}>
        <Seg options={MAT_NAMES} value={value?.name ?? 'card'} onChange={(name) => onChange({ name: name === 'card' ? null : name })} />
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
      <Row label="Align" testID={testID ? `${testID}-align` : undefined}>
        <View style={local.alignRows}>
          {(['name', 'rows', 'dex'] as const).map((section) => (
            <View key={section} style={local.alignRow}>
              <Text style={local.alignLabel}>{section === 'name' ? 'Name line' : section === 'rows' ? 'Rows' : 'Dex'}</Text>
              <Seg
                options={section === 'dex' ? MAT_ALIGNS : SECTION_ALIGNS}
                value={value?.align?.[section] ?? (section === 'dex' ? 'right' : 'stock')}
                onChange={(side) => onChange({ align: { [section]: side === 'stock' || (section === 'dex' && side === 'right') ? null : side } })}
              />
            </View>
          ))}
        </View>
      </Row>
      <Text style={local.note}>Species only cleans the name to the Pokémon it is a card of; None leaves it off. HP and Rarity sit beside the name. Stock is the card as it shipped: name left with HP and Rarity in the corner, the value of each row at the far edge. Lines that do not fit a small pocket are left off, as before.</Text>
    </View>
  );
}

const local = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, flexShrink: 1 },
  alignRows: { gap: 6, flexShrink: 1 },
  alignRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  alignLabel: { fontSize: FontSize.xs, color: Palette.muted, minWidth: 64 },
  uploadRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  note: { flex: 1, fontSize: FontSize.xs, color: Palette.muted, lineHeight: 15 },
});
