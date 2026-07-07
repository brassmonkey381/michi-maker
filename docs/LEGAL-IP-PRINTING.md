# Legal / IP risk posture — future printing & paid services (2026-07-07)

**Status: forward-looking note, not current product work.** Nothing is being built
yet. This doc exists so that *if* we ever sell printing services (or any other
paid service) around michi binders, we make product decisions with these risks
already in mind — and so we don't accidentally paint ourselves into a risky
position with today's copy, marketing, or features.

Source: founder note + a ChatGPT draft (2026-07-07). Not legal advice; get a
real lawyer before launching anything commercial.

## The two IP parties we're careful around

1. **Pokémon / Nintendo / The Pokémon Company** — copyright in card art and
   characters; trademarks in names, logos, Poké Balls, and card trade dress.
2. **TCGPlayer** — we currently use their image CDN as a fallback
   (`image_cdn`) and their market prices. Don't commercialize their data or
   brand beyond what their terms allow. Upside: **TCGPlayer has an affiliate
   program and would likely welcome us** — that's the sanctioned way to make
   money adjacent to their ecosystem. Worth pursuing when monetization starts.

## Core legal framing (from the draft)

Selling a printing service is possible, but "I don't care what I'm printing"
is **not** a safe legal position:

- **Copyright** — printing a user-uploaded Pokémon image is still making a
  copy. Reproduction and distribution are exclusive rights of the owner, even
  when the output is a private one-off for the uploader.
- **Trademark** — Pokémon names, logos, Poké Balls, card trade dress, and
  recognizable characters create brand-confusion exposure. DMCA copyright
  safe harbor does **not** protect against trademark claims.
- **DMCA safe harbor may not cover physical printing.** Safe harbors protect
  qualifying *online service providers* for hosting/display of user content;
  print-on-demand case law is messy, and the manufacturing/shipping step is
  less clearly protected than the hosting step.

Risk gradient: privately printing a user's own uploads for that same user is
lower risk than selling Pokémon fan-art products publicly — but it is not zero.

## Safer model vs riskier model

**Safer (the posture we want):**
- Users upload their own images and represent they have rights/permission.
- We print a private one-off for personal use — no public catalog of output.
- We do **not** advertise using Pokémon/Nintendo/card brands.
- We do **not** provide infringing templates, or generate/curate Pokémon fan art.
- We have a takedown / IP-complaint process.
- Positioning: *"custom trading-card binder pages / custom art inserts from
  user-owned images"* — a neutral printer.

**Riskier (what to avoid):**
- Marketing it as "Pokémon binder art".
- Shipping Pokémon-themed layouts or prebuilt Pokémon designs for sale.
- Letting users browse fan art inside the app; scraping images.
- Showcasing examples that use Pokémon characters.
- Anything that makes us look like a business commercializing Pokémon IP
  rather than a neutral print service.

## Minimum guardrails before any commercial launch

- [ ] Terms of service: users must own or have rights to uploaded images.
- [ ] Checkout checkbox: "I confirm I have permission to reproduce these images."
- [ ] Designated DMCA agent + takedown process (required for US safe-harbor
      protection when hosting user uploads).
- [ ] Repeat-infringer policy.
- [ ] No public gallery of user-uploaded franchise/copyrighted art unless
      reviewed/licensed.
- [ ] Prohibited-content / IP policy that lets us refuse obviously infringing
      commercial orders.
- [ ] No Pokémon names in SEO, ads, product titles, or sample screenshots.

## Implications for the app *today*

Even before monetization, keep optionality by not building the "riskier model"
into the product's public face:

- Keep franchise names out of app-store copy, marketing pages, and screenshots
  we control (product name is already neutral: "michi maker").
- Don't ship curated Pokémon fan-art galleries or sell prebuilt themed designs.
- If/when a public sharing or gallery feature is considered, revisit this doc
  first — a public gallery of card images is exactly the surface that erodes
  the "neutral tool" posture.
- When monetization starts, evaluate the **TCGPlayer affiliate program** as the
  first, lowest-risk revenue channel before any print offering.
