// URL polyfill required by supabase-js in the React Native runtime. No-op on web.
import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { isSupabaseConfigured, supabasePublishableKey, supabaseUrl } from '@/lib/env';
import type { Database } from '@/types/database';

export { isSupabaseConfigured };

/**
 * The Supabase client, or `null` when the app is running without a backend (local mode).
 *
 * Importing this module is always safe — it never throws. Code that genuinely needs the
 * backend should either null-check `supabase` or call `requireSupabase()`.
 */
export const supabase: SupabaseClient<Database> | null = isSupabaseConfigured
  ? createClient<Database>(supabaseUrl as string, supabasePublishableKey as string, {
      auth: {
        // Persist the session in AsyncStorage on native; web falls back to localStorage.
        ...(Platform.OS === 'web' ? {} : { storage: AsyncStorage }),
        autoRefreshToken: true,
        persistSession: true,
        // Only the web build resolves the auth redirect from the URL.
        detectSessionInUrl: Platform.OS === 'web',
        // PKCE so the native OAuth / email-link flows exchange a `code` for a session
        // (the code verifier is kept in the auth storage above). See src/store/auth.tsx.
        flowType: 'pkce',
      },
    })
  : null;

if (!isSupabaseConfigured && process.env.NODE_ENV !== 'production') {
  console.warn(
    '[michi-maker] Supabase is not configured — running in local mode. ' +
      'Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env to enable cloud features.',
  );
}

// On native, refresh the session while the app is foregrounded (only when configured).
if (supabase && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      void supabase.auth.startAutoRefresh();
    } else {
      void supabase.auth.stopAutoRefresh();
    }
  });
}

/**
 * Returns the Supabase client, or throws a clear error if it isn't configured.
 * Use this in code paths that genuinely require the backend.
 */
export function requireSupabase(): SupabaseClient<Database> {
  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Add EXPO_PUBLIC_SUPABASE_URL and ' +
        'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY to your .env to use cloud features.',
    );
  }
  return supabase;
}
