/**
 * Contest config invariants. Run: `npm test`.
 *
 * The prize table is MONEY and the phase gate decides whether entries are open, so both are
 * pinned here: a typo that duplicates a LIFETIME VIP, drops a place, or leaves the contest
 * permanently "upcoming" is expensive and silent. See docs/CONTEST.md.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CATEGORIES,
  CONTEST,
  contestPhase,
  categoryLabel,
  entriesOpen,
  finalsVotingOpen,
} from './contest.ts';

test('exactly one LIFETIME prize exists, and it is Best Aesthetic 1st', () => {
  const lifetime = CATEGORIES.flatMap((c) =>
    c.prizes.filter((p) => p.prize.includes('LIFETIME')).map((p) => ({ cat: c.slug, place: p.place })),
  );
  assert.deepEqual(lifetime, [{ cat: 'aesthetic', place: '1st' }]);
});

test('six categories, all with unique slugs and a full prize ladder', () => {
  assert.equal(CATEGORIES.length, 6);
  assert.equal(new Set(CATEGORIES.map((c) => c.slug)).size, 6);
  for (const c of CATEGORIES) {
    assert.equal(c.prizes.length, 4, `${c.slug} should have 4 prize tiers`);
    assert.deepEqual(
      c.prizes.map((p) => p.place),
      ['1st', '2nd', '3rd–5th', '6th–10th'],
      `${c.slug} places`,
    );
    assert.ok(c.blurb.length > 0 && c.label.length > 0, `${c.slug} needs copy`);
  }
});

test('every category first place is a VIP year (or the lifetime)', () => {
  for (const c of CATEGORIES) {
    const first = c.prizes.find((p) => p.place === '1st')!.prize;
    assert.ok(/VIP/.test(first), `${c.slug} 1st should be VIP, got ${first}`);
  }
});

test('60 prize slots total (10 per category)', () => {
  // 1 + 1 + 3 + 5 per category.
  const perCategory = 10;
  assert.equal(CATEGORIES.length * perCategory, 60);
});

test('Community’s Choice is gone (it double-paid the Aesthetic winner)', () => {
  assert.equal(
    CATEGORIES.some((c) => (c.slug as string) === 'community'),
    false,
  );
  assert.equal(categoryLabel('community'), 'community'); // unknown slug falls through
});

test('contest window is coherent and the phase gate tracks it', () => {
  const opens = Date.parse(CONTEST.opensAt);
  const finals = Date.parse(CONTEST.finalsOpenAt);
  const ends = Date.parse(CONTEST.endsAt);
  assert.ok(
    Number.isFinite(opens) && Number.isFinite(finals) && Number.isFinite(ends),
    'dates must parse',
  );
  assert.ok(finals > opens, 'stage 1 must run before the final');
  assert.ok(ends > finals, 'the final must end after it opens');

  assert.equal(contestPhase(opens - 1), 'upcoming');
  assert.equal(contestPhase(opens + 1), 'open');
  assert.equal(contestPhase((opens + finals) / 2), 'open');
  // The boundary belongs to the final: at finalsOpenAt stage 1 is over, which is what "entries
  // close on the 10th" has to mean if the snapshot taken that instant is to be the whole field.
  assert.equal(contestPhase(finals), 'finals');
  assert.equal(contestPhase((finals + ends) / 2), 'finals');
  assert.equal(contestPhase(ends + 1), 'ended');
});

test('entries are a stage-1 act; stage-2 voting is a stage-2 one', () => {
  assert.equal(entriesOpen('open'), true);
  for (const phase of ['upcoming', 'finals', 'ended'] as const) {
    assert.equal(entriesOpen(phase), false, `entries must be closed in ${phase}`);
  }
  assert.equal(finalsVotingOpen('finals'), true);
  for (const phase of ['upcoming', 'open', 'ended'] as const) {
    assert.equal(finalsVotingOpen(phase), false, `finals voting must be closed in ${phase}`);
  }
});

test('the final carries a whole number of binders per category', () => {
  assert.ok(
    Number.isInteger(CONTEST.finalistsPerCategory) && CONTEST.finalistsPerCategory > 0,
    'finalistsPerCategory must be a positive integer',
  );
  // Every category pays exactly this many places, so a final shorter than the prize table would
  // leave prizes with nobody to win them.
  for (const c of CATEGORIES) {
    assert.ok(
      c.prizes.length <= CONTEST.finalistsPerCategory,
      `${c.slug} pays more places than the final has finalists`,
    );
  }
});

test('page cap is a positive integer (the public-page submission cap)', () => {
  assert.ok(Number.isInteger(CONTEST.pageCap) && CONTEST.pageCap > 0);
});

test('category labels resolve for every slug', () => {
  for (const c of CATEGORIES) assert.equal(categoryLabel(c.slug), c.label);
});

test('marketing copy has no em-dashes', () => {
  const copy = [CONTEST.headline, CONTEST.subhead, ...CATEGORIES.map((c) => c.blurb)];
  for (const s of copy) assert.equal(s.includes('—'), false, `em-dash in: ${s}`);
});
