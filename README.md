# poke-michi 🃏

Build **digital "michi binders"** — aesthetically curated Pokémon card layouts — on web, iOS, and Android from a single codebase.

Most collection apps organize cards by number or set. poke-michi is about *composition*: arranging cards into visually cohesive pages the way collectors do with the [Michi Method](https://woahpoke.com/michi-method/) — anchor layouts, single-Pokémon pages, color-themed spreads, artist pages, and full-page artwork, with intentional negative space and cards that span multiple pockets. Card metadata (sets, packs, illustrators, species) is sourced from [The Art of Pokémon](https://www.artofpkm.com/pokemon).

> **Status:** early scaffold. The app shell, data model, and Supabase backend are in place; the binder editor and card browser are next. See the [Roadmap](#roadmap).

## Tech stack

| Layer        | Choice                                                                 |
| ------------ | ---------------------------------------------------------------------- |
| Framework    | [Expo](https://docs.expo.dev/) SDK 56 (React Native 0.85, React 19)    |
| Language     | TypeScript (strict)                                                    |
| Routing      | [Expo Router](https://docs.expo.dev/router/introduction/) (file-based) |
| Targets      | Web (`react-native-web`), iOS, Android — one codebase                  |
| Backend      | [Supabase](https://supabase.com/) — Postgres, Auth, Row Level Security |
| Data source  | [artofpkm.com](https://www.artofpkm.com/pokemon) (cards, illustrators) |

## Getting started

### Prerequisites

- **Node.js 20+** and npm (this repo was scaffolded with Node 24 / npm 11)
- The [Expo Go](https://expo.dev/go) app on a phone, or an Android/iOS simulator, to run on a device
- A [Supabase](https://supabase.com/) project (free tier is fine) for auth and data

### 1. Install dependencies

```bash
npm install
```

This project also depends on a few packages that must match the Expo SDK. Install them with `expo install` so it picks compatible versions:

```bash
npx expo install @supabase/supabase-js @react-native-async-storage/async-storage react-native-url-polyfill
```

### 2. Configure Supabase

```bash
cp .env.example .env
```

Fill in `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from your project's
**Settings → API** page. Then apply the database schema — see **[supabase/README.md](supabase/README.md)**.

### 3. Run the app

```bash
npm run web       # open in the browser
npm run ios       # open in the iOS simulator (requires macOS + Xcode)
npm run android   # open in the Android emulator
npm start         # start the dev server and choose a target
```

## Project structure

```
poke-michi/
├── src/
│   ├── app/              # Expo Router routes (file-based). Screens live here.
│   │   ├── _layout.tsx   # Root layout + tab navigator
│   │   ├── index.tsx     # Home
│   │   └── explore.tsx   # Browse (card catalogue — placeholder)
│   ├── components/       # Reusable UI (themed text/view, etc.)
│   ├── constants/        # Theme: colors, spacing, fonts
│   ├── hooks/            # Shared hooks (color scheme, theme)
│   ├── lib/
│   │   └── supabase.ts   # Typed Supabase client (web + native)
│   └── types/
│       ├── database.ts   # Generated DB types (mirror of the schema)
│       └── domain.ts     # App-facing entity types + Michi layout metadata
├── supabase/
│   ├── migrations/       # SQL schema + RLS (source of truth for the DB)
│   ├── seed.sql          # Tiny sample catalogue for local dev
│   └── README.md         # How to apply migrations & generate types
├── docs/
│   ├── ARCHITECTURE.md   # How the pieces fit together
│   └── DATA-MODEL.md     # The michi domain + ingesting artofpkm.com
├── assets/               # Icons, splash, images
├── app.json              # Expo app config
└── .env.example          # Environment variable template
```

## Scripts

| Command             | Description                                  |
| ------------------- | -------------------------------------------- |
| `npm start`         | Start the Expo dev server                    |
| `npm run web`       | Run in the browser                           |
| `npm run ios`       | Run in the iOS simulator                     |
| `npm run android`   | Run in the Android emulator                  |
| `npm run lint`      | Lint with `expo lint`                        |
| `npx tsc --noEmit`  | Type-check the project                       |

## Documentation

- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — how the app, client, and database fit together
- **[docs/DATA-MODEL.md](docs/DATA-MODEL.md)** — the michi-binder domain and how card data is ingested
- **[supabase/README.md](supabase/README.md)** — database setup, migrations, and type generation

## Roadmap

- [x] App scaffold (Expo Router, TypeScript, theming) for web/iOS/Android
- [x] Supabase schema + Row Level Security for binders, pages, and slots
- [x] Typed Supabase client and domain types
- [ ] Auth (sign up / sign in) and profile screen
- [ ] Card catalogue ingestion from artofpkm.com
- [ ] Card browser with set / illustrator / Pokémon / color filters
- [ ] Binder editor — the 3×3 canvas with multi-slot spans and negative space
- [ ] Public binder sharing & discovery

## License

See [LICENSE](LICENSE). Pokémon and all related card artwork are © Nintendo / Creatures Inc. /
GAME FREAK inc. This is a fan project for personal collection display and is not affiliated with
or endorsed by them or with artofpkm.com.
