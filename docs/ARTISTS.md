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
| slot | Add art sheet, and the Picture insert row of both Inserts tabs (art dock, pocket picker) |
| sleeve, backing | the Picture row of every sleeve and backing field (binder, page, pocket) |
| background | the page background pickers (binder settings, the page bar) and the Share sheet's backdrop picker |
| cover | the cover panel toolbar |
| mat | the Art window mats panel (binder settings, and the page bar's Art view popover): the picture over the mat's paper |

A placed piece carries `attribution.origin = 'artist'` with the artist's `@username` and link. It
is public-eligible, labelled "Artist piece, preview only" in image properties, and the print path
prints a placeholder named for the artist instead of the picture.

## Printing (2026-11-03)

An admin can mark an artist **Prints as shown** in the Studio panel (`profiles.artist_prints`,
`admin_set_artist_prints`). The shelf carries it as `prints`, a piece placed from the shelf is
stamped `attribution.printable = true`, image properties say "prints as shown", and the print path
prints the picture as it would an upload. Pieces placed before the switch keep the stamp they were
placed with. The owner's account (@fakemichi) is the first such artist (`state/apply-artist-prints.ps1`).

What prints today: art slots and picture inserts, except a catalog card scan placed as a picture (`origin: 'card'`, the picker was removed 2026-11-05), which prints as a placeholder labelled Card art. Sleeves, art backings, page backgrounds and
covers are screen decoration with no print path for anyone; a mat prints as a plain black or white
card with the card's facts, its picture and style not yet.

## Files

- `supabase/migrations/20261103100000_artists.sql`: columns, table, view `artist_shelf`, admin RPCs.
- `src/data/artists.ts`: the repo (shelf cache, the artist's pieces, admin calls, attribution).
- `src/components/binder/ArtistShelf.tsx`: the shelf.
- `src/components/auth/ArtistPanel.tsx`: the artist's panel in the account sheet.
- `src/components/analytics/ArtistsPanel.tsx`: Studio's queue and grants.
- `state/apply-artists.ps1`: applies the migration and makes the owner an artist (owner-run).
- `supabase/migrations/20261103130000_artist_prints.sql` and `state/apply-artist-prints.ps1`: the Prints permission.
