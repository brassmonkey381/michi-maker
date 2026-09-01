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

import {
  PRINT_VARIANTS,
  chipFor,
  effectiveFinish,
  finishIsAskable,
  isPrintVariant,
  letterFor,
  nextFinish,
  variantOptionsFor,
} from './printVariant.ts';

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

test('an explicit answer beats everything', () => {
  // What the pocket was told wins over the copy and over the catalogue: a reverse-holo page is
  // built by saying so, pocket by pocket.
  assert.equal(effectiveFinish('Reverse Holofoil', 'Normal', { Normal: 1, 'Reverse Holofoil': 4 }), 'Reverse Holofoil');
});

test('a card you own beats a card the catalogue guessed at', () => {
  assert.equal(effectiveFinish(undefined, 'Holofoil', { Normal: 1, Holofoil: 9 }), 'Holofoil');
});

test('a single-finish card answers itself', () => {
  // Two thirds of the catalogue is printed one way, so most pockets are right without asking.
  assert.equal(effectiveFinish(undefined, undefined, { Holofoil: 9 }), 'Holofoil');
});

test('an ambiguous card is left unanswered rather than guessed', () => {
  // A wrong finish shown confidently is worse than no chip; that pocket is one tap from right.
  assert.equal(effectiveFinish(undefined, undefined, { Normal: 1, 'Reverse Holofoil': 4 }), undefined);
  assert.equal(effectiveFinish(undefined, undefined, undefined), undefined);
});

test('tapping cycles through what the card was actually printed as', () => {
  const priced = { Normal: 1, 'Reverse Holofoil': 4 };
  // variantOptionsFor sorts priciest first, so the cycle is RH -> Normal -> RH.
  assert.equal(nextFinish('Reverse Holofoil', priced), 'Normal');
  assert.equal(nextFinish('Normal', priced), 'Reverse Holofoil');
});

test('the cycle starts somewhere when the pocket has no answer yet', () => {
  assert.equal(nextFinish(undefined, { Normal: 1, Holofoil: 9 }), 'Holofoil');
});

test('nothing to cycle through means the chip stays inert', () => {
  // One published finish, or none: pretending there is a choice would be a lie the tap tells.
  assert.equal(nextFinish('Holofoil', { Holofoil: 9 }), undefined);
  assert.equal(nextFinish(undefined, undefined), undefined);
});

test('a stored finish the catalogue does not list still cycles out of itself', () => {
  // variantOptionsFor keeps the current value even when unlisted, so a bad value is escapable.
  const priced = { Normal: 1, Holofoil: 9 };
  assert.equal(nextFinish('Poke Ball Holo', priced), 'Holofoil');
});

test('an ambiguous card asks; a single-finish card does not', () => {
  // The gap this closed: a card that could be either showed NO chip, so there was nothing to tap
  // and the finish was unsettable on exactly the cards that needed setting.
  assert.equal(finishIsAskable({ Normal: 1, 'Reverse Holofoil': 4 }), true);
  assert.equal(finishIsAskable({ Holofoil: 9 }), false);
  assert.equal(finishIsAskable(undefined), false);
});
