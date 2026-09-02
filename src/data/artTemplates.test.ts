/**
 * The templates are DATA, transcribed from a research pass, so the thing worth testing is that the
 * data is internally true rather than that a function does what it says.
 *
 * A template with two panels overlapping, or a `cardPockets` that does not match the pockets it
 * actually leaves, produces a page where cards land on top of art or a page that silently drops a
 * card. Neither fails loudly at runtime — the grid just draws something wrong — so every geometric
 * claim in the catalogue is re-derived here from the panels themselves.
 *
 * The selection rule gets its own tests because it encodes a product decision that is easy to
 * "fix" in the wrong direction: among the layouts that fit, the one spending the MOST pockets on
 * art wins. Anyone optimising for cards-per-page would invert it and the tests would say so.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ART_ROLE_LABELS,
  ART_SLACK,
  ART_TEMPLATES,
  artCells,
  hasFreeColumn,
  pickTemplate,
  reservedCells,
  templateArtSlots,
  type ArtTemplate,
} from './artTemplates.ts';

/** Every cell a template's panels cover, counted rather than deduped, so overlaps show up. */
function coveredCells(t: ArtTemplate): string[] {
  const out: string[] = [];
  for (const p of t.panels) {
    const leaf = t.spread ? (p.page ?? 'left') : 'single';
    for (let r = p.row; r < p.row + p.rowSpan; r += 1) {
      for (let c = p.col; c < p.col + p.colSpan; c += 1) out.push(`${leaf}:${r},${c}`);
    }
  }
  return out;
}

test('the catalogue is not empty and every id is unique', () => {
  assert.ok(ART_TEMPLATES.length >= 30, `only ${ART_TEMPLATES.length} templates`);
  const ids = new Set(ART_TEMPLATES.map((t) => t.id));
  assert.equal(ids.size, ART_TEMPLATES.length, 'duplicate template id');
});

test('no panel escapes its page', () => {
  for (const t of ART_TEMPLATES) {
    for (const p of t.panels) {
      assert.ok(p.row >= 0 && p.col >= 0, `${t.id}: negative origin`);
      assert.ok(p.rowSpan >= 1 && p.colSpan >= 1, `${t.id}: empty panel`);
      assert.ok(p.row + p.rowSpan <= t.rows, `${t.id}: panel runs past the last row`);
      assert.ok(p.col + p.colSpan <= t.cols, `${t.id}: panel runs past the last column`);
    }
  }
});

test('no two panels overlap', () => {
  // Cards are placed into whatever the panels do not cover, so an overlap would hand the same
  // pocket to two panels and quietly shrink the page.
  for (const t of ART_TEMPLATES) {
    const cells = coveredCells(t);
    assert.equal(new Set(cells).size, cells.length, `${t.id}: overlapping panels`);
  }
});

test('cardPockets is exactly what the panels leave behind', () => {
  // The number the wizard trusts when it decides how many cards a page can hold.
  for (const t of ART_TEMPLATES) {
    const leaves = t.spread ? 2 : 1;
    const expected = t.rows * t.cols * leaves - new Set(coveredCells(t)).size;
    assert.equal(t.cardPockets, expected, `${t.id}: claims ${t.cardPockets}, leaves ${expected}`);
  }
});

test('spread templates name a leaf for every panel, single pages name none', () => {
  for (const t of ART_TEMPLATES) {
    for (const p of t.panels) {
      if (t.spread) assert.ok(p.page === 'left' || p.page === 'right', `${t.id}: panel has no leaf`);
      else assert.equal(p.page, undefined, `${t.id}: single page names a leaf`);
    }
  }
});

test('every role has a label, and every panel a role', () => {
  for (const t of ART_TEMPLATES) {
    for (const p of t.panels) {
      assert.ok(ART_ROLE_LABELS[p.role], `${t.id}: role ${p.role} has no label`);
    }
  }
});

test('every template says when it is for and why the art is there', () => {
  // The reason is the feature; a template without one is the old gap-filler with a name.
  for (const t of ART_TEMPLATES) {
    assert.ok(t.when.length > 20, `${t.id}: no 'when'`);
    assert.ok(t.why.length > 20, `${t.id}: no 'why'`);
  }
});

test('reservedCells matches the panels, per leaf on a spread', () => {
  for (const t of ART_TEMPLATES) {
    if (t.spread) {
      const l = reservedCells(t, 'left').size;
      const r = reservedCells(t, 'right').size;
      assert.equal(l + r, new Set(coveredCells(t)).size, `${t.id}: leaves do not sum`);
    } else {
      assert.equal(reservedCells(t).size, new Set(coveredCells(t)).size, `${t.id}`);
    }
  }
});

test('the art-heaviest layout that still fits the cards wins', () => {
  // THE PRODUCT DECISION. Six cards on a 3x3 could be a six-card page with three loose holes;
  // the catalogue has a six-card layout that spends the other three on a composition, and that is
  // the one to choose. If this ever picks the roomier page, someone has optimised for card count.
  const t = pickTemplate(3, 3, 6);
  assert.ok(t, 'nothing fit six cards on a 3x3');
  assert.equal(t.cardPockets, 6);
  assert.ok(artCells(t) === 3, `expected the 3 spare pockets to become art, got ${artCells(t)}`);
});

