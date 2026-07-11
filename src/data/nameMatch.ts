/**
 * Boundary-aware token matching for card names. `hasToken("Gengar & Mimikyu-GX", "mimikyu")` is
 * true; `hasToken("Mewtwo", "mew")` is false — the char on either side of a hit must be
 * non-alphanumeric so species/trainer tokens never match inside a longer word.
 */
export function hasToken(name: string, token: string): boolean {
  const n = name.toLowerCase();
  const t = token.toLowerCase();
  if (!t) return false;
  let from = 0;
  for (;;) {
    const i = n.indexOf(t, from);
    if (i < 0) return false;
    const before = i === 0 ? '' : n[i - 1];
    const after = i + t.length >= n.length ? '' : n[i + t.length];
    const boundary = (ch: string) => ch === '' || !/[a-z0-9]/.test(ch);
    if (boundary(before) && boundary(after)) return true;
    from = i + 1;
  }
}
