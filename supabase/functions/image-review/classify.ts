/**
 * image-review's pure parts (MIC-029): the prompt, the answer's schema, and what each answer does
 * to the slot. No Deno imports, so `node --test` can load it (src/data/imageReview.test.ts), and
 * the read-only takedown check (state/mic029) uses the same words.
 */

/** The smallest current Claude model: about $0.0002 per image at today's pricing. */
export const REVIEW_MODEL = 'claude-haiku-5-5';

export const REVIEW_SYSTEM = [
  'You check images that users put into binders on a public trading-card collecting site.',
  'Label the image:',
  '- safe: no sexual content.',
  '- suggestive: sexualised posing or framing, lingerie, or partial nudity without explicit acts.',
  '- explicit: exposed genitals or breasts, sexual acts, or pornographic or hentai content, drawn or photographed.',
  'Set minor_concern to true if the image sexualises anyone who appears to be under 18, including drawn characters who look childlike.',
  'Give a reason of at most 12 words.',
].join('\n');

export const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    label: { type: 'string', enum: ['safe', 'suggestive', 'explicit'] },
    minor_concern: { type: 'boolean' },
    reason: { type: 'string' },
  },
  required: ['label', 'minor_concern', 'reason'],
  additionalProperties: false,
} as const;

export type ReviewLabel = 'safe' | 'suggestive' | 'explicit' | 'refused' | 'unchecked';
export type SlotVerdict = 'approved' | 'flagged' | 'unchecked';

/**
 * What a label does to the slot. Only "safe" is shown to visitors. Suggestive is HELD too (owner's
 * default, 2026-11-09); a refusal is treated like a flag (the model declined to look, a person
 * should); an image that could not be fetched or classified waits as unchecked.
 */
export function verdictFor(label: ReviewLabel): SlotVerdict {
  if (label === 'safe') return 'approved';
  if (label === 'unchecked') return 'unchecked';
  return 'flagged';
}

/** Parse the model's JSON answer; anything malformed counts as unchecked, never as safe. */
export function parseAnswer(text: string): { label: ReviewLabel; minor_concern: boolean; reason: string } {
  try {
    const o = JSON.parse(text) as { label?: unknown; minor_concern?: unknown; reason?: unknown };
    const label = o.label === 'safe' || o.label === 'suggestive' || o.label === 'explicit' ? o.label : 'unchecked';
    return { label, minor_concern: o.minor_concern === true, reason: typeof o.reason === 'string' ? o.reason.slice(0, 200) : '' };
  } catch {
    return { label: 'unchecked', minor_concern: false, reason: 'unreadable answer' };
  }
}
