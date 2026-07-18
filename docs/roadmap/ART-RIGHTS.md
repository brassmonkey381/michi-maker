# Art rights & copyright risk

Status: **RISK BRIEF, non-blocking** (owner decision 2026-07-17). Nothing here gates shipping
today; it records the exposure so decisions are made with eyes open, and tracks the UGC-hygiene
work that makes the user-driven model defensible. **This is not legal advice — get IP counsel
before scaling or monetizing the art features.**

## The core problem

Attribution is not a license. We built excellent per-artwork attribution (artist + original
source; see [[art-attribution]] / docs, `src/data/artSearch.ts`, `artofpkm.json`), but crediting
an artist does not grant permission to use their work. Copyright is opt-in permission from the
rights holder; naming SAKANAGI does not mean SAKANAGI — or The Pokémon Company — said yes.

Two layers of rights sit on essentially every Pokémon artwork:

1. **The Pokémon IP** (characters, names, designs) — The Pokémon Company / Nintendo / Creatures,
   historically aggressive enforcers.
2. **The illustration copyright** — the artist's, or Pokémon's if commissioned. Our sources are
   Instagram / X posts.

"Promotional artwork" is not "free to reuse" — it promotes *their* products, not third-party
apps. The codebase already flags this honestly: every artofpkm asset carries
`licenseClear: false` ("provenance known, permission unverified" — NOT cleared).

## Risk ladder (lowest → highest exposure)

| Use | Posture | Exposure |
| --- | --- | --- |
| A user pastes their OWN sourced art into a PRIVATE binder | UGC / hosting — safe-harbor territory | Lowest |
| Public binders with user art | We publish it, but user-driven | Medium (needs DMCA + ToS) |
| Example / featured binders **we** ship using this art | *We* publish it | Higher |
| **Option A** — a curated, SELF-HOSTED in-app artofpkm gallery | We select, copy, distribute | High — self-hosting is worse than hotlinking |
| **Selling PDF prints** of binders containing this art | Commercial reproduction | Highest — guts fair-use |

The two features we were most excited to build next (self-hosted gallery + paid prints of that
art) are the two highest-risk uses. Noted, not blocked.

## Decisions & action items

**In progress now (UGC hygiene — makes the user-driven model defensible):**
- DMCA designated agent + `/legal/dmca` policy page (notice / counter-notice / repeat-infringer).
- ToS: users represent they hold rights to art they upload, grant michi-maker a license to
  host/display it, and indemnify us.
- In-app takedown: report affordance on public binders → `content_reports` → owner actions it.

**Owner real-world action (I can't do these):**
- Register a DMCA designated agent with the US Copyright Office (dmca.copyright.gov, ~$6) and put
  the real agent contact into `/legal/dmca` (replace the [PLACEHOLDER]).
- Consult an IP attorney before: shipping Option A, and before selling prints of Pokémon-character
  art. These are the two items most worth a paid consult.

**Deferred design choices (when Option A / prints are revisited):**
- Prefer art we can stand behind: commissioned/our own, genuine CC0/public-domain, or licenses
  that explicitly permit commercial redistribution — over bundling Pokémon promotional art.
- Consider firewalling the print product from Pokémon-character art until rights are sorted.
- Inventory exactly where Pokémon-sourced art currently ships (examples, featured, prints) so the
  real surface area is known before counsel.

## Not doing (yet)
- Blocking any current feature. Everything ships as-is; this brief keeps the risk on the record.
