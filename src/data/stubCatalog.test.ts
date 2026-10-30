import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { CatalogCard } from 'tcgscan-browse';

import { catalogFromCards } from './stubCatalog.ts';

const card = (id: string, name = id) => ({ id, name }) as unknown as CatalogCard;

test('a stub catalogue answers getCard and listAll, keeps the first record of an id, and is empty everywhere else', () => {
  const cat = catalogFromCards([card('1', 'one'), card('2'), card('1', 'again')]);
  assert.equal(cat.cardCount, 2);
  assert.equal(cat.getCard('1')?.name, 'one');
  assert.equal(cat.getCard('9'), undefined);
  assert.deepEqual(cat.listAll().map((c) => c.id), ['1', '2']);
  cat.add([card('3'), card('2', 'dup')]);
  assert.deepEqual(cat.ids(), ['1', '2', '3']);
  assert.equal(cat.getCard('2')?.name, '2');
  assert.deepEqual(cat.listSeries(), []);
  assert.deepEqual(cat.allSets(), []);
  assert.deepEqual(cat.search('one'), []);
  assert.equal(cat.getSet('x'), undefined);
  assert.equal(catalogFromCards().cardCount, 0);
});
