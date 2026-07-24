# michi-maker 🃏

Build **digital "michi binders"** — aesthetically curated Pokémon card layouts — on web, iOS, and Android from a single codebase. Live on the web as **[michi-maker.com](https://michi-maker.com)**.

Most collection apps organize cards by number or set. michi-maker is about *composition*: arranging cards into visually cohesive pages the way collectors do with the [Michi Method](https://woahpoke.com/michi-method/) — anchor layouts, single-Pokémon pages, color-themed spreads, artist pages, and full-page artwork, with intentional negative space and cards that span multiple pockets.

> **Status:** live and selling (billing cutover 2026-07-22). The ~28k-card catalog, images,
> prices, and similarity search come from the shared **tcgscan-data** server via the
> **tcgscan-browse** kit; users sign in (email / Google / Apple / guest), build and share
> binders, import their collection (CSV or scans from the sibling **TCGScan** app), and print
> real fill-sheet PDFs. PRO/VIP subscriptions, a 14-day PRO trial, per-binder PDF unlocks, and
> a cross-app bundle with TCGScan are all live — see [docs/PAYMENTS.md](docs/PAYMENTS.md).
> Without Supabase credentials the app still runs in a local, in-memory mode.

## Tech stack

| Layer        | Choice                                                                 |
| ------------ | ---------------------------------------------------------------------- |
| Framework    | [Expo](https://docs.expo.dev/) SDK 56 (React Native 0.85, React 19)    |
| Language     | TypeScript (strict)                                                    |
| Routing      | [Expo Router](https://docs.expo.dev/router/introduction/) (file-based) |
| Targets      | Web (`react-native-web`), iOS, Android — one codebase                  |
| User backend | [Supabase](https://supabase.com/) — Postgres, Auth, RLS, Edge Functions (project `piikwvntldytjejxmcla`, shared with tcgscan-app) |
| Card data    | Shared **tcgscan-data** Supabase server (`bmhjizcmwtmcrstadqto`, read-only) via the [`tcgscan-browse`](https://github.com/brassmonkey381/tcgscan-browse) kit — see [docs/DATA-SERVER.md](docs/DATA-SERVER.md) |
| Payments     | Stripe Checkout + webhook fulfillment (Supabase Edge Functions) — see [docs/PAYMENTS.md](docs/PAYMENTS.md) |
| Web hosting  | [Vercel](https://vercel.com/) — SPA export + serverless Open Graph previews (`api/`) |

## Getting started

### Prerequisites

- **Node.js 20+** and npm (this repo was scaffolded with Node 24 / npm 11)
- The [Expo Go](https://expo.dev/go) app on a phone, or an Android/iOS simulator, to run on a device
- A [Supabase](https://supabase.com/) project (free tier is fine) for auth and user data

### 1. Install dependencies

```bash
npm install
```

### 2. (Optional) Configure Supabase

**The app runs without its own backend.** Binders come from a local, in-memory store seeded
with example binders, so you can skip straight to step 3 to try it out. Without credentials
the app stays in **local mode** (`supabase` is `null` and never throws); Supabase powers
auth, cloud sync, entitlements, and printing.

When you're ready to enable it:

```bash
cp .env.example .env
```

Fill in `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from your project's
**Settings → API** page, then apply the database schema — see **[supabase/README.md](supabase/README.md)**.
The `EXPO_PUBLIC_CATALOG_*` variables (already filled in `.env.example`) point the card catalog
at the hosted tcgscan-data server.

### 3. Run the app

```bash
npm run web       # open in the browser
npm run ios       # open in the iOS simulator (requires macOS + Xcode)
npm run android   # open in the Android emulator
npm start         # start the dev server and choose a target
```

## Project structure

```
michi-maker/
├── src/
│   ├── app/                  # Expo Router routes (file-based)
│   │   ├── _layout.tsx       # Root layout + providers (auth, binders, language)
│   │   ├── index.tsx         # Home — your binders + examples
│   │   ├── browse.tsx        # Card catalog browser (tcgscan-browse kit)
│   │   ├── welcome.tsx       # Marketing / landing page (web-first)
│   │   ├── plans.tsx …       # Billing surfaces (plans, pricing, purchases, subscriptions)
│   │   ├── binder/[id].tsx   # Binder viewer & editor
│   │   ├── u/[id].tsx        # Public profiles
│   │   ├── learn/            # Guides
│   │   └── legal/            # Terms, privacy, DMCA
│   ├── components/           # binder/, auth/, monetization/, landing/, brand/, people/, ui/ …
│   ├── constants/            # Theme: colors, spacing, fonts
│   ├── data/                 # Repos (binderRepo, printRepo, …), tiers, wizard, bundled examples
│   ├── hooks/                # use-tier, use-entitlement, use-catalog, use-trial, …
│   ├── lib/                  # Supabase client, catalog config/source/cache shims
│   ├── store/                # auth.tsx + binders.tsx providers
│   └── types/                # database.ts (generated), domain.ts
├── api/                      # Vercel serverless functions — Open Graph link previews
├── supabase/
│   ├── migrations/           # SQL schema + RLS (source of truth for the user DB)
│   ├── functions/            # Edge functions: stripe-checkout, payments-webhook, auth-handoff, art-proxy
│   └── README.md             # How to apply migrations & generate types
├── scripts/                  # Build/QA scripts (example binders, art library, screenshots …)
├── docs/                     # Architecture, data server, payments, auth, roadmap …
├── public/                   # Static web assets (og.png, fonts, browse fallback)
├── app.json / vercel.json    # Expo app config / Vercel build + crawler rewrites
└── .env.example              # Environment variable template
```

## Scripts

| Command             | Description                                          |
| ------------------- | ---------------------------------------------------- |
| `npm start`         | Start the Expo dev server                            |
| `npm run web`       | Run in the browser                                   |
| `npm run ios`       | Run in the iOS simulator                             |
| `npm run android`   | Run in the Android emulator                          |
| `npm run build:web` | Export the web SPA to `dist/` + inject share meta    |
| `npm run deploy`    | Deploy to Vercel production                          |
| `npm run lint`      | Lint with `expo lint`                                |
| `npm test`          | Unit tests (`node --test` over `src/**/*.test.ts`)   |
| `npx tsc --noEmit`  | Type-check the project                               |

Maintenance scripts (regenerating example binders, the art library, screenshots, …) are
documented in [scripts/README.md](scripts/README.md).

## Documentation

- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — how the app, the two Supabase projects, and the shared browse kit fit together
- **[docs/DATA-MODEL.md](docs/DATA-MODEL.md)** — the michi-binder domain model
- **[docs/DATA-SERVER.md](docs/DATA-SERVER.md)** — consuming the shared tcgscan-data catalog server (and what must never be resurrected locally)
- **[docs/AUTH.md](docs/AUTH.md)** — auth methods, guest upgrade, cross-app SSO handoff
- **[docs/PAYMENTS.md](docs/PAYMENTS.md)** — tiers, entitlements, Stripe checkout/webhook (LIVE)
- **[docs/PRO-TRIALS.md](docs/PRO-TRIALS.md)** — the 14-day PRO trial + over-cap reclaim
- **[docs/SYNERGY.md](docs/SYNERGY.md)** — cross-app pricing/entitlements with tcgscan (canonical doc)
- **[docs/TCGSCAN-PORTFOLIO.md](docs/TCGSCAN-PORTFOLIO.md)** — the shared `user_cards` collection handoff
- **[docs/OPEN-GRAPH.md](docs/OPEN-GRAPH.md)** — rich link previews (composed page images) for shared binders/profiles
- **[docs/BRAND-MOTION.md](docs/BRAND-MOTION.md)** — the animated logo mark, branded loaders, and landing motion
- **[docs/roadmap/](docs/roadmap/README.md)** — initiative briefs for future sessions
- **[supabase/README.md](supabase/README.md)** — database setup, migrations, edge functions, and type generation

## Shipped highlights

- [x] Binder viewer & editor — 3×3 canvas, multi-slot spans, negative space, multi-page, slices, captions, theme backgrounds
- [x] Full ~28k-card catalog browse/search (facets, query grammar, find-similar) via `tcgscan-browse`
- [x] Auth — email + password, email code, Google/Apple, guest mode with account upgrade
- [x] Public sharing — profiles, likes, upvotes, rich link previews ([docs/OPEN-GRAPH.md](docs/OPEN-GRAPH.md))
- [x] Collection import (TCGPlayer CSV / TCGScan scans) + Build-a-binder wizard
- [x] Print — fill-sheet PDFs with the binder's real art, gated by subscription or per-binder unlock
- [x] Billing — PRO/VIP subscriptions (monthly/yearly), 14-day PRO trial, cross-app bundle with TCGScan
- [x] Michi Method credit page (`/michi-method`) crediting @peeplop

What's next lives in [docs/roadmap/](docs/roadmap/README.md).

## License

See [LICENSE](LICENSE). Pokémon and all related card artwork are © Nintendo / Creatures Inc. /
GAME FREAK inc. This is a fan project for personal collection display and is not affiliated with
or endorsed by them.
