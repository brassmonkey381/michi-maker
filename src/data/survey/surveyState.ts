/**
 * The survey's LOGIC, with no React and no Supabase in it: which questions are showing, what has
 * been answered, whether the thing can be sent, and what payload comes out the other end.
 *
 * Pure because it is the part that is easy to get quietly wrong and impossible to see: a
 * follow-up that records an answer to a question nobody was shown, an "answered" count that
 * counts an empty string, a payload that ships a skipped rating as a zero. Every function takes
 * the definition as its first argument rather than reading one from module state, so two surveys
 * can be on screen at once and nothing here can go stale between renders.
 *
 * Sibling app copies this file unchanged; surveyState.test.ts comes with it.
 */
import {
  type AnswerMap,
  type ChoiceOption,
  type ChoiceQuestion,
  type SurveyAnswer,
  type SurveyDef,
  type SurveyQuestion,
  otherKey,
  rowKey,
} from './surveyTypes.ts';

/** Every question in the definition, in order, ignoring visibility. */
export function allQuestions(def: SurveyDef): SurveyQuestion[] {
  return def.sections.flatMap((s) => s.questions);
}

/**
 * The options a derived choice actually offers: the source question's own options, narrowed to
 * the ones that were picked, so every label stays written in exactly one place.
 */
export function derivedOptions(def: SurveyDef, q: ChoiceQuestion, answers: AnswerMap): ChoiceOption[] {
  if (!q.optionsFrom) return q.options;
  const source = allQuestions(def).find((x) => x.id === q.optionsFrom);
  if (!source || source.kind !== 'choice') return [];
  const picked = answers[q.optionsFrom];
  const list = Array.isArray(picked) ? picked : typeof picked === 'string' ? [picked] : [];
  return source.options.filter((o) => list.includes(o.id));
}

/**
 * Is this question on screen? One level of dependency only: a `showWhen` may point at a question
 * that is itself hidden, and in that case this one is hidden too, which is the answer you want
 * and falls out of evaluating the parent's ANSWER rather than its visibility.
 */
export function isVisible(def: SurveyDef, q: SurveyQuestion, answers: AnswerMap): boolean {
  // A question whose options come from another answer has nothing to ask until that answer
  // offers a real choice. "Which of those comes first?" under a single pick is not a question,
  // it is the same tap again.
  if (q.kind === 'choice' && q.optionsFrom && derivedOptions(def, q, answers).length < 2) return false;
  if (!q.showWhen) return true;
  const value = answers[q.showWhen.id];
  if (value === undefined) return false;
  if (Array.isArray(value)) return value.some((v) => q.showWhen!.in.includes(v));
  return q.showWhen.in.includes(value as string | number | boolean);
}

export function visibleQuestions(def: SurveyDef, answers: AnswerMap): SurveyQuestion[] {
  return allQuestions(def).filter((q) => isVisible(def, q, answers));
}

/** An answer that is present but empty is not an answer. */
export function isAnswered(value: SurveyAnswer | undefined): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'boolean') return value; // an unticked consent box is not an answer
  return true; // a number, including 0, which is a real score on a 0-10 scale
}

/** True when this one question has something in it, matrix rows included. */
function questionAnswered(q: SurveyQuestion, answers: AnswerMap): boolean {
  if (q.kind === 'matrix') return q.rows.some((r) => isAnswered(answers[rowKey(q.id, r.id)]));
  return isAnswered(answers[q.id]);
}

/**
 * How many of the questions on screen have been answered. A matrix counts once, when ANY of its
 * rows is filled, because a visitor who rates two aspects out of five has told us something.
 */
export function answeredCount(def: SurveyDef, answers: AnswerMap): number {
  return visibleQuestions(def, answers).filter((q) => questionAnswered(q, answers)).length;
}

/**
 * THE ONLY GATE. One substantive answer sends. A survey that refuses to submit is a survey that
 * gets abandoned, and an abandoned survey is worth nothing, so the bar is "you told us
 * something" rather than a required-field list.
 *
 * Contact details do not count as substance: an address and a tick-box with nothing else attached
 * is not feedback, and letting it through would fill the table with rows nobody can act on.
 */
export function canSubmit(def: SurveyDef, answers: AnswerMap): boolean {
  return visibleQuestions(def, answers).some(
    (q) => q.kind !== 'email' && q.kind !== 'consent' && questionAnswered(q, answers),
  );
}

