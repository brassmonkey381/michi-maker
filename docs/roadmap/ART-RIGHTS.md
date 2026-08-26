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

## The crux: SUPPLY, not printing (owner-refined 2026-07-17)

The distinction that actually moves risk is **not "do we print"** (we don't — we arrange and
export a file the user chooses to print at home) and **not "do we charge for art"** (we don't —
we charge for the software + arrangement/cut-line engineering + export). It's:

> **Does michi-maker SUPPLY the art, or does the USER bring it?**

- User brings their own art → michi-maker is **Canva/Photoshop for binder layouts**: a neutral
  tool, not liable for what users make. Reproduction happens **client-side** (pdf-lib in the
  user's browser — KEEP IT THERE; do not move PDF generation server-side), at the user's command,
  for personal use. This is the TARGET MODEL.
- michi-maker supplies/curates the art (a built-in gallery, or our own Pokémon-art example
  binders) → we're a design tool that ALSO ships a library of copyrighted art. That's where the
  exposure concentrates, and it doesn't care whether we print.

Every "we don't print / don't sell art / personal use" clarification pushes toward the neutral
tool; the only thing that undercuts it is supplying the art.

### Private/public art gate — SHIPPED (2026-07-17)
Every art piece carries a provenance class (`attribution.origin`): **`external`** = pulled from a
URL (we can't verify rights) → **PRIVATE**; **`upload`** = a file the user brought → public-eligible.
Rules, enforced:
- URL paste/drag → `external`; file upload/drop → `upload` (set at import in Slice Studio).
- Slice tray shows a **PRIVATE** badge on external pieces; the studio warns while an external
  image is loaded.
- A binder with ANY private (`external`) art **cannot be made public** (`privateArtInBinder` in
  `src/data/artAttributionCheck.ts`, gate in ShareSheet). Clean binders require a **rights
  attestation checkbox** at share time (owner confirms they own/created/are licensed for all art +
  agrees to ToS) before the public flag flips.
- Adding private art to an already-public binder is **denied with a toast** (BinderScreen
  placement check) — the gate is re-enforced on edit, not just at share time.
- `origin` rides the existing `image_attribution` / `saved_slices.attribution` jsonb (no migration).

### Hotlink vs. upload — DECIDED: we host what users bring (no hotlinking) (2026-07-17)
michi-maker now **hosts the user's own copy** of every image, and never stores a hotlink. Paste or
drag a remote image URL and we FETCH it (direct → art-proxy edge fn) and UPLOAD it into the user's
`binder-art` bucket (`src/lib/importArt.ts` → `uploadArtImage`); the slot stores that bucket URL,
while the ORIGINAL url is kept only as attribution (the credit / public-binder source). Dropped
FILES upload the same way. If the fetch fails we tell the user to download + Upload — we NEVER fall
back to storing the remote link. This is the **DMCA safe-harbor host** posture (user affirmatively
brings art, we host it, we take down on notice) and makes "user-supplied" unambiguous. The PDF is
still generated client-side. Linking OUT to art sources stays (linking is not reproduction); the
sources list is framed neutrally ("art you have the right to use", responsibility on the user), and
we do not encourage copying art the user hasn't sourced and licensed.

## Risk ladder (lowest → highest exposure)

| Use | Posture | Exposure |
| --- | --- | --- |
| User brings/uploads their OWN art (hosted in their bucket) into a PRIVATE binder; client-side export | Neutral tool + UGC host | Lowest |
| Public binders with user art | User-driven, we display | Medium (DMCA + ToS — SHIPPED) |
| Example / featured binders **we** ship using Pokémon art | *We* supply + display | Higher — swap for cleared art |
| ~~**Option A** — self-hosted in-app art gallery~~ | We become the supplier | **DROPPED 2026-07-17 — do not build** |
| **Selling PDF prints** of binders containing this art | Commercial | Highest — counsel before shipping |

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

**Neutral-tool positioning SHIPPED (2026-07-17):** ToS §2 defines michi-maker as "a neutral tool
for content you supply" (software + arrangement/cut-line engineering + export; we don't provide/
license/sell art; client-side file for personal use); print sheet carries the same note; Slice
Studio art-sources modal leads with a rights-responsibility note and neutral framing.

**Option A: DROPPED.** No self-hosted in-app art gallery. michi-maker stays a tool for
user-supplied art. (The rebuilt artofpkm.json + attribution resolvers stay useful for crediting
user-brought art, not for us serving a gallery.)

**Deferred / open:**
- Swap our own Pokémon-art example/featured binders for art we can stand behind (commissioned/own,
  CC0/public-domain, or explicitly redistributable) — the remaining spot where *we* supply art.
- Decide hotlink vs. upload-only (see above).
- Counsel before selling prints of Pokémon-character art.

## Not blocking
Nothing current is blocked. This brief keeps the risk on the record and the design pointed at the
neutral-tool / user-supplied model.

## The 2026-08-26 loosening: imported art may go public (owner decision)

**What changed.** `isPrivateArt` no longer treats `origin: 'external'` as private when we host
the bytes (importArt re-hosts every pull into the user's bucket). Imported art can now appear in
public binders, credited by the attribution strip. The owner accepted the added DMCA exposure in
favor of growing traffic, explicitly and with the option to re-tighten later.

**What did NOT change, and must not:**
- **Stamping.** Every import still records `origin: 'external'`. The gate moved; the ledger did
  not. This is what keeps the re-tighten path one revert away, never remove the stamp to make a
  looser rule simpler.
- **The supply-side line.** Option A stays DROPPED. Users importing art they choose is 512(c)
  territory (we host at a user's direction and take down on notice); an in-app gallery would be
  us supplying the art, which safe harbor does not cover.
- **`origin: 'copied'` stays private.** Duplicating a binder still cannot republish someone
  else's art.
- **Raw hotlinks stay private.** We only stand behind images we serve.

**What carries the risk now (shipped with or before the loosening):**
- Account-level rights attestation, persisted (`profiles.rights_attested_at`), shown before a
  user's binders default public and required before any manual share.
- The moderation kit (20260826120000): `binders.removed_at` honored by every public read path,
  the /studio report queue with one-tap takedown/restore, the copyright-strikes ledger, and the
  guarded Discord alert on new reports.
- The credit strip under every custom art panel, which renders on public pages.

**RE-TIGHTEN RUNBOOK** (if exposure stops being worth it):
1. Revert the `origin === 'external'` branch in `src/data/artAttributionCheck.ts` to
   `return true;` (and its test).
2. Find the public binders holding external art, then flip them private or notify owners:
   ```sql
   select distinct b.id, b.owner_id
   from public.binders b
   join public.binder_pages pg on pg.binder_id = b.id
   join public.binder_slots s on s.page_id = pg.id
   where b.is_public
     and s.image_attribution ->> 'origin' = 'external';
   ```
3. Nothing else moves: stamping never changed, so there is no backfill to reconstruct.
