/**
 * THE FIRST-POCKET WALKTHROUGH: what it says, and when it is over.
 *
 * THE MEASURED FAILURE. People create a binder, open it to edit, TAP A POCKET, and never add a
 * card. They leave. The tap is the part they get right, so a walkthrough that opens by explaining
 * how to tap a pocket spends its first and best look on the one thing already understood. What
 * they do not find is the ＋ on a card tile in the browser that opens next, which is the single
 * unperformed action between a new binder and a filled one.
 *
 * So this is a ring and a few sentences, not a tour: a ring on the first empty pocket, and one line
 * INSIDE the card browser's own head, where the person is looking when they stall. It advances on
 * what they actually do, never on a Next button, and one press of its ✕ ends it for good.
 *
 * THREE STEPS, NOT FOUR (owner, 2026-10-29, walking the Reddit-ad funnel). A fourth step once
 * pointed at the add-page button after the first card landed; the ad arrival lands two taps from
 * a filled page and the fourth callout was one more thing in the way. The walkthrough ends when
 * the card is placed. `paged` stays in WalkthroughEnding because it was emitted historically;
 * nothing produces it now.
 *
 * PURE, and importing nothing from react-native, so `node --test` can reach all of it. The hook
 * that owns the timing is src/hooks/use-first-pocket-walkthrough.ts; the two views are
 * PocketRing.tsx and WalkthroughBanner.tsx.
 */

/** The step a reader is on. Fixed ids, never an array index: they are analytics values. */
export type WalkthroughStep = 'ring' | 'card' | 'placed';

/**
 * WHICH WALKTHROUGH. `first-pocket` is the three steps above, for an empty binder. `seeded` is the
 * two steps below, for a tagged ad arrival whose binder already holds three themed cards
 * (data/seedPages): the walkthrough id on every walkthrough.shown / .step / .done row, so the two
 * never mix in the stream.
 */
export type WalkthroughVariant = 'first-pocket' | 'seeded';

/** The seeded variant's steps: drag the picture across, tap Complete, then the payoff over the filled page. */
export type SeededStep = 'art' | 'complete' | 'filled';

/** Why it will never show again. */
export type WalkthroughEnding = 'not-needed' | 'placed' | 'dismissed' | 'ignored' | 'paged';

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
  /**
   * Has the Fill page sheet been opened this session? That is the tap step three names, so it is
   * what ends the step (owner, 2026-10-29, on a phone: the browser is a sheet over the page, so a
   * step that lived only while the browser was open was never seen there).
   */
  filled: boolean;
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
  filled,
}: WalkthroughInputs): WalkthroughState {
  if (record.retiredAt) return { show: false, retire: null };
  if (hadCardOnArrival) return { show: false, retire: 'not-needed' };
  if (!editing || studio) return { show: false, retire: null };
  if (record.opens > MAX_EDITOR_OPENS) return { show: false, retire: 'ignored' };
  if (hasCard) {
    // The closing line stays up, browser open or closed, until the reader opens Fill page, the
    // tap it names, or presses its cross. Walking away draws nothing and a return with a card
    // retires it in silence.
    return filled ? { show: false, retire: 'placed' } : { show: true, step: 'placed' };
  }
  return { show: true, step: pickerOpen ? 'card' : 'ring' };
}

/**
 * THE COPY, as callouts rather than captions.
 *
 * A single line along the top of a panel is the easiest thing on a screen to skip, which is what
 * the first build of this was and why it changed (owner, 2026-09-10). Each step is now a card with
 * a heading, a sentence, its place in the sequence, and an arrow pointing at the control it is
 * talking about. The arrow is the part that does the work: a reader who has stalled needs to be
 * shown where, not told what.
 *
 * The ＋ named here is the quick-place pill on a card TILE, which is drawn at every width. The
 * pocket's own ＋ glyph is not drawn under a 220px page, so no line here mentions one.
 */
export interface WalkthroughCopy {
  /** Which of the steps, for the counter. */
  index: number;
  /** How many steps the counter is out of; WALKTHROUGH_TOTAL when absent. */
  total?: number;
  title: string;
  body: string;
  /** Where the arrow on the callout points, toward the control the body names. */
  arrow: 'down' | 'up';
  /** A phrase of the title drawn in the accent colour (owner, 2026-10-30: "bold / highlight CREATE AN ACCOUNT"). */
  highlight?: string;
}

export const WALKTHROUGH_TOTAL = 3;

