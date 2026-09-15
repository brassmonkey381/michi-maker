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
import { useState } from 'react';
import { View } from 'react-native';

import { SoundtrackField } from '@/components/binder/SoundtrackField';
import { ColorBox, ImageLinkField, LabeledInput, PillButton, Row, Seg, ToggleChip, WearRow, styles } from '@/components/binder/inspector/controls';
import { REAL_PAGE_SIZES } from '@/data/binderPhysics';
import type { BinderTrack, DemoBinder, DemoPage } from '@/data/binderTypes';
import { DEFAULT_THREAD_OPACITY, DEFAULT_ZIP_PULL, PAGE_MATERIALS, SPINE_STYLES, THREAD_OPACITIES, WEAR_NONE, ZIP_TRACKS, isImageRef, luminance } from '@/data/pageStyle';
import { isBlankPage, useBinders } from '@/store/binders';

const PAGE_SIZE_OPTIONS = REAL_PAGE_SIZES.map((s) => ({ id: s.label, label: s.label, rows: s.rows, cols: s.cols }));
const THREAD_OPTIONS = THREAD_OPACITIES.map((o) => ({ id: String(o), label: `${Math.round(o * 100)}%`, blurb: `Thread at ${Math.round(o * 100)} percent` }));

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
  const [bgLink, setBgLink] = useState(false);
  const sizeId = PAGE_SIZE_OPTIONS.find((s) => s.rows === page.rows && s.cols === page.cols)?.id ?? PAGE_SIZE_OPTIONS[0].id;
  return (
    <View style={styles.section}>
      <Row label="Page size">
        <Seg
          options={PAGE_SIZE_OPTIONS}
          value={sizeId}
          onChange={(id) => {
            const size = PAGE_SIZE_OPTIONS.find((s) => s.id === id);
            if (!size) return;
            const res = store.setBinderPageSize(binder.id, size.rows, size.cols);
            if (!res.ok && res.reason) showToast(res.reason);
            else if (res.ok && binder.pages.length > 1) showToast(`All ${binder.pages.length} pages set to ${size.label}`);
          }}
        />
      </Row>
      <Row label="Background">
        <ColorBox
          fieldKey={`${binder.id}-${isImageRef(page.backgroundColor) ? 'picture' : 'colour'}`}
          value={isImageRef(page.backgroundColor) ? undefined : page.backgroundColor}
          onChange={(backgroundColor) => store.setBinderBackground(binder.id, backgroundColor)}
        />
        <PillButton label="Picture" active={isImageRef(page.backgroundColor)} onPress={() => setBgLink((v) => !v)} testID="binder-bg-picture" />
      </Row>
      {bgLink || isImageRef(page.backgroundColor) ? (
        <ImageLinkField
          value={isImageRef(page.backgroundColor) ? page.backgroundColor : undefined}
          onChange={(url) => store.setBinderBackground(binder.id, url)}
          testID="binder-bg-link"
        />
      ) : null}
      {/* WHAT THE PAGES ARE MADE OF (owner, 2026-09-13): the material, and what the pockets wear.
          See src/data/pageStyle.ts. */}
      <Row label="Page style">
        <Seg
          options={PAGE_MATERIALS}
          value={ps?.material ?? 'classic'}
          onChange={(id) => store.setPageStyle(binder.id, { material: id === 'classic' ? null : id })}
        />
      </Row>
      {ps?.material ? (
        <Row label="Thread">
          <ColorBox
            fieldKey={`${binder.id}-thread`}
            value={ps.thread?.color ?? (luminance(page.backgroundColor ?? '#ffffff') < 0.35 ? '#ffffff' : '#000000')}
            onChange={(color) => store.setPageStyle(binder.id, { thread: { color } })}
          />
          <Seg
            options={THREAD_OPTIONS}
            value={String(ps.thread?.opacity ?? DEFAULT_THREAD_OPACITY)}
            onChange={(id) => store.setPageStyle(binder.id, { thread: { opacity: Number(id) } })}
          />
          {ps.thread ? <PillButton label="Auto" onPress={() => store.setPageStyle(binder.id, { thread: null })} /> : null}
        </Row>
      ) : null}
      {/* BINDER DETAILS (owner, 2026-09-14): the hardware of the binder round the page. A set, not
          a pick: a binder can have a zip AND a spine, and each is its own toggle with its own options. */}
      <Row label="Binder details">
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
      {ps?.details?.zip ? (
        <Row label="Zip pull">
          <ColorBox fieldKey={`${binder.id}-pull`} value={ps.details.zip.pull ?? DEFAULT_ZIP_PULL} onChange={(pull) => store.setPageStyle(binder.id, { zip: { pull } })} />
          <Seg
            options={ZIP_TRACKS}
            value={ps.details.zip.track ?? 'straight'}
            onChange={(id) => store.setPageStyle(binder.id, { zip: { track: id === 'straight' ? null : id } })}
          />
        </Row>
      ) : null}
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
      {binder.pages.some(isBlankPage) ? (
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
      ) : null}
    </View>
  );
}
