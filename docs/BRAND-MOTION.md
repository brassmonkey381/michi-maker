# Brand motion — the animated mark, loaders, and landing

How the michi-maker mark comes alive, and where motion is used. All of it is plain Views
+ reanimated opacity/transform (no SVG, no layout animations) so it renders identically on
web and native, and every piece honours `prefers-reduced-motion` on web.

## The animated logo mark

`src/components/brand/AnimatedLogoMark.tsx` — the mark is a 3×3 pocket grid, so it animates
by **filling itself in** the way a real side-load binder page fills: starting empty, it
drops 2-pocket folded-art strips and single cards into pockets one at a time on a stagger,
holds, then fades back to empty — a new arrangement each cycle.

- **Physics-legal arrangements.** The fills obey the real editor rules (see
  `src/data/binderPhysics.ts`): a 2-wide art piece is always horizontal (side-load pockets
  open sideways, never up/down), and on a 3-col page every folded pair shares the one legal
  inside-edge column — cols 1–2 (right-of-spine) or 0–1 (left). Singles go anywhere. There
  are **30 unique arrangements** (right-page, left-page, singles-only), drawn from a
  shuffled deck — each shown once before any repeat, no repeat across the shuffle seam.
- **Variants** convey app state via timing: `idle` (calm, the default — brand motion in the
  landing header), `thinking` (quick, restless — short-lived work), `loading` (steady,
  rhythmic — ongoing loads).
- **Static counterpart.** `src/components/brand/LogoMark.tsx` is the non-animated mark (used
  where motion isn't wanted); keep its geometry in sync, and with `scripts/brand-assets.mjs`
  (favicon/OG PNGs).

## LogoLoader — branded loading on long funnels

`src/components/brand/LogoLoader.tsx` wraps the animated mark over an optional label. Use it
for the genuinely LONG waits; keep small inline `ActivityIndicator`s for quick, on-button
"working" states (a logo doesn't belong on a button). Currently wired into:

- "Loading the card catalog…" (~25 MB parse) — AutoFill, Build-a-binder, CSV import, Print
  placeholders.
- Build-a-binder "Reading your collection…" (held a deliberate minimum, `MIN_LOADER_MS`, so
  the animation is seen — the plan computes instantly on a warm catalog).
- PDF / example-PDF generation in Print placeholders.
- The whole `/purchases` ledger — one loader until all four sections' batched fetch resolves,
  then they reveal together.

## Landing motion

The marketing page (`src/app/welcome.tsx`) is web-first and leans on a small motion layer:

- **`src/components/landing/Reveal.tsx` (+ `.web.tsx`)** — scroll-into-view fade-and-rise.
  Web uses `IntersectionObserver` (driven imperatively so it survives react-native-web style
  normalisation); native is a passthrough.
- **`src/components/landing/AutoFlipBinder.tsx`** — a live binder that crossfades through its
  own pages (single or facing-page spread) on a timer; also renders static (`autoFlip=false`)
  for the gallery.
- **`src/components/landing/HoverLift.web.tsx` (+ `.tsx`)** — raise + shadow on hover (web);
  native passthrough.
- The hero binder gets a subtle scroll **parallax**; the header shows the `idle`
  `AnimatedLogoMark` beside the "Michi-Maker" wordmark.

Sharing the landing/binder pages is covered in `docs/OPEN-GRAPH.md`.