/** The anchor question's score, or null. Copied into its own column by the repo. */
export function anchorScore(def: SurveyDef, answers: AnswerMap): number | null {
  const q = allQuestions(def).find((x) => x.kind === 'scale' && x.anchor);
  if (!q) return null;
  const v = answers[q.id];
  return typeof v === 'number' ? v : null;
}

/** The address and its consent, pulled out of the answers into their own columns. */
export function contactOf(def: SurveyDef, answers: AnswerMap): { email: string | null; ok: boolean } {
  const emailQ = allQuestions(def).find((q) => q.kind === 'email');
  const consentQ = allQuestions(def).find((q) => q.kind === 'consent');
  const raw = emailQ ? answers[emailQ.id] : undefined;
  // Only a real address becomes a contact. An optional box collects "n/a", "none" and a stray
  // keystroke, and storing those as addresses means a follow-up list full of things nobody can
  // write to, plus a CHECK violation on the way in for anything without an '@'.
  const trimmed = typeof raw === 'string' ? raw.trim().slice(0, 254) : '';
  const email = looksLikeEmail(trimmed) ? trimmed.toLowerCase() : null;
  const ok = !!(email && consentQ && answers[consentQ.id] === true);
  return { email, ok };
}

/** Enough to reject an obvious typo, not enough to reject a valid address. */
export function looksLikeEmail(value: string): boolean {
  const v = value.trim();
  return v.length >= 3 && v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

/**
 * The answers as they go to the server: hidden questions dropped, text trimmed, empties removed,
 * strings capped at their question's maxLength.
 *
 * Dropping hidden answers matters. Someone scores 3, is asked what went wrong, types a sentence,
 * then moves the score to 10 and is asked what they like most instead. Without this the row
 * carries a complaint filed under the wrong question forever.
 */
export function toPayload(def: SurveyDef, answers: AnswerMap): AnswerMap {
  const out: AnswerMap = {};
  const keep = (key: string, value: SurveyAnswer | undefined, cap?: number) => {
    if (!isAnswered(value)) return;
    if (typeof value === 'string') {
      const trimmed = cap ? value.trim().slice(0, cap) : value.trim();
      if (trimmed) out[key] = trimmed;
      return;
    }
    out[key] = value as SurveyAnswer;
  };

  for (const q of visibleQuestions(def, answers)) {
    // THE ADDRESS AND ITS CONSENT LIVE IN THEIR OWN COLUMNS, AND ONLY THERE. A second copy in
    // the blob is PII that nothing reads and that every redaction misses: erase an account and
    // the contact column is cleared, while a copy buried in `answers` would sit there forever.
    if (q.kind === 'email' || q.kind === 'consent') continue;
    if (q.kind === 'matrix') {
      for (const r of q.rows) keep(rowKey(q.id, r.id), answers[rowKey(q.id, r.id)]);
      continue;
    }
    if (q.kind === 'choice' && q.optionsFrom) {
      // A derived pick is only meaningful while it is still one of the source's picks: deselect
      // the game you chose as "first" and the follow-up answer goes with it.
      const allowed = derivedOptions(def, q, answers).map((o) => o.id);
      const value = answers[q.id];
      if (typeof value === 'string' && allowed.includes(value)) keep(q.id, value);
      continue;
    }
    keep(q.id, answers[q.id], q.kind === 'text' ? q.maxLength : 254);
    // The free-text half of an "Other" chip rides along only while that chip is picked.
    if (q.kind === 'choice' && q.otherOptionId) {
      const picked = answers[q.id];
      const on = Array.isArray(picked) ? picked.includes(q.otherOptionId) : picked === q.otherOptionId;
      if (on) keep(otherKey(q.id), answers[otherKey(q.id)], 200);
    }
  }
  return out;
}

/** Toggle one option of a choice question, honouring its `max`. */
export function toggleChoice(
  current: SurveyAnswer | undefined,
  optionId: string,
  max: number,
): SurveyAnswer | undefined {
  if (max === 1) return current === optionId ? undefined : optionId;
  const list = Array.isArray(current) ? current : [];
  if (list.includes(optionId)) {
    const next = list.filter((x) => x !== optionId);
    return next.length ? next : undefined;
  }
  // At the cap the oldest pick drops out, so the last tap always does something visible. A chip
  // that silently refuses reads as broken.
  return list.length >= max ? [...list.slice(1), optionId] : [...list, optionId];
}
