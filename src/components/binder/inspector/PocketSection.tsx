/**
 * THE POCKET SECTION of the inspector: one pocket's own colour, over the page's and the binder's.
 * A card wears a sleeve; an art piece sits on a backing. "Use page's" hands the choice back up.
 * `PocketsWear` is the same for a multi-selection (owner, 2026-10-25): one row per kind present,
 * each change written to every selected pocket of that kind in one step.
 */
import { View } from 'react-native';

import { WearRow, styles } from '@/components/binder/inspector/controls';
import type { DemoBinder, DemoPage, DemoSlot } from '@/data/binderTypes';
import { resolveWear } from '@/data/pageStyle';
import { useBinders } from '@/store/binders';

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
        <WearRow
          label={cards.length === slots.length ? 'Sleeve' : `Sleeve (${cards.length} card${cards.length === 1 ? '' : 's'})`}
          fieldKey={`${key}-sleeve`}
          own={common(cards.map((s) => s.sleeve))}
          above={resolveWear(page.sleeve, binder.pageStyle?.sleeve)}
          inherit="Use page's"
          onChange={(sleeve) => store.setSlotsStyle(binder.id, page.id, cards.map((s) => s.id), { sleeve })}
          testID="slots-sleeve"
        />
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
        <WearRow
          label="Sleeve"
          fieldKey={`${slot.id}-style`}
          own={slot.sleeve}
          above={resolveWear(page.sleeve, binder.pageStyle?.sleeve)}
          inherit="Use page's"
          onChange={(sleeve) => store.setSlotStyle(binder.id, page.id, slot.id, { sleeve })}
          testID="slot-sleeve"
        />
      )}
    </View>
  );
}
