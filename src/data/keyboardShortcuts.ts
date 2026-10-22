/**
 * THE KEYBOARD AND MOUSE SHORTCUTS THE EDITOR ANSWERS, as a list a person can read.
 *
 * Shown once, the first time someone edits a binder on a keyboard (see ShortcutsCard.tsx), and
 * again from the ⌨ button in the tools row. Kept short on purpose (owner, 2026-09-14): the eight
 * a person is likely to use, not everything the handlers accept. The handlers live in
 * BinderScreen's EditorKeyboardShortcuts; this file is the words, so `node --test` can reach it
 * and so the card and the handlers cannot drift apart without a test noticing.
 */

export type ShortcutGroup = 'Binder' | 'Editing' | 'Share';

export interface Shortcut {
  /** The keys, as they are printed on the card. */
  keys: string;
  /** What happens, in the user's words. */
  does: string;
  /** Which heading it sits under (owner, 2026-10-16: sixteen keys read as three short lists). */
  group: ShortcutGroup;
}

/** The headings, in the order the card prints them (owner, 2026-10-16: the binder itself, then
 *  changing it, then getting it out). */
export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = ['Binder', 'Editing', 'Share'];

/** Mac shows ⌘ where Windows shows Ctrl; the card swaps the word, nothing else. */
export function shortcutList(mod: 'Ctrl' | '⌘'): Shortcut[] {
  // TWO OR THREE WORDS EACH (owner, 2026-09-18): the key is the subject, the label only names what
  // it toggles or does. Sentences made the card a page of reading for twelve keys.
  return [
    { keys: '← → or wheel', does: 'Turn page, or type one', group: 'Binder' },
    { keys: 'E', does: 'Edit / View', group: 'Binder' },
    { keys: 'S', does: 'Settings', group: 'Binder' },
    { keys: 'Esc', does: 'Close', group: 'Binder' },
    { keys: `${mod} Z`, does: 'Undo (Shift: redo)', group: 'Editing' },
    { keys: `${mod} click`, does: 'Multi-select', group: 'Editing' },
    { keys: 'Delete', does: 'Clear pocket', group: 'Editing' },
    { keys: 'N', does: 'New page', group: 'Editing' },
    { keys: 'G', does: 'Arrange page', group: 'Editing' },
    { keys: 'W', does: 'Move page', group: 'Editing' },
    { keys: 'C', does: 'Complete page', group: 'Editing' },
    { keys: 'D', does: 'Cards dock', group: 'Editing' },
    { keys: 'A', does: 'Art dock', group: 'Editing' },
    { keys: 'Q', does: 'Share image preview', group: 'Share' },
    { keys: 'R', does: 'Share panel', group: 'Share' },
    { keys: 'P', does: 'Print preview', group: 'Share' },
    { keys: 'F', does: 'Save full-size image', group: 'Share' },
  ];
}

/** The same list under its three headings, for the card. */
export function shortcutGroups(mod: 'Ctrl' | '⌘'): { title: ShortcutGroup; items: Shortcut[] }[] {
  const list = shortcutList(mod);
  return SHORTCUT_GROUPS.map((title) => ({ title, items: list.filter((s) => s.group === title) }));
}

/** The plain keys (no modifier) the editor listens for, so a handler and the card agree. */
// C moved from the Cards dock to Complete page (owner, 2026-10-22); D alone opens the dock.
export const PLAIN_KEYS = { editMode: 'e', artDock: 'a', cardsDock: ['d'], settings: 's', quickPreview: 'q', share: 'r', print: 'p', fullImage: 'f', movePage: 'w', newPage: 'n', arrange: 'g', complete: 'c' } as const;
/** How long after the last digit a typed page number is acted on. Long enough for a two-digit number, short enough to feel like a jump. */
export const PAGE_NUMBER_DEBOUNCE_MS = 650;

/** Where the device remembers that the card has been shown. */
export const SHORTCUTS_SEEN_KEY = 'michi.shortcuts.seen.v1';
