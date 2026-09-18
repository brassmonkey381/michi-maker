/**
 * THE BINDER SECTION of the inspector: what the binder is called, and how the whole of it looks.
 *
 * Two halves, because today they are still shown in two places: `BinderFields` (title,
 * description, soundtrack) behind the title, and `BinderLook` (page size, background, page style,
 * thread, binder details, zip pull, sleeves, art backing, compact blanks) behind the gear. The
 * docked inspector shows both, in this order, as one section.
 *
 * Every row here is BINDER-WIDE. Page size was already; background became so because a binder is
 * one object, and letting each page carry its own colour let one drift into a patchwork nobody
 * chose, invisible until you flipped onto the odd page out.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SoundtrackField } from '@/components/binder/SoundtrackField';
import { ColorBox, Group, LabeledInput, PillButton, Row, Seg, ToggleChip, WearRow, styles } from '@/components/binder/inspector/controls';
import { REAL_PAGE_SIZES } from '@/data/binderPhysics';
import type { BinderTrack, DemoBinder, DemoPage } from '@/data/binderTypes';
import { BINDER_PRESETS } from '@/data/binderPresets';
import { reflowSummary } from '@/data/pageReflow';
import { Palette } from '@/constants/theme';
import { SPINE_STYLES, WEAR_NONE, isImageRef } from '@/data/pageStyle';
import { isBlankPage, useBinders } from '@/store/binders';

const PAGE_SIZE_OPTIONS = REAL_PAGE_SIZES.map((s) => ({ id: s.label, label: s.label, rows: s.rows, cols: s.cols }));

export function BinderFields({
  binder,
  tracksLocked,
  onTracksLocked,
}: {
  binder: DemoBinder;
  tracksLocked: boolean;
  onTracksLocked: () => void;
}) {
  const store = useBinders();
  return (
    <View style={styles.section}>
      <LabeledInput
        label="Binder title"
        value={binder.title}
        onChangeText={(title) => store.updateBinder(binder.id, { title })}
        placeholder="Binder title"
        testID="binder-title-field"
      />
      <LabeledInput
        label="Binder description"
        value={binder.description ?? ''}
        onChangeText={(description) => store.updateBinder(binder.id, { description })}
        placeholder="What is this binder about?"
        multiline
      />
      <SoundtrackField
        label="Soundtrack"
        track={binder.track}
        // `track` straight through: Remove hands over null, and null is what the repo needs to
        // write the column. `?? undefined` turned a removal into an absent field, which the
        // patch guard reads as "do not touch this column".
        onChange={(track: BinderTrack | null) => store.updateBinder(binder.id, { track })}
        locked={tracksLocked}
        onLocked={onTracksLocked}
      />
    </View>
  );
}

export function BinderLook({
  binder,
  page,
  showToast,
}: {
  binder: DemoBinder;
  /** The page being looked at: its size and colour stand for the binder's. */
  page: DemoPage;
  showToast: (message: string, withUndo?: boolean) => void;
}) {
  const store = useBinders();
  const ps = binder.pageStyle;
  const sizeId = PAGE_SIZE_OPTIONS.find((s) => s.rows === page.rows && s.cols === page.cols)?.id ?? PAGE_SIZE_OPTIONS[0].id;
  const compact = binder.pages.some(isBlankPage) ? (
    <Row label="Blank pages">
      <PillButton
        label="Compact blanks"
        onPress={() => {
          const result = store.compactBlankPages(binder.id);
          if (!result) return;
          if (result.removed === 0) {
            showToast(result.kept > 0 ? 'Every blank page here keeps folded art on its pocket pairs.' : 'No blank pages to remove.');
            return;
          }
          showToast(
            `Removed ${result.removed} blank page${result.removed === 1 ? '' : 's'}${
              result.kept > 0 ? `. ${result.kept === 1 ? 'One stays' : `${result.kept} stay`} to keep folded art aligned.` : ''
            }`,
            true,
          );
        }}
      />
    </Row>
  ) : null;
  return (
    <View style={styles.groups}>
      {/* THREE GROUPS, BY WHAT THEY ARE MADE OF (owner, 2026-09-15): the pages, the binder round
          them, and the pockets on them. One column of nine rows said none of that. */}
      <Group title="Pages" testID="binder-group-pages">
        <Row label="Page size">
          <Seg
            options={PAGE_SIZE_OPTIONS}
            value={sizeId}
            onChange={(id) => {
              const size = PAGE_SIZE_OPTIONS.find((s) => s.id === id);
              if (!size) return;
              const res = store.setBinderPageSize(binder.id, size.rows, size.cols);
              if (!res.ok) {
                if (res.reason) showToast(res.reason);
                return;
              }
              // Cards reflow into the new grid, so the toast says what MOVED — a reshape that
              // quietly re-laid half the binder should not read the same as one that changed nothing.
              if (binder.pages.length > 1 || res.moved || res.pageDelta) {
                showToast(
                  reflowSummary({ moved: res.moved ?? 0, pageDelta: res.pageDelta ?? 0 }, size.rows, size.cols),
                );
              }
            }}
          />
        </Row>
        {/* A COLOUR ONLY (owner, 2026-09-15): a picture behind the pages is a share-image choice,
            set in the Share sheet, so the editor's pages stay printable and the two are not confused. */}
        <Row label="Background">
          <ColorBox
            // Re-keyed on the named binder, so picking one shows its cloth here at once.
            fieldKey={`${binder.id}-${ps?.binder ?? ''}`}
            value={isImageRef(page.backgroundColor) ? undefined : page.backgroundColor}
            onChange={(backgroundColor) => store.setBinderBackground(binder.id, backgroundColor)}
          />
        </Row>
        {compact}
      </Group>
      {/* BINDER DETAILS (owner, 2026-09-14): the hardware of the binder round the page. A set, not
          a pick: a binder can have a zip AND a spine. The zip's colour and its pull's are the
          cover colour's (owner, 2026-09-15: zipCloth), as the stitching is; none of those is a setting. */}
      <Group title="Binder" testID="binder-group-binder">
        {/* THE NAMED BINDERS (owner, 2026-09-15): one tap sets the cloth, the zip and the spine
            together, and fixes the zip's colours to the binder's own (the gold one). The rows
            under it still adjust; the name stays until another is picked. */}
        <Row label="Binder">
          {BINDER_PRESETS.map((preset) => {
            const on = ps?.binder === preset.id;
            return (
              <Pressable
                key={preset.id}
                onPress={() => {
                  store.setBinderBackground(binder.id, preset.cloth);
                  store.setPageStyle(binder.id, { binder: preset.id, zip: preset.zipper ? {} : null, spine: preset.spine });
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${preset.label} binder`}
                testID={`binder-preset-${preset.id}`}
                style={[styles.chip, local.presetChip, on && styles.chipActive]}>
                <View style={[local.presetSwatch, { backgroundColor: preset.cloth }, preset.zip ? { borderColor: preset.zip.pull, borderWidth: 2 } : null]} />
                <Text style={[styles.chipText, on && styles.chipTextActive]}>{preset.label}</Text>
              </Pressable>
            );
          })}
        </Row>
        <Row label="Hardware">
          <ToggleChip
            label="Zipper"
            on={!!ps?.details?.zip}
            onPress={() => store.setPageStyle(binder.id, { zip: ps?.details?.zip ? null : {} })}
            accessibilityLabel="Zipper: a zip round the cover, with a coloured pull"
          />
          {SPINE_STYLES.map((sp) => {
            const on = ps?.details?.spine === sp.id;
            return (
              <ToggleChip
                key={sp.id}
                label={sp.label}
                on={on}
                onPress={() => store.setPageStyle(binder.id, { spine: on ? null : sp.id })}
                accessibilityLabel={`${sp.label}: ${sp.blurb}`}
              />
            );
          })}
        </Row>
      </Group>
      <Group title="Pockets" note="What every page's pockets wear unless a page or pocket says otherwise." testID="binder-group-pockets">
        <WearRow
          label="Sleeves"
          fieldKey={`${binder.id}-sleeve`}
          own={ps?.sleeve ?? WEAR_NONE}
          onChange={(sleeve) => store.setPageStyle(binder.id, { sleeve })}
          testID="binder-sleeve"
        />
        <WearRow
          label="Art backing"
          fieldKey={`${binder.id}-backing`}
          own={ps?.artBacking ?? WEAR_NONE}
          onChange={(artBacking) => store.setPageStyle(binder.id, { artBacking })}
          testID="binder-backing"
        />
      </Group>
    </View>
  );
}

const local = StyleSheet.create({
  presetChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 6 },
  /** The binder's cloth, and its zip's colour as the rim when it has one of its own. */
  presetSwatch: { width: 14, height: 14, borderRadius: 7, borderWidth: 1, borderColor: Palette.hairlineStrong },
});
