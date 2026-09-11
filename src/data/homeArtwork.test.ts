/**
 * The Home illustration's pinned binder still exists. Run: `npm test`.
 *
 * The TCGScan pairing card and the curate callout render a REAL example page, not a mockup. Which
 * page that is used to be "the first example binder with a card on page 0", so a picture on the
 * home page depended on the order of the module array in `content/index.ts`. Adding a content
 * module reordered it, the artwork silently fell back to a three-card cover leaf instead of a
 * nine-card chase board, and every type check, lint and test passed.
 *
 * It is pinned by id now. The remaining failure mode is that the id goes away: the release binders
 * are regenerated per set (`scripts/build-release-binders.mjs`), and a future run could retire
 * `rel-pitch-black-chase` entirely. The components fall back rather than break, so that too would
 * be silent. This test is the alarm.
 *
 * Everything here is read from disk rather than imported, because the modules use the `@/` alias
 * and this suite runs on node's type stripper with no resolver.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/** The pin, read from its single definition so this test tracks the constant rather than a copy. */
const PINNED = (() => {
  const src = readFileSync(join(HERE, 'content', 'index.ts'), 'utf8');
  const m = src.match(/HOME_ARTWORK_BINDER_ID\s*=\s*'([^']+)'/);
  assert.ok(m, 'HOME_ARTWORK_BINDER_ID is not defined in src/data/content/index.ts');
  return m![1];
})();

interface Slot { cardId?: string; type?: string }
interface Page { slots?: Slot[] }
interface Binder { id: string; title: string; pages?: Page[] }

const release: Binder[] = JSON.parse(readFileSync(join(HERE, 'releaseBinders.json'), 'utf8'));

test('the pinned Home-artwork binder is still in the release content', () => {
  const found = release.find((b) => b.id === PINNED);
  assert.ok(
    found,
    `${PINNED} is gone from releaseBinders.json. The Home artwork has silently fallen back to `
      + 'another page. Pick its replacement deliberately and update HOME_ARTWORK_BINDER_ID.',
  );
});

/**
 * Nine pockets is what makes it read as a binder. The regression that prompted all of this was a
 * three-card page, which looks like a bug rather than a showcase, so the floor is deliberately well
 * above three and below the nine it has, leaving room to re-cut the page without tripping.
 */
test('its first page still holds enough cards to read as a binder page', () => {
  const page = release.find((b) => b.id === PINNED)?.pages?.[0];
  assert.ok(page, `${PINNED} has no first page`);
  const cards = (page!.slots ?? []).filter((s) => s.cardId);
  assert.ok(
    cards.length >= 6,
    `the Home artwork page has ${cards.length} cards; under six it reads as a mistake, not a binder`,
  );
});
