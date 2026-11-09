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

export type ReviewLabel = 'safe' | 'suggestive' | 'explicit' | 'refused' | 'unchecked' | 'held';
export type SlotVerdict = 'approved' | 'flagged' | 'unchecked';

/**
 * What a label does to the slot. Only "safe" is shown to visitors. Suggestive is HELD too (owner's
 * default, 2026-11-09); a refusal is treated like a flag (the model declined to look, a person
 * should); an image that could not be fetched or classified waits as unchecked.
 */
export function verdictFor(label: ReviewLabel): SlotVerdict {
  // held: a page-mate of an explicit image (see image-review), flagged with it.
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

/** At most one admin email in this many minutes; flags in between wait for the next one. */
export const NOTICE_EVERY_MIN = 60;

/** The admin email for flags waiting in Studio: counts and binder links, never the images. */
export function noticeText(items: { binderId: string; label: string; minor: boolean }[], studioUrl: string, siteUrl: string): { subject: string; text: string } {
  const minors = items.filter((i) => i.minor).length;
  const byBinder = new Map<string, string[]>();
  for (const i of items) byBinder.set(i.binderId, [...(byBinder.get(i.binderId) ?? []), i.label]);
  const lines = [...byBinder].map(([id, labels]) => {
    const tally = Object.entries(labels.reduce<Record<string, number>>((t, l) => ({ ...t, [l]: (t[l] ?? 0) + 1 }), {}))
      .map(([l, n]) => `${n} ${l}`)
      .join(', ');
    return `- ${siteUrl}/binder/${id}  (${tally})`;
  });
  const subject = `michi-maker: ${items.length} image${items.length === 1 ? '' : 's'} held for review${minors ? ` (${minors} possible minor)` : ''}`;
  const text = [
    `The image safety check held ${items.length} image${items.length === 1 ? '' : 's'} from public binders. Visitors see empty pockets until you decide; nothing was deleted.`,
    '',
    ...lines,
    '',
    minors ? 'At least one is marked as a possible minor: preserve it and follow the NCMEC route; do not just remove it.\n' : '',
    `Review them in Studio: ${studioUrl}`,
  ].join('\n');
  return { subject, text };
}

/**
 * A 64-bit difference hash from a 9x8 grayscale thumbnail (row-major, 9 wide): each bit says
 * whether a pixel is brighter than its right neighbour. Re-encoding, resizing or a light crop
 * barely moves it, which is what lets a flag follow a picture across re-uploads (owner, 2026-11-09:
 * "follow the art"). Returns 16 hex characters.
 */
export function dhashHex(gray: ArrayLike<number>): string {
  if (gray.length !== 72) throw new Error('dhash needs a 9x8 grayscale thumbnail (72 values)');
  let hex = '';
  for (let y = 0; y < 8; y++) {
    let byte = 0;
    for (let x = 0; x < 8; x++) {
      byte = (byte << 1) | (gray[y * 9 + x] > gray[y * 9 + x + 1] ? 1 : 0);
    }
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}

/** Bits that differ between two 16-hex-character hashes (0 = the same picture). */
export function hammingHex(a: string, b: string): number {
  let d = 0;
  for (let i = 0; i < 16; i += 2) {
    let x = parseInt(a.slice(i, i + 2), 16) ^ parseInt(b.slice(i, i + 2), 16);
    while (x) {
      d += x & 1;
      x >>= 1;
    }
  }
  return d;
}

/** At or under this many differing bits, two pictures count as the same one. */
export const SAME_PICTURE_BITS = 6;