export const WALKTHROUGH_COPY = {
  /** The browser is shut and the ring is doing the pointing; this names what the ring means. */
  ring: {
    index: 1,
    title: 'Pick a pocket',
    body: 'Tap the ringed pocket above. The card browser opens beside your binder.',
    // Up, because the callout sits UNDER the pocket it names: below always fits, where above runs
    // off the top of the page for a pocket on the first row.
    arrow: 'up',
  },
  /** Inside the browser, above the search box it is talking about. */
  card: {
    index: 2,
    title: 'Find a card, then drop it in',
    body: 'Search below for any card you like, then press the ＋ in its corner. It lands in the pocket you picked.',
    arrow: 'down',
  },
  /** Over the binder, pointing at the card that just landed. */
  placed: {
    index: 3,
    title: 'Now fill the page around it',
    body: 'Tap the card you just placed and choose Fill page. Michi builds the rest of the page to match it.',
    arrow: 'up',
  },
} as const satisfies Record<WalkthroughStep, WalkthroughCopy>;

/**
 * Step three for a GUEST. Until 2026-10-30 this said "Create a free account, and Michi builds the
 * rest", because Fill page ran on the signed-in catalog. A guest now gets one fill without it
 * (docs/GUEST-FILL-PLAN.md), so the step promises the page and says the first one is free; the
 * account ask comes after, in the toast and the wall. A Reddit ad click lands here as a guest, two
 * taps in (owner, 2026-10-29).
 */
export const WALKTHROUGH_COPY_GUEST_PLACED: WalkthroughCopy = {
  ...WALKTHROUGH_COPY.placed,
  body: 'Tap the card you just placed and choose Fill page. Michi builds the rest of the page to match it. Your first fill is free.',
};

/**
 * THE SEEDED VARIANT (owner, 2026-10-30, via analytics-studio). A Reddit-ad arrival used to meet
 * nine empty pockets and a ring; 387 of 435 never opened the browser and most left within three
 * seconds of the ring. Now the page already holds three themed cards (data/seedPages) and the
 * first step points at Complete: one tap, a choice of fill, a full page. That tap is the guest's
 * one fillPage sample, exactly as the Fill sheet spends it. The second step is the payoff over the
 * finished page and asks for the free account; it stays until its cross.
 */
export const SEEDED_TOTAL = 3;

export const SEEDED_COPY = {
  /** Under the picture in pocket 4, ringed, its resize handle already showing (owner, 2026-10-30:
   *  the first act is the editor's best trick). Done at two pockets wide, so the pull is short. */
  art: {
    index: 1,
    total: SEEDED_TOTAL,
    title: 'Drag the picture across the row',
    body: 'Pull the handle on its corner to the right until it covers two or three pockets.',
    arrow: 'up',
  },
  /** Under the Complete tool in the page bar, ringed, arrow up at it. */
  complete: {
    index: 2,
    total: SEEDED_TOTAL,
    title: 'Tap Complete to fill this page',
    body: 'Pick how the rest of the page is filled. Or tap an empty pocket to add a card of your own.',
    arrow: 'up',
  },
  /** The same place, once the page is full. The owner's line (2026-10-30). */
  filled: {
    index: 3,
    total: SEEDED_TOTAL,
    title: 'Create an account to save your binder and keep working',
    highlight: 'Create an account',
    body: 'It is free, and this page comes with you.',
    arrow: 'up',
  },
} as const satisfies Record<SeededStep, WalkthroughCopy>;

export interface SeededInputs {
  /** The merged record, shared with the first-pocket variant: one walkthrough per person. */
  record: WalkthroughRecord;
  editing: boolean;
  studio: boolean;
  /** Has a Fill or Complete run placed cards this session? The payoff step. */
  completed: boolean;
  /** Is the page being edited full? Also the payoff: a hand-placed last card counts. */
  pageFull: boolean;
  /** Was it already full when this editor session began? Nothing to teach, retire in silence. */
  arrivedFull: boolean;
  /** Is the seeded picture two pockets wide or more, or gone? (data/seedPages seedArtDone) */
  artDone: boolean;
}

export type SeededState = { show: false; retire: WalkthroughEnding | null } | { show: true; step: SeededStep };

/** The seeded variant's resolveState: the same endings, three steps. A fill or a full page is the
 *  payoff whatever became of the picture, so Complete first never strands anyone on step one. */
export function resolveSeededState({ record, editing, studio, completed, pageFull, arrivedFull, artDone }: SeededInputs): SeededState {
  if (record.retiredAt) return { show: false, retire: null };
  if (arrivedFull) return { show: false, retire: 'not-needed' };
  if (!editing || studio) return { show: false, retire: null };
  if (record.opens > MAX_EDITOR_OPENS) return { show: false, retire: 'ignored' };
  if (completed || pageFull) return { show: true, step: 'filled' };
  return { show: true, step: artDone ? 'complete' : 'art' };
}
