/**
 * FEATURES IN BETA (owner, 2026-11-04): built and shipped, but offered in the binder editor only
 * to the accounts testing them, by user id (immutable; a username is not). Everything else
 * stays: a binder that already uses the feature still renders it, the share image draws it,
 * the daily puzzle keeps its toggles. Only the editor's entry points are gated, so the owner
 * can keep improving the UI in production without every member meeting it half-finished.
 *
 * Remove an entry here to open the feature to everyone. PURE: no react-native.
 */

/** The art view (art windows, connected sheets, mats): the owner's account. */
export const ART_VIEW_TESTERS: ReadonlySet<string> = new Set(['689143c4-5d32-4905-991e-c894f9cf2620']);

/** Whether this signed-in user sees the art view in the binder editor. A guest does not. */
export const canEditArtView = (userId: string | null | undefined): boolean => !!userId && ART_VIEW_TESTERS.has(userId);
