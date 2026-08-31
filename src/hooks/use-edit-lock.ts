/**
 * The timers and browser listeners behind the edit lease (`@/lib/editLock` holds the decisions).
 *
 * The hand-off is automatic and follows FOCUS: the tab you are looking at is the tab that may
 * write. That is deliberate — a lease you have to claim by hand would be a nuisance in the case
 * that actually happens (one person, two tabs, switching between them), and a nuisance is how a
 * safety feature gets switched off. The protection does not come from making the second tab ask
 * permission; it comes from the fact that taking the lease pulls the server's state first.
 *
 * Hence `resyncing`, which is not decoration. Between "this tab has the lease" and "this tab may
 * write" there has to be a re-read, because the OTHER tab has been writing and this one's view is
 * from whenever it last loaded. A whole-binder save prunes everything its payload does not
 * mention, so writing from a stale view is exactly how one tab deletes the other's work. The store
 * refuses to persist while the status is `resyncing`, and it is only ever entered on a real
 * hand-off — a lone tab claims the lease at load, never resyncs, and never sees it.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { BEAT_MS, CLAIM_SETTLE_MS, EditLease, newTabId, webLeaseStorage } from '@/lib/editLock';

export type EditLockStatus =
  /** This tab owns the lease and may write. */
  | 'holder'
  /** Another tab owns it; this one is read-only until it is brought forward. */
  | 'follower'
  /** Just took the lease and is pulling the server's truth before writing anything. */
  | 'resyncing'
  /** No lease is possible here (native, no session, storage blocked) — write freely. */
  | 'unsupported';

export interface EditLockState {
  status: EditLockStatus;
  /** The one thing callers usually want: may this tab persist right now? */
  canEdit: boolean;
  /** Bring editing here on purpose. Focus does this on its own; the button exists for the case
   *  where someone is looking straight at the read-only banner and wants it gone. */
  takeOver: () => void;
}

/** One identity per document, minted at load and never persisted: a reloaded tab is a new
 *  claimant, which is right — the old one is gone. */
const TAB_ID = newTabId();

