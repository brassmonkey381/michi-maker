/**
 * THE PAGE SECTION of the inspector: this page's name and what its pockets wear. (Its track went
 * on 2026-10-14: one soundtrack per binder, set in the binder's settings.)
 *
 * Blank sleeve and backing mean the binder's; "None" means bare pockets here; a pocket can still
 * say otherwise on top (see PocketSection). The composition notes at the end say why the page
 * looks the way it does: what the open pockets mean and what each reserved art panel is for.
 */
import { StyleSheet, View } from 'react-native';

import { PageComposition } from '@/components/binder/PageComposition';
import { LabeledInput, Row, Seg, WearRow, styles } from '@/components/binder/inspector/controls';
import { NameField } from '@/components/binder/inspector/NameField';
import { isFieldLocked } from '@/data/autoNames';
import { flag } from '@/lib/flags';

/** MIC-034 auto names ('dev'): the fields lock on the first edit or Keep, and save debounced. */
const AUTO_NAMES = flag('auto-names');
import { PAGE_ART_VIEWS } from '@/data/artView';
import type { DemoBinder, DemoPage } from '@/data/binderTypes';
import { canEditArtView } from '@/data/betaFeatures';
import { useAuth } from '@/store/auth';
import { useBinders } from '@/store/binders';

export function PageFields({
  binder,
  page,
  artViewsLocked = false,
  onArtViewsLocked,
}: {
  binder: DemoBinder;
  page: DemoPage;
  /**
   * ART VIEWS ARE PRO (owner, 2026-10-24). Locked, the picker still shows every view, dimmed, and
   * a tap says why instead of switching: a view already on the page stays as it is for everyone.
   */
  artViewsLocked?: boolean;
  onArtViewsLocked?: () => void;
}) {
  const store = useBinders();
  const { user } = useAuth();
  const artViewBeta = canEditArtView(user?.id);
  const artView = page.artView ?? 'inherit';
  return (
    <View style={styles.section}>
      {AUTO_NAMES ? (
        <>
          <NameField
            label="Page title"
            value={page.title ?? ''}
            onSave={(title) => store.updatePage(binder.id, page.id, { title, titleLocked: true })}
            auto={!isFieldLocked(page.titleLocked, page.title)}
            onKeep={() => store.updatePage(binder.id, page.id, { title: page.title, titleLocked: true })}
            placeholder="Untitled page"
            testID="page-title-field"
          />
          <NameField
            label="Page description"
            value={page.description ?? ''}
            onSave={(description) => store.updatePage(binder.id, page.id, { description, descriptionLocked: true })}
            auto={!isFieldLocked(page.descriptionLocked, page.description)}
            onKeep={() => store.updatePage(binder.id, page.id, { description: page.description, descriptionLocked: true })}
            placeholder="What's on this page?"
            multiline
            testID="page-description-field"
          />
        </>
      ) : (
        <>
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
        </>
      )}
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
      {/* HOW THE CARDS SHOW (artView.ts): the binder's choice, or this page's own: the full card,
          the art window on a stock card, or the windows edge to edge. A pocket can say otherwise
          again (PocketSection), unless the page is connected. In beta (betaFeatures.ts). */}
      {artViewBeta ? (
      <Row label={artViewsLocked ? 'Art view · PRO' : 'Art view'} testID="page-art-view">
        <View style={artViewsLocked ? local.locked : undefined}>
          <Seg
            options={PAGE_ART_VIEWS}
            value={artView}
            onChange={(id) => {
              if (artViewsLocked) {
                onArtViewsLocked?.();
                return;
              }
              store.updatePage(binder.id, page.id, { artView: id === 'inherit' ? null : id });
            }}
          />
        </View>
      </Row>
      ) : null}
      <PageComposition page={page} />
    </View>
  );
}

const local = StyleSheet.create({
  locked: { opacity: 0.45 },
});
