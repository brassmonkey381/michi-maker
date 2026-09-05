/**
 * api/_seo.json is generated from guides.ts (scripts/build-seo-data.mjs) and committed. The
 * functions in api/ emit it as HowTo structured data, so a guide renamed here and not regenerated
 * would tell search engines a title the page no longer shows. Run `node scripts/build-seo-data.mjs`
 * when this fails.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { GUIDE_LIST } from './guides.ts';

test('api/_seo.json matches guides.ts', () => {
  const seo = JSON.parse(readFileSync(new URL('../../api/_seo.json', import.meta.url), 'utf8'));
  assert.deepEqual(
    seo.guides.map((g: { slug: string; title: string; steps: unknown[] }) => [g.slug, g.title, g.steps.length]),
    GUIDE_LIST.map((g) => [g.slug, g.title, g.steps.length]),
  );
  assert.ok(seo.michiFaq.length >= 3);
});
