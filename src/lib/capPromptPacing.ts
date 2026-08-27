/**
 * How often a cap wall is allowed to interrupt: a dialog on the first hit of each day, a toast
 * every time after that, per wall.
 *
 * WHY NOT ALWAYS A DIALOG. Hitting a cap is the highest-intent moment the product has — the user
 * has said what they want and been refused — and a toast is easy to miss and impossible to act on
 * once it fades. But the same user hits the same wall repeatedly in one sitting (place nine cards
 * into a full binder and the page cap answers nine times), and a modal on every one of those would
 * be punishment for using the app. First hit of the day earns the interruption; the rest get the
 * toast, which still carries its CTA.
 *
 * WHY DEVICE-LOCAL rather than a profile column. GUESTS hit these walls hardest — one binder, six
 * pages — and a guest has no profile row to write to, so a server-side stamp could not pace the
 * people who meet the walls most. This is interruption pacing, not a consent record: the cost of
 * losing it (cleared storage, a second device) is one extra dialog, so device-local is the honest
 * trade. Contrast src/data/prompts.ts, where the stamps ARE the record and belong on the account.
 *
 * DAY BOUNDARY is the local calendar day, not a rolling 24 hours: someone building at 11pm and
 * again at 8am should get today's dialog, and a rolling window would silently swallow it.
 *
 * Deliberately imports NOTHING from react-native. Platform would be the obvious way to pick a
 * store, but it drags the whole RN entry point into `node --test`, which cannot transform it — and
 * pacing logic that cannot be unit-tested is pacing logic nobody will trust to change. `localStorage`
 * is defined on web and undefined on Hermes, which is the only fork this needs.
 */
const STORAGE_KEY = 'mm_cap_prompt_days';

/** limit key ('binders', 'pagesPerBinder', 'artUploads') → the local day it last opened a dialog. */
let days: Record<string, string> = {};
let hydrated = false;

/** Local calendar day as YYYY-MM-DD. Deliberately local, not UTC — see the note above. */
export function dayKey(now: number): string {
  const d = new Date(now);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Load what we remembered. Fire-and-forget at import: the decision below has to be synchronous
 * (it happens inside the tap that hit the wall), so a cold start that taps before this resolves
 * shows one dialog it might have suppressed. That is the right way to be wrong — the failure is a
 * single extra interruption, never a swallowed one.
 */
export async function hydrateCapPrompts(): Promise<void> {
  if (hydrated) return;
  try {
    let raw: string | null = null;
    if (typeof localStorage !== 'undefined') {
      raw = localStorage.getItem(STORAGE_KEY);
    } else {
      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
      raw = await AsyncStorage.getItem(STORAGE_KEY);
    }
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    // Shape-check rather than trust: this is user-writable storage, and a string map is the only
    // thing the rest of this module can safely read.
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      days = Object.fromEntries(
        Object.entries(parsed as Record<string, unknown>).filter(([, v]) => typeof v === 'string'),
      ) as Record<string, string>;
    }
  } catch {
    // Unreadable storage reads as "never prompted" — one extra dialog, never a lost one.
  } finally {
    hydrated = true;
  }
}

function persist(): void {
  try {
    const raw = JSON.stringify(days);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, raw);
      return;
    }
    // .catch, not just the outer try: this is a floating promise, so a rejection inside it lands
    // as an unhandledRejection rather than here. Persistence must never be able to throw into the
    // tap that hit the wall.
    void import('@react-native-async-storage/async-storage')
      .then(({ default: AsyncStorage }) => AsyncStorage.setItem(STORAGE_KEY, raw))
      .catch(() => {});
  } catch {
    // Pacing that cannot be saved degrades to a dialog per app start, which is still not a nag.
  }
}

/** True when this wall has not opened a dialog yet today. Synchronous by necessity. */
export function shouldPromptCap(limit: string, now: number = Date.now()): boolean {
  return days[limit] !== dayKey(now);
}

/** Record that this wall took its one dialog for today. */
export function markCapPrompted(limit: string, now: number = Date.now()): void {
  days[limit] = dayKey(now);
  persist();
}

/** Tests only: a fresh device. */
export function resetCapPrompts(): void {
  days = {};
  hydrated = false;
}