export function useEditLock(
  userId: string | null,
  /** Pull the server's state. Awaited on a hand-off, before this tab is allowed to write. */
  resync?: () => Promise<void>,
): EditLockState {
  // Probed once per mount, not per render: webLeaseStorage does a real write to find out
  // whether storage works at all. Null means no lease is possible here, and the whole
  // mechanism steps aside — see the fail-open note in editLock.ts.
  const storage = useMemo(() => (Platform.OS === 'web' ? webLeaseStorage() : null), []);
  const leaseable = !!storage && !!userId;
  // Only ever the LEASE's verdict. Whether a lease applies at all is derived below, which is
  // what keeps the unsupported case out of an effect (and out of a cascading render).
  const [leaseStatus, setLeaseStatus] = useState<'holder' | 'follower' | 'resyncing'>('holder');
  const status: EditLockStatus = leaseable ? leaseStatus : 'unsupported';
  // Read only from inside the lease loop, so a caller passing a fresh closure each render doesn't
  // tear down and rebuild the lease (which would drop it and re-take it, resyncing forever).
  const resyncRef = useRef(resync);
  useEffect(() => {
    resyncRef.current = resync;
  }, [resync]);

  // Set by the effect below; the exported takeOver just rings this bell.
  const forceRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!storage || !userId) return;

    const lease = new EditLease(userId, TAB_ID, storage);
    let active = true;
    let settle: ReturnType<typeof setTimeout> | undefined;
    // `init` separates the first acquisition from a hand-off: a tab that has just loaded is
    // already current and must not throw away its freshly-fetched state on a pointless resync.
    let phase: 'init' | 'holder' | 'follower' = 'init';

    const become = (next: 'holder' | 'follower') => {
      if (!active) return;
      if (next === 'follower') {
        phase = 'follower';
        setLeaseStatus('follower');
        return;
      }
      if (phase === 'holder') return; // already writing; nothing changed
      const handedOver = phase === 'follower';
      phase = 'holder';
      const job = resyncRef.current;
      if (!handedOver || !job) {
        setLeaseStatus('holder');
        return;
      }
      setLeaseStatus('resyncing');
      job()
        .catch((error) => {
          // A failed refresh must not strand the tab read-only for good. It goes editable on a
          // possibly-stale view — the same risk as before this existed, not a new one.
          console.warn(`[michi-maker] edit hand-off refresh failed: ${(error as Error).message}`);
        })
        .then(() => {
          // `phase` may have flipped back to follower while the fetch was in the air.
          if (active && phase === 'holder') setLeaseStatus('holder');
        });
    };

    /** Two tabs that both read "free" both write; whoever's id is no longer there steps down. */
    const confirmClaim = () => {
      clearTimeout(settle);
      settle = setTimeout(
        () => {
          if (!active) return;
          if (lease.peek(Date.now()) === 'follower') become('follower');
        },
        CLAIM_SETTLE_MS + Math.random() * CLAIM_SETTLE_MS,
      );
    };

    /** Is the user looking at THIS tab right now? Then it is the one that should be writing. */
    const frontmost = () => document.hasFocus() && document.visibilityState === 'visible';
    // null on the first pass, which counts as a rise: a tab that OPENS in front never fires a
    // focus event (it was focused from the start) and would otherwise sit read-only until the
    // other tab's lease lapsed. Opened in the BACKGROUND it reads false, and correctly follows.
    let wasFrontmost: boolean | null = null;

    const evaluate = (force = false) => {
      if (!active) return;
      const now = Date.now();
      // Polling for the RISE, not for the state. Polling the state would mean re-taking the
      // lease on every beat for as long as this tab is in front — harmless when exactly one tab
      // believes that, and a 3-second ping-pong of lease and refetch between two tabs in any
      // environment where both do (an automation driver, an embedded webview). A transition
      // can only be claimed once, so the worst case is that a missed rise costs a click on the
      // banner instead of a permanent fight. The focus/visibility events are the fast path;
      // this is the backstop for browsers and restores that don't fire them.
      const front = frontmost();
      const rose = front && wasFrontmost !== true;
      wasFrontmost = front;
      if (force || rose) {
        if (lease.peek(now) === 'holder') lease.renew(now);
        else {
          lease.claim(now);
          confirmClaim();
        }
        become('holder');
        return;
      }
      const view = lease.peek(now);
      if (view === 'follower') {
        become('follower');
        return;
      }
      if (view === 'free') {
        lease.claim(now);
        confirmClaim();
      } else if (!lease.renew(now)) {
        // Ours a moment ago, but another tab took over between beats.
        become('follower');
        return;
      }
      become('holder');
    };

    forceRef.current = () => evaluate(true);
    evaluate();

    const beat = setInterval(() => evaluate(), BEAT_MS);
    // localStorage's own cross-tab signal: fires in every OTHER tab the instant the record moves,
    // so a hand-off is seen immediately rather than on the next beat.
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === lease.key) evaluate();
    };
    const onFocus = () => evaluate(true);
    const onVisible = () => {
      if (document.visibilityState === 'visible') evaluate(true);
    };
    // `pagehide` rather than `unload`: it is the one that still fires on mobile Safari and is
    // bfcache-safe. Releasing means the next tab starts editing at once instead of waiting out
    // the lease; if it never fires, the lease simply lapses on its own.
    const onLeave = () => lease.release();

    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', onFocus);
    window.addEventListener('pagehide', onLeave);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      active = false;
      forceRef.current = null;
      clearInterval(beat);
      clearTimeout(settle);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('pagehide', onLeave);
      document.removeEventListener('visibilitychange', onVisible);
      lease.release();
    };
  }, [storage, userId]);

  const takeOver = useCallback(() => {
    forceRef.current?.();
  }, []);

  return { status, canEdit: status === 'holder' || status === 'unsupported', takeOver };
}
