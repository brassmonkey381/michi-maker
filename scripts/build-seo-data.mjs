/**
 * `api/_seo.json` from `src/data/guides.ts` (and the michi-method copy below).
 *
 * The serverless functions in api/ are CommonJS and cannot import the app's TypeScript, yet the
 * guide titles and steps they emit as HowTo structured data must be the ones the app shows. So
 * the build writes them out as JSON; this runs in `buildCommand` (vercel.json) after the export,
 * and the generated file is committed too so a local harness has it. A test
 * (src/data/seoData.test.ts) fails when the two drift.
 *
 * Node 22+ runs the .ts directly (type stripping); guides.ts imports nothing, by design.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { GUIDE_LIST } = await import(pathToFileURL(path.join(root, 'src/data/guides.ts')).href);

/** What people ask about the method, answered in one breath each: the FAQPage on /michi-method. */
export const MICHI_FAQ = [
  {
    q: 'What is a michi binder?',
    a: 'A michi binder is a Pokémon card binder where every page is composed as one picture instead of sorted by set or number: cards, printed artwork, deliberate empty pockets and images sliced across several pockets, arranged so the page looks intentional. The name comes from the collector Michi (@peeplop), who popularised the style.',
  },
  {
    q: 'What is the michi method?',
    a: 'The michi method is the set of page ideas behind those binders: an anchor page built around one card, a single-Pokémon page, an evolution line, a colour-matched spread, an artist gallery, and a full-page artwork cut into pocket-sized pieces. Michi-Maker builds each of these from one seed card with its Fill page tool.',
  },
  {
    q: 'How do I make a michi binder?',
    a: 'Pick a page shape (3×3 is the classic, 3×4 for larger binders), place one card you love, and build the rest of the page around it: the same Pokémon, its evolution line, its artist, or cards that share its colours. Print the page at true card size as a fill sheet, slide the paper pieces into the pockets, and swap in the real cards as they arrive.',
  },
  {
    q: 'Is Michi-Maker free?',
    a: 'Yes. Building and sharing binders, the auto-fill methods, and the print preview are free. Paid PRO and VIP plans add full-binder PDF export, binder covers, advanced and artwork-theme search, and more.',
  },
  {
    q: 'What size are the printed pieces?',
    a: 'Exactly card size: 2.5 by 3.5 inches (63 by 88 mm), printed at 100 percent with no scaling, so each piece fits a standard sleeve or pocket and marks the spot the real card will take.',
  },
];

export const MICHI_LAYOUTS = [
  { name: 'Anchor page', body: 'One card the page is about, everything else chosen to frame it.' },
  { name: 'Single Pokémon', body: 'Every card of one Pokémon: its art across years and artists.' },
  { name: 'Evolution line', body: 'A family read in order, baby to final stage, sometimes with the trainer who owns them.' },
  { name: 'Colour spread', body: 'Cards picked for a shared palette so the whole page reads as one hue.' },
  { name: 'Artist gallery', body: 'One illustrator, the page as their exhibition.' },
  { name: 'Sliced artwork', body: 'A single picture cut into pocket-sized pieces that reassemble across the page.' },
];

export function buildSeoData(guides, today = new Date().toISOString().slice(0, 10)) {
  return {
    generatedOn: today,
    guidesPublished: '2026-08-12',
    guides: guides.map((g) => ({
      slug: g.slug,
      title: g.title,
      lede: g.lede,
      tip: g.tip ?? null,
      steps: g.steps.map((s) => ({ title: s.title, body: s.body })),
    })),
    michiFaq: MICHI_FAQ,
    michiLayouts: MICHI_LAYOUTS,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = buildSeoData(GUIDE_LIST);
  writeFileSync(path.join(root, 'api/_seo.json'), JSON.stringify(out, null, 2) + '\n');
  console.log(`build-seo-data: ${out.guides.length} guides, ${MICHI_FAQ.length} FAQs -> api/_seo.json`);
}
