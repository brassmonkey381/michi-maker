import assert from 'node:assert/strict';
import { test } from 'node:test';

import { matchBinder } from './binderSearch.ts';

const binder = {
  title: 'Shiny Vault',
  description: 'Everything that sparkles',
  pages: [
    { title: 'Charizard page', slots: [] },
    { title: undefined, description: 'all the pitch black set', slots: [] },
    { title: 'Pikachu page', slots: [] },
  ],
} as unknown as Parameters<typeof matchBinder>[0];

test('an empty query matches by title', () => {
  assert.deepEqual(matchBinder(binder, '   '), { kind: 'title' });
});

test('title wins over pages, case-insensitively', () => {
  assert.deepEqual(matchBinder(binder, 'VAULT'), { kind: 'title' });
});

test('a description hit is named as such', () => {
  assert.deepEqual(matchBinder(binder, 'sparkles'), { kind: 'description' });
});

test('a page title hit names the page, zero-based', () => {
  assert.deepEqual(matchBinder(binder, 'pikachu'), { kind: 'page', pageIndex: 2, pageTitle: 'Pikachu page' });
});

test('a page description hit falls back to "Page N" when the page has no title', () => {
  assert.deepEqual(matchBinder(binder, 'pitch black'), { kind: 'page', pageIndex: 1, pageTitle: 'Page 2' });
});

test('no hit anywhere is null', () => {
  assert.equal(matchBinder(binder, 'eevee'), null);
});
