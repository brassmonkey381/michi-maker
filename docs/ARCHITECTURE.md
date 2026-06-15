# Architecture

A high-level map of how poke-michi fits together. For the domain model see
[DATA-MODEL.md](DATA-MODEL.md); for the database specifics see
[../supabase/README.md](../supabase/README.md).

## One codebase, three targets

poke-michi is a single [Expo](https://docs.expo.dev/) app that renders to **web, iOS, and
Android**. React Native primitives compile to native views on mobile and to DOM via
`react-native-web` in the browser. Where platforms must differ, we branch on `Platform.OS`
or use platform file variants (`*.web.tsx`, `*.ios.tsx`, `*.android.tsx`) — the tab bar
already does this (`src/components/app-tabs.tsx` vs `app-tabs.web.tsx`).

```
              ┌────────────────────────────┐
   Web  ◄─────┤                            │
   iOS  ◄─────┤   Expo app (src/)          │
 Android ◄────┤   React + Expo Router      │
              └─────────────┬──────────────┘
                            │  supabase-js (typed)
                            ▼
              ┌────────────────────────────┐
              │   Supabase                 │
              │   Postgres + Auth + RLS    │
              └─────────────┬──────────────┘
                            ▲  service_role (server-side only)
                            │
              ┌─────────────┴──────────────┐
              │  Ingestion pipeline        │
              │  artofpkm.com → catalogue  │
              └────────────────────────────┘
```

## Layers

### Routing & screens — `src/app/`

File-based routing via Expo Router. Each file is a route; `_layout.tsx` defines the navigator.
The `@/` path alias maps to `src/` (see `tsconfig.json`).

### UI — `src/components/`, `src/constants/`, `src/hooks/`

Reusable presentational components plus design tokens. `ThemedText` / `ThemedView` read from
`Colors` in `src/constants/theme.ts` for automatic light/dark support. Spacing and fonts are
tokenized there too.

### Data access — `src/lib/supabase.ts`

A single typed `supabase` client, configured once for both runtimes:

- **Native:** sessions persist in `AsyncStorage`; the client auto-refreshes the token while the
  app is foregrounded (driven by `AppState`).
- **Web:** sessions persist in `localStorage` and the auth redirect is read from the URL
  (`detectSessionInUrl`).

The client is parameterized by the `Database` type, so every query is type-checked end to end.

### Types — `src/types/`

- `database.ts` — the shape of the Postgres `public` schema (mirrors `supabase/migrations`;
  regenerate with `supabase gen types`).
- `domain.ts` — app-facing entity types derived from `database.ts`, plus presentation metadata
  such as the list of Michi layout styles. Components import from here, not from `database.ts`.

### Backend — `supabase/`

Postgres schema, Row Level Security, and seed data as versioned SQL migrations. Auth is handled
by Supabase Auth; a trigger creates a `profiles` row on signup. **Every table has RLS enabled** —
the client can only ever read/write rows the signed-in user is entitled to.

## Security model in one paragraph

The app ships only the **publishable** key, which is safe for clients because Row Level Security
decides what each user can see and do. Owners get full access to their own binders, pages, and
slots; anyone can read binders flagged `is_public`; reference data (cards, sets, illustrators,
Pokémon) is world-readable but writable only by the `service_role`. The `service_role` / secret
key never appears in app code — it lives only in the server-side ingestion pipeline.

## Data flow example — opening a binder

1. User signs in → Supabase Auth issues a JWT held by the client.
2. The binder screen queries `binders` → `binder_pages` → `binder_slots` (joined to `cards` for
   artwork) through the typed client.
3. RLS filters rows to the owner (or to public binders) automatically — no `where owner_id = …`
   needed in app code, and none can be bypassed from the client.
4. Card images come from URLs stored on `cards` (ingested from artofpkm.com).
