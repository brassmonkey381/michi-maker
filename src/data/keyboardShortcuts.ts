/**
 * THE KEYBOARD AND MOUSE SHORTCUTS THE EDITOR ANSWERS, as a list a person can read.
 *
 * Shown once, the first time someone edits a binder on a keyboard (see ShortcutsCard.tsx), and
 * again from the ⌨ button in the tools row. Kept short on purpose (owner, 2026-09-14): the eight
 * a person is likely to use, not everything the handlers accept. The handlers live in
 * BinderScreen's EditorKeyboardShortcuts; this file is the words, so `node --test` can reach it
 * and so the card and the handlers cannot drift apart without a test noticing.
 */

export interface Shortcut {
  /** The keys, as they are printed on the card. */
  keys: string;
  /** What happens, in the user's words. */
  does: string;
}

/** Mac shows ⌘ where Windows shows Ctrl; the card swaps the word, nothing else. */
export function shortcutList(mod: 'Ctrl' | '⌘'): Shortcut[] {
  return [
    { keys: `${mod} Z`, does: 'Undo, or with Shift, redo' },
    { keys: `${mod} click`, does: 'Select several pockets' },
    { keys: 'E', does: 'Switch between Edit and Viewing mode' },
    { keys: 'A', does: 'Open or close the Art dock' },
    { keys: 'C or D', does: 'Open or close the Cards dock' },
    { keys: 'S', does: 'Open or close Settings' },
    { keys: 'Q', does: 'Quick look at the share image' },
    { keys: 'W', does: 'Move this page: swap it, or send it in front of another' },
    { keys: 'Esc', does: 'Close whatever is open' },
    { keys: '← → or wheel', does: 'Previous or next page, or type a page number to jump' },
    { keys: 'Delete', does: 'Clear the selected pocket' },
  ];
}

/** The plain keys (no modifier) the editor listens for, so a handler and the card agree. */
export const PLAIN_KEYS = { editMode: 'e', artDock: 'a', cardsDock: ['c', 'd'], settings: 's', quickPreview: 'q', movePage: 'w' } as const;
/** How long after the last digit a typed page number is acted on. Long enough for a two-digit number, short enough to feel like a jump. */
export const PAGE_NUMBER_DEBOUNCE_MS = 650;

/** Where the device remembers that the card has been shown. */
export const SHORTCUTS_SEEN_KEY = 'michi.shortcuts.seen.v1';
