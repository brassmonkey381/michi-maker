/**
 * THE FIRST-POCKET WALKTHROUGH: what it says, and when it is over.
 *
 * THE MEASURED FAILURE. People create a binder, open it to edit, TAP A POCKET, and never add a
 * card. They leave. The tap is the part they get right, so a walkthrough that opens by explaining
 * how to tap a pocket spends its first and best look on the one thing already understood. What
 * they do not find is the ＋ on a card tile in the browser that opens next, which is the single
 * unperformed action between a new binder and a filled one.
 *
 * So this is two sentences and a ring, not a tour: a ring on the first empty pocket, and one line
 * INSIDE the card browser's own head, where the person is looking when they stall. It advances on
 * what they actually do, never on a Next button, and one press of its ✕ ends it for good.
 *
 * PURE, and importing nothing from react-native, so `node --test` can reach all of it. The hook
 * that owns the timing is src/hooks/use-first-pocket-walkthrough.ts; the two views are
 * PocketRing.tsx and WalkthroughBanner.tsx.
 */

/** The step a reader is on. Fixed ids, never an array index: they are analytics values. */
export type WalkthroughStep = 'ring' | 'card' | 'placed';

/** Why it will never show again. */
export type WalkthroughEnding = 'not-needed' | 'placed' | 'dismissed' | 'ignored';

/**
 * WHAT WE REMEMBER. Two numbers and a timestamp, held in `profiles.preferences` (jsonb, already
 * there) and mirrored to device storage for guests, who have no profile row and are most of the
 * population this is for.
 */
export interface WalkthroughRecord {
  /** Schema tag, so a later shape can be told from this one rather than guessed at. */
  v: 1;
  /** How many times the editor has been opened on a binder that still had no cards. */
  opens: number;
  /** When it retired. NON-NULL MEANS NEVER AGAIN, on any device, for any binder. */
  retiredAt: string | null;
}

export const EMPTY_RECORD: WalkthroughRecord = { v: 1, opens: 0, retiredAt: null };

/**
 * How many times someone may open an empty binder's editor before this stops offering to help.
 * Three, because a fourth showing is no longer help, it is the app repeating itself at somebody
 * who has now twice decided not to follow it. On its own line so it can be re-set from data.
 */
export const MAX_EDITOR_OPENS = 3;

/** Storage is user-writable and jsonb is whatever was last put there: shape-check, never trust. */
export function normalizeRecord(value: unknown): WalkthroughRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return EMPTY_RECORD;
  const raw = value as { v?: unknown; opens?: unknown; retiredAt?: unknown };
  if (raw.v !== 1) return EMPTY_RECORD;
  const opens = typeof raw.opens === 'number' && Number.isFinite(raw.opens) ? Math.max(0, Math.floor(raw.opens)) : 0;
  const retiredAt = typeof raw.retiredAt === 'string' && raw.retiredAt ? raw.retiredAt : null;
  return { v: 1, opens, retiredAt };
}

/**
 * The account's copy and the device's copy, resolved into one.
 *
 * A DERIVATION, not a chain of writes: whichever has seen more opens is right about opens, and
 * whichever retired first is right about retirement. Both halves are monotone, so the merge is
 * order-independent and two devices disagreeing can only ever cost one extra showing, never a
 * wrong state.
 */
export function mergeRecord(a: WalkthroughRecord, b: WalkthroughRecord): WalkthroughRecord {
  const retiredAt =
    a.retiredAt && b.retiredAt ? (a.retiredAt < b.retiredAt ? a.retiredAt : b.retiredAt) : (a.retiredAt ?? b.retiredAt);
  return { v: 1, opens: Math.max(a.opens, b.opens), retiredAt };
}

export interface WalkthroughInputs {
  /** Does this binder hold a card in any pocket, on any page, RIGHT NOW? */
  hasCard: boolean;
  /**
   * Did it already hold one when this editor session began? That is the difference between a
   * binder the wizard or the story builder filled (nothing to teach, retire in silence) and the
   * first card landing while someone is being shown how, which is the whole point and earns a
   * closing line.
   */
  hadCardOnArrival: boolean;
  /** The merged record. */
  record: WalkthroughRecord;
  /** Is the workbench actually open and usable (BinderScreen's `editing`)? */
  editing: boolean;
  /** Is the Slice Studio up? It mounts IN-TREE, not as a modal, so an overlay would sit over it. */
  studio: boolean;
  /** Is the card browser open on a pocket? Decides which line the banner carries. */
  pickerOpen: boolean;
}

export type WalkthroughState =
  | { show: false; retire: WalkthroughEnding | null }
  | { show: true; step: WalkthroughStep };

/**
 * What to draw, or what to write down and stop.
 *
 * `retire` is returned rather than performed, so this stays pure and the hook owns the writing.
 * `not-needed` is the silent ending: a binder built by the wizard or the story builder already has
 * cards, so this retires on its first sight of it with nothing drawn and no event.
 */
export function resolveState({
  hasCard,
  hadCardOnArrival,
  record,
  editing,
  studio,
  pickerOpen,
}: WalkthroughInputs): WalkthroughState {
  if (record.retiredAt) return { show: false, retire: null };
  if (hadCardOnArrival) return { show: false, retire: 'not-needed' };
  if (!editing || studio) return { show: false, retire: null };
  if (record.opens > MAX_EDITOR_OPENS) return { show: false, retire: 'ignored' };
  if (hasCard) {
    // It worked. One closing line while the browser they did it in is still open, and the moment
    // they close it the whole thing is over: the closing line is a pointer, not a fourth step to
    // be got through, and it must never be the reason someone has to press something.
    return pickerOpen ? { show: true, step: 'placed' } : { show: false, retire: 'placed' };
  }
  return { show: true, step: pickerOpen ? 'card' : 'ring' };
}

/**
 * THE COPY. Two lines, and neither of them explains the pocket tap.
 *
 * The ＋ named here is the quick-place pill on a card TILE, which is drawn at every width. The
 * pocket's own ＋ glyph is not drawn under a 220px page, so no line here mentions one.
 */
export const WALKTHROUGH_COPY = {
  /** While the browser is closed: the ring is doing the talking, this names what it is. */
  ring: 'Tap a pocket to fill it. The card browser opens beside your binder.',
  /** The line that matters, shown inside the browser's own head. */
  card: 'Search for a card, then press the ＋ on it. It lands in the pocket you picked.',
  /** Once the first card is in, one pointer onward and then silence. */
  placed: 'That one is in. Tap a card you placed to see more ways to fill the page.',
} as const satisfies Record<WalkthroughStep, string>;
