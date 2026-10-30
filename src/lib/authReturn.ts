/**
 * WHERE TO GO BACK TO after a web sign-in that leaves the page.
 *
 * OAuth on web is a full-page round trip: the provider sends the browser to /auth-callback, which
 * used to send everyone to `/`. A guest who pressed "Sign in" inside the Fill page sheet, three
 * taps into their first binder, came back on the home screen with the binder closed and the sheet
 * gone - the one moment the walkthrough was building toward, lost (owner, 2026-10-29: "make the
 * return seamless"). In-sheet sign-ins (password, 6-digit code) never leave the page and never
 * needed this.
 *
 * sessionStorage, not localStorage: the round trip stays in one tab, and a note that outlives the
 * tab is a note that sends some later visit somewhere it did not ask to go. Ten-minute shelf life
 * for the same reason, inside the tab. Only a same-site path is ever accepted back, so nothing a
 * page could write here turns into an open redirect.
 *
 * Two writers. A surface that knows where it wants the person back (SignInPerk, with a query that
 * reopens its sheet) PINS its path. The auth store, right before it hands the browser to the
 * provider, remembers the current URL unless something fresh is already pinned. Native never
 * reaches any of this: sessionStorage is undefined on Hermes and every function is a no-op.
 */
const KEY = 'michi.auth.return';
const TTL_MS = 10 * 60 * 1000;

interface Note {
  path: string;
  at: number;
  pinned: boolean;
}

function storage(): Storage | null {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
  } catch {
    return null; // storage access can itself throw in a locked-down browser
  }
}

function read(): Note | null {
  const s = storage();
  if (!s) return null;
  try {
    const raw = s.getItem(KEY);
    if (!raw) return null;
    const n = JSON.parse(raw) as Partial<Note>;
    if (typeof n.path !== 'string' || typeof n.at !== 'number') return null;
    if (Date.now() - n.at > TTL_MS) return null;
    return { path: n.path, at: n.at, pinned: !!n.pinned };
  } catch {
    return null;
  }
}

/** A path on THIS site: starts with one slash, and is not the callback itself. */
export function isSafeReturnPath(path: string): boolean {
  return /^\/(?!\/)/.test(path) && !path.startsWith('/auth-callback');
}

/**
 * Remember where to come back to. With no argument, the current location; `pinned` marks a
 * surface's explicit choice, which the auth store's later unpinned write must not overwrite.
 */
export function rememberAuthReturn(path?: string, pinned = false): void {
  const s = storage();
  if (!s) return;
  try {
    const target = path ?? (typeof window !== 'undefined' ? `${window.location.pathname}${window.location.search}` : null);
    if (!target || !isSafeReturnPath(target)) return;
    const existing = read();
    if (!pinned && existing?.pinned) return; // the surface that opened the sheet knows better
    s.setItem(KEY, JSON.stringify({ path: target, at: Date.now(), pinned } satisfies Note));
  } catch {
    // never let a bookkeeping write break a sign-in
  }
}

/** Drop the note - the sheet closed without leaving the page, so there is nothing to return to. */
export function forgetAuthReturn(): void {
  try {
    storage()?.removeItem(KEY);
  } catch {
    // ignore
  }
}

/** Read AND clear: the callback asks exactly once. Null when nothing fresh and safe is stored. */
export function consumeAuthReturn(): string | null {
  const n = read();
  forgetAuthReturn();
  return n && isSafeReturnPath(n.path) ? n.path : null;
}
