/**
 * WHERE THE TASTE RECORD LIVES ON THIS DEVICE (data/tastes). The same two-copy design as
 * lib/walkthroughSeen, for the same reasons: the decision is made at the moment of a tap and must
 * not wait on a profile read; the account copy (profiles.preferences.tastes) is the half that
 * follows a person to another device; both are merged monotonically, so disagreement costs at most
 * one extra taste on a second device and never a wrong "already used".
 *
 * KEYED BY ACCOUNT, like the walkthrough record. FAILS OPEN the same way: unreadable storage reads
 * as "nothing tasted", because the cost of being wrong that way is one more free taste.
 */
import { EMPTY_TASTES, normalizeTastes, type TasteRecord } from '@/data/tastes';

const key = (userId: string | null) => `michi.tastes.${userId ?? 'guest'}`;

const cache = new Map<string, TasteRecord>();

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

/** Pull this identity's record into the cache. The caller re-renders when it lands. */
export function hydrateTastes(userId: string | null): Promise<void> {
  const k = key(userId);
  if (cache.has(k)) return Promise.resolve();
  return (async () => {
    try {
      const raw = await readRaw(k);
      cache.set(k, raw ? normalizeTastes(JSON.parse(raw) as unknown) : EMPTY_TASTES);
    } catch {
      cache.set(k, EMPTY_TASTES);
    }
  })();
}

/** What this device remembers for this identity, or null while that is still unknown. */
export function readTastes(userId: string | null): TasteRecord | null {
  return cache.get(key(userId)) ?? null;
}

/** Remember it here. Cache first so the next render is right even if the write is slow. */
export function writeTastes(userId: string | null, record: TasteRecord): void {
  const k = key(userId);
  cache.set(k, record);
  void writeRaw(k, JSON.stringify(record)).catch(() => {
    /* a private window, a full disk: the account copy and this session's cache still hold it */
  });
}
