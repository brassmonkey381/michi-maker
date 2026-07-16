/**
 * Auth store.
 *
 * Owns the Supabase session lifecycle for the whole app and exposes every sign-in method
 * the UI offers: email + password, a 6-digit email code (passwordless OTP), and Google /
 * Apple OAuth. It also supports a **guest** flow — the app signs in anonymously on first
 * launch so binders save immediately, and the guest can later *upgrade* to a real account
 * (email/password or a linked Google/Apple identity) **keeping the same user id**, so all
 * their binders carry over untouched.
 *
 * `src/data/binderRepo.ts` is the only other module that talks to Supabase; it relies on the
 * session this store establishes. The binder store (src/store/binders.tsx) watches `user.id`
 * here and reloads the right owner's binders when it changes.
 *
 * When Supabase isn't configured the provider still renders — every value is inert (no user,
 * `ready` immediately true) so the app runs in local mode exactly as before.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session, User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Platform } from 'react-native';

import { authRedirectUrl } from '@/lib/authRedirect';
import { isSupabaseConfigured } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/types/domain';

// Lets the web OAuth popup hand its result back to the opener (no-op on native). Guarded so
// it never runs during the static web prerender (Node), where there is no window.
if (typeof window !== 'undefined') {
  WebBrowser.maybeCompleteAuthSession();
}

export type OAuthProvider = 'google' | 'apple';

/** Result of an auth action. `error` is a human-readable message, or null on success. */
export interface AuthResult {
  error: string | null;
  /** Set when the action succeeded but the user must confirm via an emailed link first. */
  needsEmailConfirmation?: boolean;
}

const OK: AuthResult = { error: null };
const NOT_CONFIGURED: AuthResult = {
  error: 'Cloud features are not configured (no Supabase credentials).',
};

// Remembers that the user *explicitly* signed out, so the bootstrap doesn't silently drop them
// back into an anonymous guest session on the next load (that's what made sign-out feel like a
// trap). Cleared whenever a session is (re-)established — a real sign-in or "continue as guest".
const OPTED_OUT_KEY = 'michi.auth.signedOut';

interface AuthStore {
  /** True once the initial session check (and guest bootstrap) has settled. */
  ready: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  /** A signed-in, permanent account (not an anonymous guest). */
  isSignedIn: boolean;
  /** An anonymous guest session — usable, but should be upgraded to keep binders long-term. */
  isGuest: boolean;
  /** True when anonymous sign-in is unavailable (toggle off) and no one is signed in. */
  anonymousUnavailable: boolean;

