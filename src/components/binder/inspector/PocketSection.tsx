/**
 * THE POCKET SECTION of the inspector: one pocket's own colour, over the page's and the binder's.
 * A card wears a sleeve; an art piece sits on a backing. "Use page's" hands the choice back up.
 */
import { View } from 'react-native';

import { WearRow, styles } from '@/components/binder/inspector/controls';
import type { DemoBinder, DemoPage, DemoSlot } from '@/data/binderTypes';
import { resolveWear } from '@/data/pageStyle';
import { useBinders } from '@/store/binders';

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
