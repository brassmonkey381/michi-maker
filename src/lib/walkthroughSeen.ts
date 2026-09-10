/**
 * WHERE THE WALKTHROUGH RECORD LIVES ON THIS DEVICE.
 *
 * WHY A DEVICE COPY AT ALL, when the account already has `profiles.preferences`. Two reasons, and
 * the first is the whole population: most people meeting this are GUESTS, who have no profile row
 * to write to. The second is timing — the decision has to be made on the editor's first paint, and
 * an account read that resolves a moment later would show the banner and then snatch it away.
 *
 * So the device copy is written for everyone, guests included, and the account copy (when there is
 * one) is the half that follows a person to their phone. Neither is authoritative alone; they are
 * merged by `mergeRecord`, which is monotone in both fields, so disagreement costs one extra
 * showing and never a wrong state.
 *
 * KEYED BY ACCOUNT. Two people sharing a laptop must not inherit each other's progress, and a
 * signed-out visitor must not see the last account's. Same discipline as use-card-label-prefs.
 *
 * FAILS OPEN. Unreadable storage reads as "not retired": the cost of being wrong that way is one
 * more banner, and the cost of the other way is a person who never gets the help at all.
 *
 * Imports nothing from react-native, so the pure half stays reachable from `node --test` —
 * `localStorage` is defined on web and undefined on Hermes, which is the only fork this needs
 * (the same trade capPromptPacing.ts makes, for the same reason).
 */
import { normalizeRecord, type WalkthroughRecord } from '@/data/firstPocketWalkthrough';

const key = (userId: string | null) => `michi.walkthrough.first-pocket.${userId ?? 'guest'}`;

/** Everything read this session, by storage key. Synchronous reads answer from here. */
const cache = new Map<string, WalkthroughRecord>();
let hydrating: Promise<void> | null = null;

async function readRaw(k: string): Promise<string | null> {
  if (typeof localStorage !== 'undefined') return localStorage.getItem(k);
  const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
  return AsyncStorage.getItem(k);
}

async function writeRaw(k: string, value: string): Promise<void> {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(k, value);
    return;
  }
  const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
  await AsyncStorage.setItem(k, value);
}

/**
 * Pull this identity's record into the cache. Fire-and-forget: the caller re-renders when it
 * lands, and a first paint that beats it shows the banner to somebody who may have retired it —
 * which is the right way to be wrong (see FAILS OPEN above).
 */
export function hydrateWalkthroughSeen(userId: string | null): Promise<void> {
  const k = key(userId);
  if (cache.has(k)) return Promise.resolve();
  hydrating = (async () => {
    try {
      const raw = await readRaw(k);
      cache.set(k, normalizeRecord(raw ? (JSON.parse(raw) as unknown) : null));
    } catch {
      cache.set(k, normalizeRecord(null));
    }
  })();
  return hydrating;
}

/** What this device remembers for this identity, or null while that is still unknown. */
export function readWalkthroughSeen(userId: string | null): WalkthroughRecord | null {
  return cache.get(key(userId)) ?? null;
}

/** Remember it here. Cache first so the next render is right even if the write is slow. */
export function writeWalkthroughSeen(userId: string | null, record: WalkthroughRecord): void {
  const k = key(userId);
  cache.set(k, record);
  void writeRaw(k, JSON.stringify(record)).catch(() => {
    /* a private window, a full disk: the account copy and this session's cache still hold it */
  });
}
