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
    { keys: `${mod} Z`, does: 'Undo' },
    { keys: `${mod} Shift Z`, does: 'Redo' },
    { keys: `${mod} click`, does: 'Select several pockets' },
    { keys: 'E', does: 'Switch between Edit and Viewing mode' },
    { keys: 'A', does: 'Open or close the Art dock' },
    { keys: 'C', does: 'Open or close the Cards dock' },
    { keys: 'S', does: 'Open or close Settings' },
    { keys: '← →', does: 'Previous or next page' },
    { keys: 'Delete', does: 'Clear the selected pocket' },
  ];
}

/** The plain keys (no modifier) the editor listens for, so a handler and the card agree. */
export const PLAIN_KEYS = { editMode: 'e', artDock: 'a', cardsDock: ['c', 'd'], settings: 's' } as const;

/** Where the device remembers that the card has been shown. */
export const SHORTCUTS_SEEN_KEY = 'michi.shortcuts.seen.v1';