  signUpWithPassword: (email: string, password: string) => Promise<AuthResult>;
  signInWithPassword: (email: string, password: string) => Promise<AuthResult>;
  sendEmailCode: (email: string) => Promise<AuthResult>;
  verifyEmailCode: (email: string, token: string) => Promise<AuthResult>;
  signInWithOAuth: (provider: OAuthProvider) => Promise<AuthResult>;
  /** Upgrade the current guest to a permanent email/password account (keeps binders). */
  linkEmailPassword: (email: string, password: string) => Promise<AuthResult>;
  /** Upgrade the current guest by linking a Google/Apple identity (keeps binders). */
  linkOAuth: (provider: OAuthProvider) => Promise<AuthResult>;
  /** Start (or restart) an anonymous guest session on demand — used after an explicit sign-out. */
  continueAsGuest: () => Promise<AuthResult>;
  updateProfile: (
    patch: Partial<Pick<Profile, 'avatar_url' | 'is_public'>>,
  ) => Promise<AuthResult>;
  /** Claim a permanent, unique @username (only when none is set yet — usernames are immutable). */
  claimUsername: (username: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthStore | null>(null);

/** Turn any thrown/returned Supabase error into a short, user-facing string. */
function msg(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message) || fallback;
  }
  return fallback;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!isSupabaseConfigured);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [anonymousUnavailable, setAnonymousUnavailable] = useState(false);
  const bootstrapped = useRef(false);

  const user = session?.user ?? null;

  // Load (or clear) the profile row for the current user.
  const loadProfile = useCallback(async (uid: string | null) => {
    if (!supabase || !uid) {
      setProfile(null);
      return;
    }
    const { data } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
    setProfile((data as Profile | null) ?? null);
  }, []);

  // Bootstrap: adopt any persisted session, else sign in anonymously (guest mode). Then keep
  // `session` in sync with every future auth change (sign-in, sign-out, token refresh, upgrade).
  useEffect(() => {
    if (!supabase || bootstrapped.current) return;
    bootstrapped.current = true;
    let active = true;

    const sub = supabase.auth.onAuthStateChange((_event, next) => {
      if (!active) return;
      setSession(next);
      // In a session (signed in, or continued as guest) → clear the explicit-sign-out flag and
      // any "anonymous unavailable" state.
      if (next) {
        setAnonymousUnavailable(false);
        void AsyncStorage.removeItem(OPTED_OUT_KEY);
      }
      void loadProfile(next?.user?.id ?? null);
    });

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!active) return;
        if (!data.session) {
          // No session. A brand-new visitor becomes a guest so binders save right away — but if
          // they *chose* to sign out, we leave them signed out (the home banner offers Sign in /
          // Continue as guest) instead of forcing them back into anonymous.
          const optedOut = (await AsyncStorage.getItem(OPTED_OUT_KEY)) === '1';
          if (!optedOut && active) {
            const { error } = await supabase.auth.signInAnonymously();
            if (error && active) {
              // Anonymous sign-ins are likely disabled in the dashboard. Stay signed-out; the
              // app still runs and the user can sign in for real.
              setAnonymousUnavailable(true);
              console.warn(
                `[poke-michi] anonymous guest sign-in unavailable (${error.message}). ` +
                  'Enable "Anonymous sign-ins" in Supabase Auth settings, or have users sign in.',
              );
            }
          }
        }
      } catch (error) {
        console.warn(`[poke-michi] auth bootstrap failed: ${msg(error)}`);
      } finally {
        if (active) setReady(true);
      }
    })();

    return () => {
      active = false;
      sub.data.subscription.unsubscribe();
    };
  }, [loadProfile]);

  // Handle auth redirects that arrive as a deep link while the app is open (an email magic
  // link tapped from the mail app, or an OS-delivered OAuth return). Button-initiated OAuth
  // is completed inline in runOAuth() from the web-browser result instead.
  useEffect(() => {
    if (!supabase) return;
    const handle = async (url: string | null) => {
      if (!url || !url.includes('code=')) return;
      const code = Linking.parse(url).queryParams?.code;
      if (typeof code === 'string') {
        await supabase!.auth.exchangeCodeForSession(code).catch(() => undefined);
      }
    };
    const sub = Linking.addEventListener('url', ({ url }) => void handle(url));
    void Linking.getInitialURL().then(handle);
    return () => sub.remove();
  }, []);

  // --- email / password -----------------------------------------------------

  const signUpWithPassword = useCallback(
    async (email: string, password: string): Promise<AuthResult> => {
      if (!supabase) return NOT_CONFIGURED;
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: authRedirectUrl(),
        },
      });
      if (error) return { error: msg(error) };
      // With email confirmations on, there's no session until the user confirms.
      return { error: null, needsEmailConfirmation: !data.session };
    },
    [],
  );

  const signInWithPassword = useCallback(
    async (email: string, password: string): Promise<AuthResult> => {
      if (!supabase) return NOT_CONFIGURED;
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      return error ? { error: msg(error) } : OK;
    },
    [],
  );

  // --- passwordless email code (OTP) ---------------------------------------

  const sendEmailCode = useCallback(async (email: string): Promise<AuthResult> => {
    if (!supabase) return NOT_CONFIGURED;
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true, emailRedirectTo: authRedirectUrl() },
    });
    return error ? { error: msg(error) } : OK;
  }, []);

  const verifyEmailCode = useCallback(async (email: string, token: string): Promise<AuthResult> => {
    if (!supabase) return NOT_CONFIGURED;
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: token.trim(),
      type: 'email',
    });
    return error ? { error: msg(error) } : OK;
  }, []);

  // --- OAuth (Google / Apple) ----------------------------------------------

  const runOAuth = useCallback(
    async (provider: OAuthProvider, link: boolean): Promise<AuthResult> => {
      if (!supabase) return NOT_CONFIGURED;
      const redirectTo = authRedirectUrl();
      const options = { redirectTo, skipBrowserRedirect: Platform.OS !== 'web' };

      const { data, error } = link
        ? await supabase.auth.linkIdentity({ provider, options })
        : await supabase.auth.signInWithOAuth({ provider, options });
      if (error) return { error: msg(error) };

      // On web the call above navigates the page to the provider; nothing more to do here.
      if (Platform.OS === 'web' || !data?.url) return OK;

      // Native: open the provider in an auth session and complete from the returned URL.
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type === 'cancel' || result.type === 'dismiss') {
        return { error: 'Sign-in was cancelled.' };
      }
      if (result.type !== 'success') return { error: 'Sign-in did not complete.' };

      const code = Linking.parse(result.url).queryParams?.code;
      if (typeof code !== 'string') return { error: 'No authorization code was returned.' };
      const exchange = await supabase.auth.exchangeCodeForSession(code);
      return exchange.error ? { error: msg(exchange.error) } : OK;
    },
    [],
  );

  const signInWithOAuth = useCallback(
    (provider: OAuthProvider) => runOAuth(provider, false),
    [runOAuth],
  );
  const linkOAuth = useCallback((provider: OAuthProvider) => runOAuth(provider, true), [runOAuth]);

  // --- guest → account upgrade (email/password) ----------------------------

  const linkEmailPassword = useCallback(
    async (email: string, password: string): Promise<AuthResult> => {
      if (!supabase) return NOT_CONFIGURED;
      // updateUser on an anonymous user attaches the email/password to the SAME uid, so the
      // guest's binders are preserved. The email must be confirmed before it's usable.
      const { data, error } = await supabase.auth.updateUser(
        { email: email.trim(), password },
        { emailRedirectTo: authRedirectUrl() },
      );
      if (error) return { error: msg(error) };
      const confirmed = !!data.user?.email_confirmed_at;
      return { error: null, needsEmailConfirmation: !confirmed };
    },
    [],
  );

  // --- profile --------------------------------------------------------------

  const updateProfile = useCallback(
    async (
      patch: Partial<Pick<Profile, 'avatar_url' | 'is_public'>>,
    ): Promise<AuthResult> => {
      if (!supabase) return NOT_CONFIGURED;
      if (!user) return { error: 'You need to be signed in to edit your profile.' };
      const { data, error } = await supabase
        .from('profiles')
        .update(patch)
        .eq('id', user.id)
        .select('*')
        .maybeSingle();
      if (error) return { error: msg(error) };
      if (data) setProfile(data as Profile);
      return OK;
    },
    [user],
  );

  // Claim a permanent @username. Enforced 3–20 chars of [a-z0-9_] (matches the DB CHECK), and
  // rejected if already taken; the DB unique index + immutability trigger are the source of truth.
  const claimUsername = useCallback(
    async (username: string): Promise<AuthResult> => {
      if (!supabase) return NOT_CONFIGURED;
      if (!user) return { error: 'You need to be signed in to pick a username.' };
      const uname = username.trim().toLowerCase();
      if (!/^[a-z0-9_]{3,20}$/.test(uname)) {
        return { error: 'Usernames are 3–20 characters, lowercase letters, numbers, or underscores.' };
      }
      // Best-effort availability check; the unique index is authoritative on the write below.
      const { data: taken } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', uname)
        .neq('id', user.id)
        .maybeSingle();
      if (taken) return { error: 'That username is taken. Try another.' };

      const { data, error } = await supabase
        .from('profiles')
        .update({ username: uname })
        .eq('id', user.id)
        .select('*')
        .maybeSingle();
      if (error) {
        const m = error.message.toLowerCase();
        if (m.includes('duplicate') || m.includes('unique')) return { error: 'That username is taken. Try another.' };
        if (m.includes('cannot be changed')) return { error: 'Your username is already set and can’t be changed.' };
        return { error: msg(error) };
      }
      if (data) setProfile(data as Profile);
      return OK;
    },
    [user],
  );

  const continueAsGuest = useCallback(async (): Promise<AuthResult> => {
    if (!supabase) return NOT_CONFIGURED;
    await AsyncStorage.removeItem(OPTED_OUT_KEY);
    const { error } = await supabase.auth.signInAnonymously();
    if (error) {
      setAnonymousUnavailable(true);
      return { error: msg(error) };
    }
    return OK; // onAuthStateChange adopts the new guest session
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    // Remember the explicit sign-out so bootstrap doesn't re-mint a guest on reload — the user
    // lands signed-out (with the Sign in / Continue-as-guest banner), not trapped as anonymous.
    await AsyncStorage.setItem(OPTED_OUT_KEY, '1');
    await supabase.auth.signOut();
    // onAuthStateChange clears the session; no automatic anonymous re-sign-in.
    setSession(null);
    setProfile(null);
  }, []);

  const isGuest = !!user?.is_anonymous;
  const isSignedIn = !!user && !user.is_anonymous;

  const value = useMemo<AuthStore>(
    () => ({
      ready,
      session,
      user,
      profile,
      isSignedIn,
      isGuest,
      anonymousUnavailable,
      signUpWithPassword,
      signInWithPassword,
      sendEmailCode,
      verifyEmailCode,
      signInWithOAuth,
      linkEmailPassword,
      linkOAuth,
      continueAsGuest,
      updateProfile,
      claimUsername,
      signOut,
    }),
    [
      ready,
      session,
      user,
      profile,
      isSignedIn,
      isGuest,
      anonymousUnavailable,
      signUpWithPassword,
      signInWithPassword,
      sendEmailCode,
      verifyEmailCode,
      signInWithOAuth,
      linkEmailPassword,
      linkOAuth,
      continueAsGuest,
      updateProfile,
      claimUsername,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthStore {
  const store = useContext(AuthContext);
  if (!store) throw new Error('useAuth must be used within an AuthProvider');
  return store;
}
