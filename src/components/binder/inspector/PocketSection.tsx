/**
 * THE POCKET SECTION of the inspector: one pocket's own colour, over the page's and the binder's.
 * A card wears a sleeve; an art piece sits on a backing. "Use page's" hands the choice back up.
 * `PocketsWear` is the same for a multi-selection (owner, 2026-10-25): one row per kind present,
 * each change written to every selected pocket of that kind in one step.
 */
import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';

import { Row, Seg, WearRow, styles } from '@/components/binder/inspector/controls';
import { POCKET_ART_VIEWS, type PocketArtView, resolveArtView } from '@/data/artView';
import type { DemoBinder, DemoPage, DemoSlot } from '@/data/binderTypes';
import { resolveWear } from '@/data/pageStyle';
import { hasArtViews } from '@/data/tiers';
import { useBinders } from '@/store/binders';

/**
 * A card pocket's art view (artView.ts): the page's, the full card, or the art window. One row
 * for one pocket or for every selected card pocket at once; a connected page overrides them all,
 * and the row says so. PRO's feature, like the page's own picker (tiers.ts hasArtViews).
 */
function PocketArtViewRow({ binder, page, slots, own, testID }: { binder: DemoBinder; page: DemoPage; slots: DemoSlot[]; own: PocketArtView | null | undefined; testID: string }) {
  const store = useBinders();
  // Locked by tier unless this visit's free taste is running (store.taste); the first change on a
  // locked row takes the taste and goes through.
  const locked = !hasArtViews(store.tier) && !store.taste.active('artViews');
  const pageView = resolveArtView(page.artView, binder.pageStyle?.artView);
  if (pageView === 'connected') {
    return <Row label="Art view" testID={testID}><ThemedText type="small" themeColor="textSecondary">Connected art: the whole page is one sheet.</ThemedText></Row>;
  }
  return (
    <Row label={locked ? 'Art view \u00b7 PRO' : 'Art view'} testID={testID}>
      <View style={locked ? { opacity: 0.45 } : undefined}>
        <Seg
          options={POCKET_ART_VIEWS}
          value={own ?? 'inherit'}
          onChange={(id) => {
            if (locked && !store.taste.use('artViews', 'inspector')) return;
            store.setSlotsStyle(binder.id, page.id, slots.map((s) => s.id), { artView: id === 'inherit' ? null : id });
          }}
        />
      </View>
    </Row>
  );
}

/** The value every pocket shares, or undefined when they differ (the row then shows the page's). */
function common(values: (string | null | undefined)[]): string | null | undefined {
  const first = values[0] ?? null;
  return values.every((v) => (v ?? null) === first) ? first : undefined;
}

export function PocketsWear({ binder, page, slots }: { binder: DemoBinder; page: DemoPage; slots: DemoSlot[] }) {
  const store = useBinders();
  const cards = slots.filter((s) => s.type !== 'artwork');
  const arts = slots.filter((s) => s.type === 'artwork');
  const key = slots.map((s) => s.id).join('.');
  return (
    <View style={styles.section}>
      {cards.length ? (
        <>
          <WearRow
            label={cards.length === slots.length ? 'Sleeve' : `Sleeve (${cards.length} card${cards.length === 1 ? '' : 's'})`}
            fieldKey={`${key}-sleeve`}
            own={common(cards.map((s) => s.sleeve))}
            above={resolveWear(page.sleeve, binder.pageStyle?.sleeve)}
            inherit="Use page's"
            onChange={(sleeve) => store.setSlotsStyle(binder.id, page.id, cards.map((s) => s.id), { sleeve })}
            testID="slots-sleeve"
          />
          <PocketArtViewRow binder={binder} page={page} slots={cards} own={common(cards.map((s) => s.artView)) as PocketArtView | null | undefined} testID="slots-art-view" />
        </>
      ) : null}
      {arts.length ? (
        <WearRow
          label={arts.length === slots.length ? 'Backing' : `Backing (${arts.length} art piece${arts.length === 1 ? '' : 's'})`}
          fieldKey={`${key}-backing`}
          own={common(arts.map((s) => s.artBacking))}
          above={resolveWear(page.artBacking, binder.pageStyle?.artBacking)}
          inherit="Use page's"
          onChange={(artBacking) => store.setSlotsStyle(binder.id, page.id, arts.map((s) => s.id), { artBacking })}
          testID="slots-backing"
        />
      ) : null}
    </View>
  );
}

export function PocketWear({ binder, page, slot }: { binder: DemoBinder; page: DemoPage; slot: DemoSlot }) {
  const store = useBinders();
  return (
    <View style={styles.section}>
      {slot.type === 'artwork' ? (
        <WearRow
          label="Backing"
          fieldKey={`${slot.id}-style`}
          own={slot.artBacking}
          above={resolveWear(page.artBacking, binder.pageStyle?.artBacking)}
          inherit="Use page's"
          onChange={(artBacking) => store.setSlotStyle(binder.id, page.id, slot.id, { artBacking })}
          testID="slot-backing"
        />
      ) : (
        <>
          <WearRow
            label="Sleeve"
            fieldKey={`${slot.id}-style`}
            own={slot.sleeve}
            above={resolveWear(page.sleeve, binder.pageStyle?.sleeve)}
            inherit="Use page's"
            onChange={(sleeve) => store.setSlotStyle(binder.id, page.id, slot.id, { sleeve })}
            testID="slot-sleeve"
          />
          <PocketArtViewRow binder={binder} page={page} slots={[slot]} own={slot.artView} testID="slot-art-view" />
        </>
      )}
    </View>
  );
}
