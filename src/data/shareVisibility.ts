/**
 * WHO CAN ACTUALLY SEE A BINDER (MIC-025, 2026-11-09). Two switches decide it, and the app used to
 * show only one. A binder set public stays hidden from everyone but its owner while the owner's
 * Public profile switch (Settings) is off: the database's public read policy needs both (moderation
 * kit, 2026-08-26). The share sheet said "Public: anyone with the link can view this binder" in that
 * state, and Quick look then failed with a message that blamed the binder.
 *
 * One answer for every place that says it: the share sheet's switch, the editor's chip, and the
 * share picture's failure line.
 */
export type ShareVisibility = 'public' | 'hidden' | 'private';

export function shareVisibility(binderIsPublic: boolean, profileIsPublic: boolean | null | undefined): ShareVisibility {
  if (!binderIsPublic) return 'private';
  // An unknown profile (not loaded yet) is treated as public, as the policy's coalesce(true) does.
  return profileIsPublic === false ? 'hidden' : 'public';
}

/** The line under the share sheet's "Anyone with the link" switch. */
export function visibilityDetail(v: ShareVisibility): string {
  switch (v) {
    case 'public':
      return 'Public: anyone with the link can view this binder.';
    case 'hidden':
      return 'Set to public, but hidden: your profile is private, so only you can see it. Turn on Public profile in Settings to share it.';
    case 'private':
      return 'Private: only you can see it.';
  }
}

/** The editor chip's short label and its tooltip. */
export function visibilityChip(v: ShareVisibility): { label: string; tip: string } {
  switch (v) {
    case 'public':
      return { label: 'Public', tip: 'Anyone with the link can see this binder' };
    case 'hidden':
      return { label: 'Hidden', tip: 'Your profile is private, so only you can see this binder' };
    case 'private':
      return { label: 'Private', tip: 'Only you can see this binder' };
  }
}

/** What to say when the share picture does not draw, naming the switch to change. */
export function sharePictureFailure(v: ShareVisibility): string {
  switch (v) {
    case 'private':
      return 'This binder is private, so it has no share picture. Turn on "Anyone with the link" above.';
    case 'hidden':
      return 'Your profile is private, so this binder and its picture are hidden from everyone but you. Turn on Public profile in Settings.';
    case 'public':
      return 'The picture did not load. Check your connection and try again. A binder taken down by moderation has no share picture.';
  }
}
