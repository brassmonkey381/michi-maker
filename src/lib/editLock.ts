/**
 * ONE WRITER PER BROWSER.
 *
 * Two tabs open on the same account is not an exotic state — it is a link opened in a new tab —
 * and until now both of them wrote. Nothing in the client re-reads the server after load: there is
 * no realtime subscription on the binder tables, no refetch on focus, and no version check on any
 * write. So the second tab held a snapshot from whenever it loaded, and a whole-binder save ends
 * by pruning every page and slot its payload doesn't mention. That is how a stale tab silently
 * deletes a card the other tab just added — no error, no conflict, the card is simply gone.
 *
 * The fix is a lease, not a merge: at any moment exactly one tab may write, and the hand-off
 * carries a re-read. A tab that takes the lease pulls the server's truth BEFORE it is allowed to
 * save, so its first write can never prune away work it never saw.
 *
 * The lease lives in localStorage, which is shared across tabs of one browser profile and notifies
 * the others through the `storage` event. It is a lease and not a flag because a tab can die
 * without releasing anything (crash, force-quit, killed background tab): the holder re-stamps `at`
 * on a heartbeat, and a record that stops being re-stamped is abandoned and free for the taking.
 *
 * EVERYTHING HERE FAILS OPEN. If storage is unavailable (Safari private mode throws on write,
 * some embedded webviews block it outright) every read looks like "nobody holds it" and every tab
 * ends up believing it is the holder — which is exactly today's behaviour, no worse. Locking a
 * user out of their own binders because a storage quirk would be a far bigger bug than the one
 * being fixed here.
 *
 * Limits, stated plainly: this covers tabs of ONE browser profile. Two different browsers, two
 * devices, or two people on one account are outside its reach — those need a server-side guard
 * (an `updated_at` precondition on the write), which this lease is not a substitute for.
 *
 * The timers and listeners live in `use-edit-lock`; everything here is synchronous and injectable
 * so the decisions can be tested without a browser.
 */

/** What the stored record says about THIS tab. `free` = nobody holds a live lease. */
export type LeaseView = 'free' | 'holder' | 'follower';

export interface LeaseRecord {
  /** Identifies the document that holds the lease — one per tab, minted at load. */
  tabId: string;
  /** When the holder last re-stamped it (epoch ms). Staleness is measured from here. */
  at: number;
}

/** The slice of the Storage API used here, so tests can pass a plain object. */
export interface LeaseStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * How long a stamp stays believable. Comfortably more than three heartbeats: a tab that misses a
 * beat to a slow frame or a throttled timer must not lose the lease out from under a live edit.
 */
export const LEASE_MS = 9_000;

/** How often the holder re-stamps, and how often a follower checks whether the lease went free. */
export const BEAT_MS = 3_000;

/**
 * Two tabs opening at the same instant both read "free" and both write. Storage writes serialise,
 * so the LAST writer is well defined — each claimer re-reads after this pause (plus jitter) and
 * whoever no longer sees their own id steps down. Long enough to cover the other tab's write,
 * short enough that nobody watches a spinner for it.
 */
export const CLAIM_SETTLE_MS = 120;

const KEY_PREFIX = 'michi.binder-edit-lease.';

/** Per-account, so signing into a different account in another tab is not a contested lease. */
export function leaseKey(userId: string): string {
  return `${KEY_PREFIX}${userId}`;
}

/** A fresh per-tab identity. Never persisted: a reloaded tab is a new claimant, as it should be. */
export function newTabId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${rand}`;
}

/** Tolerant of anything: a hand-edited or half-written value reads as "no lease". */
export function parseLease(raw: string | null): LeaseRecord | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<LeaseRecord>;
    if (typeof parsed?.tabId !== 'string' || typeof parsed?.at !== 'number') return null;
    if (!parsed.tabId || !Number.isFinite(parsed.at)) return null;
    return { tabId: parsed.tabId, at: parsed.at };
  } catch {
    return null;
  }
}

/**
 * A stamp from the future is treated as live, not abandoned: clocks can jump (a laptop waking, an
 * NTP correction), and the safe reading of "I can't date this" is to leave the other tab alone.
 */
export function isAbandoned(rec: LeaseRecord | null, now: number, leaseMs = LEASE_MS): boolean {
  if (!rec) return true;
  return now - rec.at >= leaseMs;
}

export function viewOf(
  rec: LeaseRecord | null,
  tabId: string,
  now: number,
  leaseMs = LEASE_MS,
): LeaseView {
  if (isAbandoned(rec, now, leaseMs)) return 'free';
  return rec!.tabId === tabId ? 'holder' : 'follower';
}

/** The lease for one account, as seen by one tab. Every storage touch is swallowed — see the
 *  fail-open note at the top of the file. */
export class EditLease {
  readonly key: string;
  // Written out rather than declared as constructor parameter properties: the unit tests run under
  // node's strip-only TypeScript, which rejects that shorthand outright.
  private readonly tabId: string;
  private readonly storage: LeaseStorage;
  private readonly leaseMs: number;

  constructor(userId: string, tabId: string, storage: LeaseStorage, leaseMs = LEASE_MS) {
    this.key = leaseKey(userId);
    this.tabId = tabId;
    this.storage = storage;
    this.leaseMs = leaseMs;
  }

  private read(): LeaseRecord | null {
    try {
      return parseLease(this.storage.getItem(this.key));
    } catch {
      return null;
    }
  }

  private write(now: number): void {
    try {
      this.storage.setItem(this.key, JSON.stringify({ tabId: this.tabId, at: now }));
    } catch {
      // Quota, private mode, a blocked webview: nothing to do but carry on unlocked.
    }
  }

  peek(now: number): LeaseView {
    return viewOf(this.read(), this.tabId, now, this.leaseMs);
  }

  /** Take it unconditionally — the deliberate hand-off, when the user brings this tab forward. */
  claim(now: number): void {
    this.write(now);
  }

  /**
   * The heartbeat. Re-stamps only while nobody else holds a live lease, and reports whether this
   * tab still has it — so a holder that was superseded finds out on its next beat rather than
   * continuing to write over the tab that took over.
   */
  renew(now: number): boolean {
    const rec = this.read();
    if (rec && rec.tabId !== this.tabId && !isAbandoned(rec, now, this.leaseMs)) return false;
    this.write(now);
    return true;
  }

  /** Give it up on the way out, so the next tab starts editing immediately instead of waiting out
   *  the lease. Only ever clears OUR record — a tab that already lost the lease must not free the
   *  new holder's. */
  release(): void {
    try {
      const rec = this.read();
      if (rec && rec.tabId !== this.tabId) return;
      this.storage.removeItem(this.key);
    } catch {
      // Same as write: unavailable storage just means the lease ages out on its own.
    }
  }
}

/**
 * The browser's localStorage, or null when there isn't one to use (native, SSR, a profile with
 * storage blocked). Probed with a real write: merely reading `window.localStorage` succeeds in
 * some environments that then throw on every setItem.
 */
export function webLeaseStorage(): LeaseStorage | null {
  try {
    const store = globalThis?.localStorage;
    if (!store) return null;
    const probe = `${KEY_PREFIX}probe`;
    store.setItem(probe, '1');
    store.removeItem(probe);
    return store;
  } catch {
    return null;
  }
}
