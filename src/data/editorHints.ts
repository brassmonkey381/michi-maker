/**
 * ONE-TIME HINTS IN THE EDITOR, after the first-pocket walkthrough has done its job.
 *
 * The walkthrough is four steps and stays four steps: the measured failure is people leaving early,
 * and a longer tour up front costs the people it exists to keep. What comes after it is taught at
 * the moment it becomes relevant instead, once each, and one press ends it for good:
 *
 *   pocket-bar  the first time a card is selected: what the bar over it does.
 *   page-bar    the first time a page is about half full: the bar along its bottom edge dresses it.
 *
 * Each hint rings the control it names and says one sentence about it. Pure, so `node --test` can
 * hold the copy to the house rules (short, no em-dashes). The hook is hooks/use-editor-hint.ts.
 */
export type EditorHintId = 'pocket-bar' | 'page-bar';

export interface EditorHintCopy {
  title: string;
  body: string;
}

export const EDITOR_HINTS: Record<EditorHintId, EditorHintCopy> = {
  'pocket-bar': {
    title: 'This bar acts on the card you picked',
    body: 'Fill page builds the page around it. Similar and Colors find cards like it. Move sends it to any pocket.',
  },
  'page-bar': {
    title: 'Dress the page',
    body: 'The bar along the bottom edge sets this page’s background, sleeves and art backing, and selects several pockets at once.',
  },
};

/** Where the device remembers a hint has been seen. */
export const editorHintKey = (id: EditorHintId) => `michi.editorHint.${id}`;

/** A page is worth dressing once about half its pockets hold something. */
export function pageHalfFull(page: { rows: number; cols: number; slots: { rowSpan: number; colSpan: number }[] }): boolean {
  const cells = page.slots.reduce((n, s) => n + s.rowSpan * s.colSpan, 0);
  return cells * 2 >= page.rows * page.cols;
}
