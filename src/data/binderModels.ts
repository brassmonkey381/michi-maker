/**
 * THE BINDERS THEMSELVES — the physical objects a michi binder can be dressed as.
 *
 * A michi binder has always been pages in the abstract. This is the other half: which real binder
 * those pages are sitting in, so the thing on screen looks like the thing on the shelf. A model
 * carries its page grid, its build (padding, closure, stitching), and the colourways it is sold in.
 *
 * FACTS COME FROM THE MANUFACTURER'S OWN PAGE, and where a number is not published it is derived
 * here and said to be derived (see `statedSize`). Colour names are the maker's, quoted exactly, so
 * an owner recognises the one they bought; the hex beside each is our reading of it, not a spec.
 *
 * Adding a model is adding an entry to MODELS. Nothing else needs to know: the renderer draws from
 * these fields, and `binderModel()` falls back to the first model for an id it does not recognise,
 * so a binder saved against a model that is later removed still opens.
 *
 * Sources, read 2026-09-01:
 *   us.vaultx.com/collections/card-binders/products/12-pocket-exo-tec-zip-binder-xl
 *   us.vaultx.com/collections/card-binders/products/9-pocket-exo-tec-zip-binder-anniversary
 */

/** The four surfaces of an open binder, in the order you meet them. */
export const COVER_SURFACES = ['front', 'frontInside', 'backInside', 'back'] as const;
export type CoverSurfaceId = (typeof COVER_SURFACES)[number];

export const COVER_SURFACE_LABELS: Record<CoverSurfaceId, string> = {
  front: 'Front cover',
  frontInside: 'Inside front',
  backInside: 'Inside back',
  back: 'Back cover',
};

/** Which side of the spine a surface sits on when the binder is open on the table. */
export function surfaceSide(id: CoverSurfaceId): 'left' | 'right' {
  return id === 'front' || id === 'backInside' ? 'left' : 'right';
}

/** An exterior surface faces the world; an interior one faces the pages. */
export function surfaceIsInside(id: CoverSurfaceId): boolean {
  return id === 'frontInside' || id === 'backInside';
}

export type BinderColourway = {
  /** The maker's own name for it. Shown to the owner verbatim. */
  id: string;
  name: string;
  /** Our reading of the colour, not a published value. */
  shell: string;
  /** Thread colour. The Anniversary's is gold; the rest stitch tonally. */
  stitch: string;
  /** Zip tape, teeth and pull. A metal pull reads as a highlight rather than a flat fill. */
  zipTape: string;
  zipTeeth: string;
  zipPull: string;
  /** Microfibre lining behind the pages. */
  lining: string;
  /** Foil/print colour for the brand mark on the front. */
  badge: string;
  /** True when the shell is light enough that dark type and a dark spine shadow read better. */
  light?: boolean;
};

export type BinderModel = {
  id: string;
  brand: string;
  /** The maker's full product name, quoted. */
  name: string;
  /** Short enough for a chip. */
  shortName: string;
  /** Pocket grid of ONE side of ONE page. */
  rows: number;
  cols: number;
  /** Double-sided sheets the binder ships with, and the capacity that implies. */
  sheets: number;
  capacity: number;
  /** Outside dimensions in mm, WHERE THE MAKER PUBLISHES THEM. Absent means we do not know. */
  statedSize?: { h: number; w: number; d: number };
  closure: 'zip' | 'strap' | 'none';
  /** A padded shell sits proud of its seams; a rigid one does not. */
  padded: boolean;
  /** What the shell is made of, in the maker's words. */
  material: string;
  /** Anything stamped inside. The Anniversary carries its edition mark on the lining. */
  liningStamp?: string;
  colourways: BinderColourway[];
  /** Which colourway a binder gets when it is first dressed in this model. */
  defaultColourway: string;
  /** One line for the picker, in our voice rather than the maker's marketing. */
  blurb: string;
};

/** Vault X's zip hardware reads the same across the range: dark tape, steel teeth. */
const STEEL_ZIP = { zipTape: '#1b1b1e', zipTeeth: '#b9bcc4', zipPull: '#d8dbe1' } as const;

