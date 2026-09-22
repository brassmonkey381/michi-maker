/**
 * The survey logic is the part nobody can see working. These cover the three failures that would
 * silently poison the data: a follow-up recorded against a question that was never shown, a
 * submit gate that accepts an email address as if it were feedback, and a skipped rating stored
 * as a score.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  anchorScore,
  answeredCount,
  canSubmit,
  contactOf,
  derivedOptions,
  isAnswered,
  isVisible,
  looksLikeEmail,
  toPayload,
  toggleChoice,
} from './surveyState.ts';
import type { SurveyDef } from './surveyTypes.ts';

const DEF: SurveyDef = {
  app: 'test',
  id: 'test-survey',
  version: 1,
  title: 'T',
  lede: 'L',
  submitLabel: 'Send',
  thanks: { title: 'Thanks', body: 'Done.' },
  sections: [
    {
      id: 'main',
      questions: [
        { kind: 'scale', id: 'nps', prompt: 'Score?', min: 0, max: 10, minLabel: 'no', maxLabel: 'yes', anchor: true },
        { kind: 'text', id: 'why_low', prompt: 'What went wrong?', maxLength: 100, showWhen: { id: 'nps', in: [0, 1, 2, 3, 4, 5, 6] } },
        { kind: 'text', id: 'why_high', prompt: 'What do you like?', maxLength: 100, showWhen: { id: 'nps', in: [9, 10] } },
        {
          kind: 'matrix',
          id: 'aspects',
          prompt: 'Rate these',
          rows: [{ id: 'ease', label: 'Ease' }, { id: 'value', label: 'Value' }],
          points: [{ value: 1, label: 'Poor' }, { value: 5, label: 'Great' }],
          skipLabel: 'Not used',
        },
        {
          kind: 'choice',
          id: 'games',
          prompt: 'Games?',
          options: [{ id: 'mtg', label: 'Magic' }, { id: 'ygo', label: 'Yu-Gi-Oh' }, { id: 'other', label: 'Other' }],
          otherOptionId: 'other',
        },
        {
          kind: 'choice',
          id: 'games_first',
          prompt: 'Which first?',
          optionsFrom: 'games',
          options: [],
          max: 1,
        },
        { kind: 'email', id: 'email', prompt: 'Email' },
        { kind: 'consent', id: 'contact_ok', prompt: 'May we reply?' },
      ],
    },
  ],
};

test('a follow-up is hidden until its trigger answer appears, and by range', () => {
  const low = DEF.sections[0].questions[1];
  const high = DEF.sections[0].questions[2];
  assert.equal(isVisible(DEF, low, {}), false, 'shown with no score at all');
  assert.equal(isVisible(DEF, low, { nps: 3 }), true);
  assert.equal(isVisible(DEF, low, { nps: 9 }), false);
  assert.equal(isVisible(DEF, high, { nps: 9 }), true);
  assert.equal(isVisible(DEF, high, { nps: 7 }), false, 'a passive gets neither follow-up');
});

test('an answer to a question the visitor can no longer see is dropped from the payload', () => {
  // Scored 3, complained, then moved the score to 10. The complaint must not be filed.
  const answers = { nps: 10, why_low: 'the export was broken' };
  const payload = toPayload(DEF, answers);
  assert.equal(payload.why_low, undefined);
  assert.equal(payload.nps, 10);
});

test('zero is a real score and an empty string is not an answer', () => {
  assert.equal(isAnswered(0), true);
  assert.equal(isAnswered(''), false);
  assert.equal(isAnswered('   '), false);
  assert.equal(isAnswered([]), false);
  assert.equal(isAnswered(false), false, 'an unticked box says nothing');
  assert.equal(isAnswered(true), true);
  assert.deepEqual(toPayload(DEF, { nps: 0 }), { nps: 0 });
});

test('a skipped matrix row is absent, not zero', () => {
  const payload = toPayload(DEF, { 'aspects.ease': 4 });
  assert.equal(payload['aspects.ease'], 4);
  assert.ok(!('aspects.value' in payload), 'the unrated aspect must not appear at all');
});

test('contact details alone do not count as feedback', () => {
  assert.equal(canSubmit(DEF, {}), false);
  assert.equal(canSubmit(DEF, { email: 'a@b.com', contact_ok: true }), false);
  assert.equal(canSubmit(DEF, { nps: 7 }), true);
  assert.equal(canSubmit(DEF, { 'aspects.ease': 2 }), true);
  assert.equal(canSubmit(DEF, { why_low: 'it broke' }), false, 'hidden question cannot carry the submit');
});

test('the anchor score and the contact pair are lifted out for their own columns', () => {
  assert.equal(anchorScore(DEF, { nps: 8 }), 8);
  assert.equal(anchorScore(DEF, {}), null);
  assert.deepEqual(contactOf(DEF, { email: ' a@b.com ', contact_ok: true }), { email: 'a@b.com', ok: true });
  assert.deepEqual(contactOf(DEF, { email: 'a@b.com' }), { email: 'a@b.com', ok: false });
  assert.deepEqual(contactOf(DEF, { contact_ok: true }), { email: null, ok: false }, 'consent with no address is nothing');
});

test('the Other free text rides along only while Other is picked', () => {
  const on = toPayload(DEF, { games: ['other'], games_other: 'Netrunner' });
  assert.equal(on.games_other, 'Netrunner');
  const off = toPayload(DEF, { games: ['mtg'], games_other: 'Netrunner' });
  assert.equal(off.games_other, undefined);
});

test('multi-select toggles, and at the cap the oldest pick drops so every tap does something', () => {
  assert.deepEqual(toggleChoice(undefined, 'mtg', 9), ['mtg']);
  assert.deepEqual(toggleChoice(['mtg'], 'ygo', 9), ['mtg', 'ygo']);
  assert.deepEqual(toggleChoice(['mtg', 'ygo'], 'mtg', 9), ['ygo']);
  assert.equal(toggleChoice(['mtg'], 'mtg', 9), undefined, 'empty becomes absent');
  assert.deepEqual(toggleChoice(['a', 'b'], 'c', 2), ['b', 'c']);
  // Single select is a radio that can be cleared by pressing it again.
  assert.equal(toggleChoice('mtg', 'mtg', 1), undefined);
  assert.equal(toggleChoice('mtg', 'ygo', 1), 'ygo');
});

test('answeredCount counts a partly filled matrix once', () => {
  assert.equal(answeredCount(DEF, {}), 0);
  assert.equal(answeredCount(DEF, { nps: 5 }), 1, 'the follow-up it reveals is not itself answered');
  assert.equal(answeredCount(DEF, { 'aspects.ease': 3, 'aspects.value': 4 }), 1);
});

test('email validation rejects the typos and accepts the rest', () => {
  assert.equal(looksLikeEmail('a@b.co'), true);
  assert.equal(looksLikeEmail('first.last+tag@sub.example.com'), true);
  assert.equal(looksLikeEmail('nope'), false);
  assert.equal(looksLikeEmail('no@domain'), false);
  assert.equal(looksLikeEmail('two @spaces.com'), false);
});

test('text answers are capped at the length their question declares', () => {
  const long = 'x'.repeat(500);
  const payload = toPayload(DEF, { nps: 2, why_low: long });
  assert.equal((payload.why_low as string).length, 100);
});

test('a derived choice stays hidden until the source offers a real choice', () => {
  const first = DEF.sections[0].questions.find((q) => q.id === 'games_first');
  assert.ok(first);
  assert.equal(isVisible(DEF, first, {}), false, 'nothing picked');
  assert.equal(isVisible(DEF, first, { games: ['mtg'] }), false, 'one pick is not a choice');
  assert.equal(isVisible(DEF, first, { games: ['mtg', 'ygo'] }), true);
});

test('a derived choice offers exactly what was picked, with the source labels', () => {
  const first = DEF.sections[0].questions.find((q) => q.id === 'games_first');
  assert.ok(first && first.kind === 'choice');
  assert.deepEqual(
    derivedOptions(DEF, first, { games: ['ygo', 'mtg'] }).map((o) => o.label),
    ['Magic', 'Yu-Gi-Oh'],
    'source order, not pick order, so the list does not reshuffle under the cursor',
  );
});

test('a derived answer is dropped once its option stops being picked', () => {
  const kept = toPayload(DEF, { games: ['mtg', 'ygo'], games_first: 'mtg' });
  assert.equal(kept.games_first, 'mtg');
  // Unticked Magic afterwards: "Magic first" is no longer something they said.
  const gone = toPayload(DEF, { games: ['ygo', 'other'], games_first: 'mtg' });
  assert.equal(gone.games_first, undefined);
});
