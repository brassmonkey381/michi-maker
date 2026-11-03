# Artists

Real artists offer their work for preview on the surfaces michi-maker already decorates. Decided
by the owner on 2026-11-03: self-serve, preview only, the owner's own account the first artist.
Nothing an artist offers is printed or sold through the app; the point is that a collector can
see a piece on their own page and follow the artist's link to commission it.

## The two gates

1. **Artist accounts** are granted in Studio (Artists panel, "Make artist" by username) and stored
   as `profiles.is_artist`. An artist account shows the Artist panel in the account sheet.
2. **Every piece is reviewed.** An upload lands in `artist_pieces` as `pending`. The Studio queue
   approves or rejects it; only `approved` pieces reach the shelves. An artist can withdraw a piece
   at any time (`removed`); editing an approved piece's picture or title sends it back to pending.

A guard trigger refuses any non-admin change to `is_admin` or `is_artist` (which also closed the
hole where a signed-in user could set their own `is_admin`).

## Where pieces show

The artist picks surfaces per piece. Each surface has an **Artists shelf** that renders nothing
until an artist has offered a piece for it:

| surface | where the shelf is |
| --- | --- |
| slot | Add art sheet (art slots and inserts) |
| sleeve, backing | the Picture row of every sleeve and backing field (binder, page, pocket) |
| background | the Share sheet's backdrop picker (page backgrounds are colour only in the editor, owner 2026-09-15) |
| cover | the cover panel toolbar |
| mat | the stock card of an art window: not built yet |

A placed piece carries `attribution.origin = 'artist'` with the artist's `@username` and link. It
is public-eligible, labelled "Artist piece, preview only" in image properties, and the print path
prints a placeholder named for the artist instead of the picture.

## Files

- `supabase/migrations/20261103100000_artists.sql`: columns, table, view `artist_shelf`, admin RPCs.
- `src/data/artists.ts`: the repo (shelf cache, the artist's pieces, admin calls, attribution).
- `src/components/binder/ArtistShelf.tsx`: the shelf.
- `src/components/auth/ArtistPanel.tsx`: the artist's panel in the account sheet.
- `src/components/analytics/ArtistsPanel.tsx`: Studio's queue and grants.
- `state/apply-artists.ps1`: applies the migration and makes the owner an artist (owner-run).