export const BINDER_MODELS: BinderModel[] = [
  {
    id: 'vaultx-exotec-zip-12-xl',
    brand: 'Vault X',
    name: '12-Pocket Exo-Tec Zip Binder XL',
    shortName: '12-pocket XL',
    // 12 pockets a side, landscape-ish: four columns across, three rows down. That is also the
    // only arrangement the stated 340mm width and 350mm height leave room for at 63x88mm a card.
    rows: 3,
    cols: 4,
    sheets: 26,
    capacity: 624,
    statedSize: { h: 350, w: 340, d: 40 },
    closure: 'zip',
    padded: true,
    material: 'Padded, water-resistant Exo-Tec',
    defaultColourway: 'signature-black',
    blurb: 'The big one. Twelve pockets a side, twenty-six sheets, and a zip all the way round.',
    colourways: [
      { id: 'signature-black', name: 'Signature Black', shell: '#1f2024', stitch: '#33353c', ...STEEL_ZIP, lining: '#141519', badge: '#8d9099' },
      { id: 'royal-blue', name: 'Royal Blue', shell: '#1e3a76', stitch: '#2c4d93', ...STEEL_ZIP, lining: '#101c33', badge: '#a8bde2' },
      { id: 'forest-green', name: 'Forest Green', shell: '#1e4430', stitch: '#2a5a40', ...STEEL_ZIP, lining: '#14261c', badge: '#9fc4ac' },
      { id: 'fire-red', name: 'Fire Red', shell: '#9d1f24', stitch: '#b93036', ...STEEL_ZIP, lining: '#2a1113', badge: '#f0b3b5' },
      { id: 'ocean-blue', name: 'Ocean Blue', shell: '#2f77b5', stitch: '#4790cd', ...STEEL_ZIP, lining: '#17303f', badge: '#d3e7f7' },
      { id: 'sunrise-yellow', name: 'Sunrise Yellow', shell: '#e0a92a', stitch: '#f0c052', ...STEEL_ZIP, lining: '#332608', badge: '#5a4410', light: true },
    ],
  },
  {
    id: 'vaultx-exotec-zip-9-anniversary',
    brand: 'Vault X',
    name: '9-Pocket Exo-Tec Zip Binder Anniversary',
    shortName: '9-pocket Anniversary',
    rows: 3,
    cols: 3,
    sheets: 20,
    capacity: 360,
    // The maker does not publish the closed dimensions of this one, so we do not pretend to.
    closure: 'zip',
    padded: true,
    material: 'Padded, water-resistant Exo-Tec',
    liningStamp: 'ANNIVERSARY EDITION',
    defaultColourway: 'anniversary-white',
    blurb: 'White on white with gold thread, and the edition stamped into the lining.',
    colourways: [
      {
        id: 'anniversary-white',
        name: 'Anniversary White',
        shell: '#f2efe9',
        stitch: '#c9a227',
        zipTape: '#e6e1d8',
        zipTeeth: '#d8c37a',
        zipPull: '#c9a227',
        lining: '#f6f4ef',
        badge: '#c9a227',
        light: true,
      },
    ],
  },
];

export const DEFAULT_BINDER_MODEL_ID = BINDER_MODELS[0].id;

/** The model for an id, falling back to the first rather than failing on an unknown one. */
export function binderModel(id: string | undefined): BinderModel {
  return BINDER_MODELS.find((m) => m.id === id) ?? BINDER_MODELS[0];
}

/** The colourway for an id within a model, falling back to that model's default. */
export function binderColourway(model: BinderModel, id: string | undefined): BinderColourway {
  return (
    model.colourways.find((c) => c.id === id) ??
    model.colourways.find((c) => c.id === model.defaultColourway) ??
    model.colourways[0]
  );
}

/**
 * The shape of ONE closed cover, width ÷ height.
 *
 * Taken from the stated dimensions where the maker publishes them, and otherwise DERIVED from the
 * pocket grid: a page of 63x88mm cards plus the margin a real binder leaves around them. Derived
 * is not guessed at, but it is not measured either, which is why the two cases are kept apart.
 */
export function coverAspect(model: BinderModel): number {
  if (model.statedSize) return model.statedSize.w / model.statedSize.h;
  const CARD_W = 63;
  const CARD_H = 88;
  const MARGIN = 24; // binding edge plus the border a pocket page leaves on all sides
  return (model.cols * CARD_W + MARGIN) / (model.rows * CARD_H + MARGIN);
}

/** How wide the spine is relative to a cover's width, for drawing the open book. */
export function spineRatio(model: BinderModel): number {
  if (!model.statedSize) return 0.1;
  return model.statedSize.d / model.statedSize.w;
}