test('a template is never chosen that cannot hold the cards', () => {
  for (let n = 0; n <= 9; n += 1) {
    const t = pickTemplate(3, 3, n);
    if (t) assert.ok(t.cardPockets >= n, `${t.id} holds ${t.cardPockets}, asked for ${n}`);
  }
});

test('a full page gets no art, because there is nothing to compose', () => {
  const t = pickTemplate(3, 3, 9);
  assert.ok(t);
  assert.equal(artCells(t), 0);
  assert.equal(t.cardPockets, 9);
});

test('asking for more cards than any layout holds returns nothing rather than a wrong page', () => {
  assert.equal(pickTemplate(3, 3, 10), null);
  assert.equal(pickTemplate(5, 5, 1), null, 'a page shape with no templates');
});

test('rotate varies the layout without letting the art floor drop', () => {
  // A binder that reached for the same composition on every six-card page reads as a template,
  // which is the opposite of curated — so rotation is allowed to trade up to ART_SLACK cells for
  // a genuinely different page, and never more than that.
  for (const n of [3, 5, 6]) {
    const richest = artCells(pickTemplate(3, 3, n)!);
    const picks = new Set<string>();
    for (let i = 0; i < 8; i += 1) {
      const t = pickTemplate(3, 3, n, { rotate: i });
      assert.ok(t, `rotate ${i} found nothing for ${n} cards`);
      assert.ok(t.cardPockets >= n, `${t.id} cannot hold ${n} cards`);
      assert.ok(
        artCells(t) >= richest - ART_SLACK,
        `${t.id} gave up ${richest - artCells(t)} art cells, more than ART_SLACK`,
      );
      picks.add(t.id);
    }
    assert.ok(picks.size > 1, `${n} cards always got the same layout`);
  }
  // Deterministic: the same page index always composes the same page. (Not periodic on any
  // fixed number — the shortlist length varies with the card count — so this checks repeatability
  // rather than a wrap at some assumed cycle.)
  for (let i = 0; i < 8; i += 1) {
    assert.equal(
      pickTemplate(3, 3, 5, { rotate: i })?.id,
      pickTemplate(3, 3, 5, { rotate: i })?.id,
      `rotate ${i} was not repeatable`,
    );
  }
  assert.equal(pickTemplate(3, 3, 5, { rotate: -3 })?.id, pickTemplate(3, 3, 5, { rotate: 3 })?.id);
});

test('an evolution page can always find a layout that keeps a column whole', () => {
  // The wizard refuses compositions that break every column on an evolution page, so there has to
  // be one left to refuse down to — otherwise those pages silently lose their art entirely.
  for (let n = 1; n <= 9; n += 1) {
    const t = pickTemplate(3, 3, n, { exclude: (x) => !hasFreeColumn(x) });
    assert.ok(t, `${n} cards: no column-safe layout`);
    assert.ok(hasFreeColumn(t), `${t.id} breaks every column`);
  }
});

test('exclude lets a caller refuse a layout it has just used', () => {
  const first = pickTemplate(3, 3, 5);
  assert.ok(first);
  const second = pickTemplate(3, 3, 5, { exclude: (t) => t.id === first.id });
  assert.ok(second);
  assert.notEqual(second.id, first.id);
});

test('spread templates are only offered when a spread was asked for', () => {
  for (const spread of [true, false]) {
    for (let n = 0; n <= 24; n += 1) {
      const t = pickTemplate(3, 3, n, { spread });
      if (t) assert.equal(t.spread, spread, `${t.id} is the wrong kind`);
    }
  }
});

test('the slots a template emits carry their reason and match its panels', () => {
  // The whole point of the change: an art slot that can say why it is in that pocket.
  const t = ART_TEMPLATES.find((x) => !x.spread && x.panels.length > 0);
  assert.ok(t);
  let n = 0;
  const slots = templateArtSlots(t, () => `id-${(n += 1)}`);
  assert.equal(slots.length, t.panels.length);
  for (const s of slots) {
    assert.equal(s.type, 'artwork');
    assert.ok(s.artRole, 'a template slot with no role');
    assert.equal(s.artTemplateId, t.id);
    assert.equal(s.cardId, undefined);
  }
  assert.equal(new Set(slots.map((s) => s.id)).size, slots.length, 'duplicate slot ids');
});

test('a spread emits only the panels for the leaf being laid out', () => {
  const t = ART_TEMPLATES.find((x) => x.spread && x.panels.some((p) => p.page === 'left') && x.panels.some((p) => p.page === 'right'));
  assert.ok(t, 'no spread template uses both leaves');
  let n = 0;
  const left = templateArtSlots(t, () => `id-${(n += 1)}`, 'left');
  const right = templateArtSlots(t, () => `id-${(n += 1)}`, 'right');
  assert.equal(left.length + right.length, t.panels.length);
  assert.ok(left.length > 0 && right.length > 0);
});
