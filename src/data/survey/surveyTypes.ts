/**
 * THE SURVEY CONTRACT. A survey is data: this file is the vocabulary a definition is written in,
 * and the renderer (components/survey) knows nothing else about any app.
 *
 * This file is APP-AGNOSTIC and is meant to be copied verbatim into a sibling app alongside
 * surveyState.ts, surveyRepo.ts and components/survey — the house precedent for cross-app reuse
 * is a declared mirror (analytics.ts, handoff.ts, promo.ts), not a package, and a survey renderer
 * has no business inside the browse kit. What each app writes for itself is ONE definition file
 * and ONE app id. See docs/FEEDBACK.md.
 *
 * KEPT SMALL ON PURPOSE. A type earns its place by being a distinct INTERACTION, not a distinct
 * look: a 0-10 recommendation score and a 1-5 rating are one `scale` with different bounds, and
 * single- and multi-select are one `choice` with a different `max`. Six kinds cover every
 * question a product survey actually needs, and every kind the renderer has to draw is a kind
 * the sibling app inherits for free.
 */

/** Everything a question can answer with. This union is exactly what lands in `answers` jsonb. */
export type SurveyAnswer = number | string | string[] | boolean;

export type AnswerMap = Record<string, SurveyAnswer>;

interface QuestionBase {
  /**
   * The key this answer is stored under, forever. Ids are the schema: renaming one does not
   * migrate old rows, it orphans them, so a question whose MEANING changes gets a new id and the
   * survey's version goes up.
   */
  id: string;
  prompt: string;
  /** One quiet line under the prompt. Scope, or what the answer is used for. */
  help?: string;
  /**
   * Progressive disclosure: show this question only once another has one of these answers.
   * Hidden questions are not just invisible, they are dropped from the payload, so a follow-up
   * never records an answer to a question the visitor was not shown.
   */
  showWhen?: { id: string; in: (string | number | boolean)[] };
}

/**
 * Any bounded numeric judgement: recommendation (0-10), satisfaction (1-5), agreement (1-5),
 * effort (1-5). Endpoints are always labelled, and negative is always on the left.
 */
export interface ScaleQuestion extends QuestionBase {
  kind: 'scale';
  min: number;
  max: number;
  minLabel: string;
  maxLabel: string;
  /**
   * THE WAY OUT. A rating row about a feature someone has never touched must be skippable, or
   * the average is a lie made of politeness. Omit it only when every respondent can answer.
   */
  skipLabel?: string;
  /**
   * The one tracked headline number for this survey. Its score is copied into its own column so
   * a roll-up never parses jsonb. At most one question per survey may set it.
   */
  anchor?: boolean;
}

export interface ChoiceOption {
  id: string;
  label: string;
  /** A quiet qualifier on the chip, for an option that needs one word of scope. */
  note?: string;
}

/** Single select when `max` is 1, multi-select otherwise. */
export interface ChoiceQuestion extends QuestionBase {
  kind: 'choice';
  options: ChoiceOption[];
  /** Defaults to every option, i.e. an unlimited multi-select. */
  max?: number;
  /** Picking this option reveals a free-text box; its text is stored under `<id>_other`. */
  otherOptionId?: string;
  /** Options come from another question's answer rather than being listed. Used by "which first". */
  optionsFrom?: string;
}

/**
 * Several rows sharing one scale: the aspect ratings, the interest block. One question id, one
 * answer per row stored as `<id>.<row id>`, because a matrix is a presentation of N questions
 * and pretending it is one answer makes the roll-up useless.
 */
export interface MatrixQuestion extends QuestionBase {
  kind: 'matrix';
  rows: { id: string; label: string }[];
  points: { value: number; label: string }[];
  skipLabel?: string;
}

export interface TextQuestion extends QuestionBase {
  kind: 'text';
  /** Rendered rows; 1 is a single-line input. */
  lines?: number;
  maxLength: number;
  placeholder?: string;
}

/** An address for a reply. Prefilled from the account when there is one. */
export interface EmailQuestion extends QuestionBase {
  kind: 'email';
}

/** A single opt-in. Never pre-ticked, ever. */
export interface ConsentQuestion extends QuestionBase {
  kind: 'consent';
}

export type SurveyQuestion =
  | ScaleQuestion
  | ChoiceQuestion
  | MatrixQuestion
  | TextQuestion
  | EmailQuestion
  | ConsentQuestion;

export interface SurveySection {
  id: string;
  title?: string;
  blurb?: string;
  questions: SurveyQuestion[];
}

export interface SurveyDef {
  /** The app id written to the `app` column. One const per app; the whole tenancy scheme. */
  app: string;
  /** Which survey this is, e.g. 'product-feedback'. Stable across versions. */
  id: string;
  /**
   * Bump when a question's MEANING changes, not when a typo is fixed. Answers keep the version
   * they were given under so a roll-up can refuse to average across a change.
   */
  version: number;
  title: string;
  lede: string;
  sections: SurveySection[];
  submitLabel: string;
  thanks: { title: string; body: string };
}

/** The id an `otherOptionId` free-text answer is stored under. */
export function otherKey(questionId: string): string {
  return `${questionId}_other`;
}

/** The id one matrix row's answer is stored under. */
export function rowKey(questionId: string, rowId: string): string {
  return `${questionId}.${rowId}`;
}
