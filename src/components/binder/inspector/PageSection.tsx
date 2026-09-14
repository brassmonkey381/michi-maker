/**
 * THE PAGE SECTION of the inspector: this page's name, what its pockets wear, and its track.
 *
 * Blank sleeve and backing mean the binder's; "None" means bare pockets here; a pocket can still
 * say otherwise on top (see PocketSection). The composition notes at the end say why the page
 * looks the way it does: what the open pockets mean and what each reserved art panel is for.
 */
import { View } from 'react-native';

import { PageComposition } from '@/components/binder/PageComposition';
import { SoundtrackField } from '@/components/binder/SoundtrackField';
import { LabeledInput, WearRow, styles } from '@/components/binder/inspector/controls';
import type { BinderTrack, DemoBinder, DemoPage } from '@/data/binderTypes';
import { useBinders } from '@/store/binders';

export function PageFields({
  binder,
  page,
  tracksLocked,
  onTracksLocked,
}: {
  binder: DemoBinder;
  page: DemoPage;
  tracksLocked: boolean;
  onTracksLocked: () => void;
}) {
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
      <SoundtrackField
        label="This page's track"
        track={page.track}
        onChange={(track: BinderTrack | null) => store.updatePage(binder.id, page.id, { track })}
        locked={tracksLocked}
        onLocked={onTracksLocked}
      />
      <PageComposition page={page} />
    </View>
  );
}
