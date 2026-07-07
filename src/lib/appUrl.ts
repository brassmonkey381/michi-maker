/**
 * Absolute app URLs for shareable links. On web the origin is the current host;
 * on native it comes from EXPO_PUBLIC_APP_URL (falling back to the production domain),
 * since a native build has no `window.location`.
 */
import { Platform } from 'react-native';

const FALLBACK_ORIGIN = 'https://michi-maker.com';

export function appOrigin(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') return window.location.origin;
  return process.env.EXPO_PUBLIC_APP_URL ?? FALLBACK_ORIGIN;
}

/** The public, shareable URL for a binder (the `/binder/[id]` route). */
export function binderShareUrl(id: string): string {
  return `${appOrigin()}/binder/${id}`;
}
