/**
 * The return address carried in a URL, and the one rule that makes carrying it safe.
 *
 * WHY IN THE URL (owner, 2026-09-29). Discover's shelf position used to live in a module-level Map
 * that both screens imported. It worked, and it was the wrong shape: nothing appeared in the
 * address bar, so a reload or a middle-click into a new tab lost the position, the state could not
 * be read or debugged from outside, and a feature whose entire state is invisible is one you have
 * to take on faith. The position now rides in the URL, where it survives a reload and can be read.
 *
 * THE RULE: A BACK LINK MUST BE A PATH ON THIS SITE. `?back=` is part of the address, so anyone can
 * put anything in it, including `https://example.com` or a `javascript:` URL. A link that sends a
 * reader wherever a crafted address says is an open redirect: the link looks like michi-maker.com,
 * the destination is not, and the reader has no way to tell before they arrive. So a value is used
 * only when it is a path on this site, and anything else silently becomes the home page.
 *
 * `//evil.com` is the case worth naming: a browser reads a protocol-relative URL as another origin
 * even though it starts with a slash, so "starts with /" is not the check. It has to be one slash.
 */

/** The home page, used whenever a return address is missing or not ours. */
const HOME = '/';

/**
 * A `?back=` value turned into somewhere it is safe to send someone: a path on this site, or home.
 *
 * Takes the raw param as it arrives, which on a repeated query string is an array.
 */
export function safeBackHref(raw: unknown): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return HOME;
  const path = value.trim();
  if (!path.startsWith('/')) return HOME;   // absolute, scheme-relative, or junk
  if (path.startsWith('//')) return HOME;   // another origin, despite the leading slash
  if (path.includes(String.fromCharCode(92))) return HOME;  // a backslash, which some browsers read as a slash
  return path;
}

/** Discover's own address, carrying the ordering and the shelf page it should open on. */
export function discoverHref(sort: string, shelf: number): string {
  const params = new URLSearchParams();
  if (sort) params.set('sort', sort);
  if (Number.isInteger(shelf) && shelf > 0) params.set('shelf', String(shelf));
  const q = params.toString();
  return q ? `/discover?${q}` : '/discover';
}

/** A shelf page out of a URL param. Anything that is not a non-negative whole number is page 0. */
export function shelfFromParam(raw: unknown): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return 0;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n < 1000 ? n : 0;
}
