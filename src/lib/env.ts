/**
 * Lightweight environment flags.
 *
 * Kept separate from src/lib/supabase.ts so the rest of the app can check whether the
 * backend is available without importing (and bundling) supabase-js. EXPO_PUBLIC_ vars
 * are inlined at build time, so these are constant per build.
 */

export const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
export const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/**
 * True when Supabase credentials are present. When false, the app runs in local/offline
 * mode (binders come from the in-memory store; cloud features are disabled).
 */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);
