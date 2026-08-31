/**
 * The chip vocabulary and the picker's option list.
 *
 * Both are places where being quietly wrong costs real data. `portfolio_entries.variant` is plain
 * text with no CHECK, so an unrecognised string must survive being displayed; and offering a
 * finish the card's price data does not list gets silently rewritten by tcgscan-app the next time
 * that lot is opened, undoing the user's choice with nobody touching it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PRINT_VARIANTS, chipFor, isPrintVariant, letterFor, variantOptionsFor } from './printVariant.ts';

test('every published finish has a chip, and none of them collide', () => {
  const letters = new Set<string>();
  for (const v of PRINT_VARIANTS) {
    const chip = chipFor(v);
    assert.ok(chip.letter.length > 0 && chip.letter.length <= 3, `${v}: ${chip.letter}`);
    assert.equal(chip.label, v, 'the label is the stored string, spelled out');
    assert.equal(letters.has(chip.letter), false, `duplicate letter ${chip.letter}`);
    letters.add(chip.letter);
  }
});

test('the three the user asked for read N / H / RH', () => {
  assert.equal(letterFor('Normal'), 'N');
  assert.equal(letterFor('Holofoil'), 'H');
  assert.equal(letterFor('Reverse Holofoil'), 'RH');
});

test('an unknown finish is shown, not hidden and not renamed', () => {
  // The column is free text and tcgscan can put anything in it. Rendering the stored value's own
  // initial keeps the chip honest about what the collection actually says.
  const chip = chipFor('Poké Ball Holo');
  assert.equal(chip.letter, 'P');
  assert.equal(chip.label, 'Poké Ball Holo');
  assert.equal(isPrintVariant('Poké Ball Holo'), false);
});

test('an empty or blank variant does not crash or render an empty badge', () => {
  assert.equal(chipFor('').letter, '?');
  assert.equal(chipFor('   ').letter, '?');
});

test('picker options come from the card, priciest first', () => {
  const opts = variantOptionsFor({ Normal: 1.2, 'Reverse Holofoil': 4.5 }, 'Normal');
  assert.deepEqual(opts, ['Reverse Holofoil', 'Normal']);
});

test('a single-finish card offers exactly one option — there is nothing to pick', () => {
  assert.deepEqual(variantOptionsFor({ Holofoil: 9 }, 'Holofoil'), ['Holofoil']);
});

test('the stored value always appears, even when the price data has never heard of it', () => {
  // Otherwise a row would vanish from its own picker and the user could not read what they have,
  // let alone change it.
  const opts = variantOptionsFor({ Holofoil: 9 }, 'Normal');
  assert.deepEqual(opts, ['Normal', 'Holofoil']);
});

test('a card with no price data at all still offers what the row says', () => {
  assert.deepEqual(variantOptionsFor(undefined, 'Normal'), ['Normal']);
  assert.deepEqual(variantOptionsFor({}, 'Holofoil'), ['Holofoil']);
});

test('nothing is offered that the card cannot be — no fixed N/H/RH triple', () => {
  // 12% of the catalogue is entirely 1st Edition / Unlimited. Offering "Reverse Holofoil" there
  // would be a value tcgscan-app rewrites the next time that lot is opened.
  const opts = variantOptionsFor({ '1st Edition': 30, Unlimited: 12 }, '1st Edition');
  assert.equal(opts.includes('Reverse Holofoil'), false);
  assert.equal(opts.includes('Normal'), false);
  assert.deepEqual(opts, ['1st Edition', 'Unlimited']);
});

test('a zero-priced variant is still a variant', () => {
  // Worthless is not the same as absent: the key set is "finishes we can price", and a $0 holo
  // is still the finish the card was printed with.
  assert.deepEqual(variantOptionsFor({ Normal: 0, Holofoil: 0 }, 'Normal'), ['Normal', 'Holofoil']);
});
