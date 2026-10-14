/**
 * THE PAGE SECTION of the inspector: this page's name and what its pockets wear. (Its track went
 * on 2026-10-14: one soundtrack per binder, set in the binder's settings.)
 *
 * Blank sleeve and backing mean the binder's; "None" means bare pockets here; a pocket can still
 * say otherwise on top (see PocketSection). The composition notes at the end say why the page
 * looks the way it does: what the open pockets mean and what each reserved art panel is for.
 */
import { View } from 'react-native';

import { PageComposition } from '@/components/binder/PageComposition';
import { LabeledInput, WearRow, styles } from '@/components/binder/inspector/controls';
import type { DemoBinder, DemoPage } from '@/data/binderTypes';
import { useBinders } from '@/store/binders';

export function PageFields({ binder, page }: { binder: DemoBinder; page: DemoPage }) {
  const store = useBinders();
  return (
    <View style={styles.section}>
      <LabeledInput
        label="Page title"
        value={page.title ?? ''}
        onChangeText={(title) => store.updatePage(binder.id, page.id, { title })}
        placeholder="Untitled page"
        testID="page-title-field"
      />
      <LabeledInput
        label="Page description"
        value={page.description ?? ''}
        onChangeText={(description) => store.updatePage(binder.id, page.id, { description })}
        placeholder="What's on this page?"
        multiline
      />
      <WearRow
        label="Sleeves on this page"
        fieldKey={`${page.id}-sleeve`}
        own={page.sleeve}
        above={binder.pageStyle?.sleeve}
        inherit="Use binder's"
        onChange={(sleeve) => store.updatePage(binder.id, page.id, { sleeve })}
        testID="page-sleeve"
      />
      <WearRow
        label="Art backing on this page"
        fieldKey={`${page.id}-backing`}
        own={page.artBacking}
        above={binder.pageStyle?.artBacking}
        inherit="Use binder's"
        onChange={(artBacking) => store.updatePage(binder.id, page.id, { artBacking })}
        testID="page-backing"
      />
      <PageComposition page={page} />
    </View>
  );
}
