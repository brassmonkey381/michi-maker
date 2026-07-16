# Feature-showcase landing page

## Goal

A beautiful marketing/landing page that shows what michi-maker DOES — the craft, the tools,
the physical payoff — with key selling points and a clear path in (sign up / browse examples
/ pricing once tiers exist). Aesthetic bar: the page itself must look like it was made by
people who care about beautiful arrangements, because that's the product.

## What to sell (the honest feature inventory)

1. **Michi binders** — curated card layouts, not just storage. Anchor pages, color spreads,
   artist pages (the woahpoke michi method — 7 composer methods are implemented).
2. **Slice Studio** — slice any artwork across pockets, aspect-true, with rotation/flips;
   merge pieces into folded pairs that match real side-load binder physics.
3. **✨ Composer** — auto-curate a page around a seed card (7 methods + partner data).
4. **Build-a-binder wizard** — turns your collection into story-first pages (chase board,
   evolution lines, species, artist, set, type clusters).
5. **My Collection pipeline** — scans from the tcgscan app and CSV imports land live in
   michi; fill binders from what you own; green/gray owned-vs-hunt accounting.
6. **Print fill sheets** — the physical payoff: cut-ready, TRUE card-size (2.5″×3.5″)
   sheets at pocket pitch; placeholders + your real art + inserts; folded 2-wide pieces
   whose art crosses the fold; gap compensation so mounted pictures read continuous.
   (Competitors print undersized cards; we print true size — a selling point.)
7. **Sharing** — public binders, likes, featured binders (rolling 3-day leaderboard),
   permanent @usernames.
8. Double-sided book view, card labels, jumbo/V-UNION support, dark mode, three platforms
   from one codebase.

## Where it lives (decide early)

Options, in rough order of preference:

- **A route inside the Expo app** (e.g. `/welcome`, and make `/` show it for signed-out
  visitors). Pros: one deploy, reuses components for live demos (a real `BinderGrid`
  rendering an example binder beats a screenshot). Cons: bundle weight — the landing page
  must NOT pull the catalog or heavy editor code (lazy-load; check `npm run build:web`).
- A static page (separate `landing/` output or Vercel static) — fastest paint, but loses
  live components and duplicates styling.

Current behavior: `/` is the home screen, guests see GuestBanner + examples. A dedicated
signed-out landing at `/` with "open the app" → current home is likely the cleanest cut.

## Content assets you can generate rather than mock

- Example binders are bundled (`src/data/content/`) — render real pages for hero shots.
- The fill-sheet engine can produce a REAL print PDF for a "from screen to shelf" section
  (`src/data/placeholderPdf.ts`; see `docs/roadmap/../PAYMENTS.md` for the gate — the
  marketing page can show renders without granting downloads).
- The screenshot harness (`scripts/screenshots.mjs`) can capture app shots at exact sizes.
- Art rights: cleared for the artofpkm-sourced art used in binders (owner confirmed). Still
  credit hosts as the print footers do; avoid Pokémon logos/wordmarks in OUR branding.

## Key constraints

- SEO/meta: the web app is `output: "single"` (SPA) — SSG broke binder grids before
  (`docs/../` memory: web-output-single-not-static). If the landing page needs SEO, it may
  justify a static pre-rendered exception — verify `build:web` carefully.
- First paint budget: landing must be fast on mobile; no catalog, no heavy libs.
- Tone: "a love for the craft" — favor showing real curated pages over marketing abstractions.
- Pricing section: only once MONETIZATION-TIERS.md ships; until then a "free while in beta"
  note is honest and fine.

## Verify

Lighthouse-style pass (fast paint, no layout shift), mobile + desktop screenshots, click
every CTA (sign up flow → guest flow → examples), `build:web` locally, then production
smoke after deploy.
