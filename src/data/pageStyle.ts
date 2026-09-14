/**
 * HOW A BINDER'S PAGES ARE MADE: the material of the page, and what its pockets are dressed in.
 *
 * A real collector's binder is not a white rectangle with nine holes in it. The page is a sheet of
 * dark fabric with a stitched edge, or a zip-around wallet; the cards sit in coloured sleeves; the
 * printed art has a backing behind it. Every one of those is a thing a person chose, and until now
 * michi could not show any of them, so every binder here looked like the same white page.
 *
 * ONE OBJECT PER BINDER, like the cover and the soundtrack, and for the same reason: a binder is one
 * physical object and its pages do not change material halfway through. Persisted whole in
 * `binders.page_style` (jsonb). Absent means the plain page every binder had before, so nothing is
 * backfilled and nothing changes for anyone until they choose.
 *
 * A FIRST PASS (owner, 2026-09-13). Binder-wide only: one material, one sleeve colour for every
 * card, one backing for every art piece. The obvious next steps are named at the bottom.
 *
 * PURE, importing nothing from react-native, so `node --test` can reach all of it.
 */

/** How the page's edge is finished. */
export type PageMaterial = 'classic' | 'stitched' | 'zip';

export const PAGE_MATERIALS: { id: PageMaterial; label: string; blurb: string }[] = [
  { id: 'classic', label: 'Classic', blurb: 'The plain page.' },
  { id: 'stitched', label: 'Stitched', blurb: 'A fabric page with a stitched edge and a little depth.' },
  { id: 'zip', label: 'Zip', blurb: 'Stitched, with a zip along the outer edge.' },
];

export interface PageStyle {
  /** Absent means classic. */
  material?: PageMaterial;
  /** Every card pocket wears a sleeve of this colour, #rrggbb. Absent means bare pockets. */
  sleeve?: string;
  /** Every art piece sits on a backing of this colour, #rrggbb. Absent means none. */
  artBacking?: string;
}

const HEX = /^#[0-9a-f]{6}$/i;
const MATERIALS = new Set<string>(PAGE_MATERIALS.map((m) => m.id));

/**
 * Storage is user-writable and jsonb is whatever was last put there: shape-check, never trust.
 * Returns undefined for anything that is not a usable style, so a bad row reads as the plain page
 * rather than reaching the renderer half-built.
 */
export function normalizePageStyle(value: unknown): PageStyle | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as { material?: unknown; sleeve?: unknown; artBacking?: unknown };
  const out: PageStyle = {};
  if (typeof raw.material === 'string' && MATERIALS.has(raw.material) && raw.material !== 'classic') {
    out.material = raw.material as PageMaterial;
  }
  if (typeof raw.sleeve === 'string' && HEX.test(raw.sleeve)) out.sleeve = raw.sleeve.toLowerCase();
  if (typeof raw.artBacking === 'string' && HEX.test(raw.artBacking)) out.artBacking = raw.artBacking.toLowerCase();
  return Object.keys(out).length ? out : undefined;
}

/**
 * Merge a change into a style. A field set to `null` is cleared; `undefined` is left alone. The
 * result is normalised, so clearing the last field hands back undefined and the column goes null.
 */
export function withPageStyle(
  current: PageStyle | undefined | null,
  patch: { material?: PageMaterial | null; sleeve?: string | null; artBacking?: string | null },
): PageStyle | undefined {
  const next: Record<string, unknown> = { ...(current ?? {}) };
  for (const key of ['material', 'sleeve', 'artBacking'] as const) {
    if (patch[key] === undefined) continue;
    if (patch[key] === null) delete next[key];
    else next[key] = patch[key];
  }
  return normalizePageStyle(next);
}

/** Relative luminance of #rrggbb, 0 (black) to 1 (white). WCAG's formula, nothing clever. */
export function luminance(hex: string): number {
  const h = hex.replace('#', '');
  if (h.length !== 6) return 1;
  const ch = (i: number) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(0) + 0.7152 * ch(2) + 0.0722 * ch(4);
}

/**
 * The thread colour for a stitched edge: pale on a dark page, dark on a pale one. Thread is drawn
 * translucent so it sits IN the fabric rather than on top of it; these are the two inks it is cut
 * from. The threshold is where mid-greys tip, chosen by eye against both.
 */
export function stitchInk(matHex: string): string {
  return luminance(matHex) < 0.35 ? 'rgba(255,255,255,0.78)' : 'rgba(0,0,0,0.42)';
}

/**
 * The mat a material defaults to when the binder has no background of its own. Stitching on a white
 * page is a napkin; the competitor's page in the owner's screenshots is near-black fabric, and that
 * is what people mean when they say a binder looks real. The user's own background still wins.
 */
export function defaultMatFor(material: PageMaterial | undefined): string | undefined {
  return material && material !== 'classic' ? '#17171a' : undefined;
}

/*
 * NEXT, in the order they are worth doing:
 *   - A sleeve per POCKET (`DemoSlot.sleeve`), so one chase card can wear a different sleeve. Needs a
 *     `binder_slots.sleeve` column and a chip in the pocket toolbar.
 *   - Sleeve styles beyond a flat colour: a matte edge, a glossy edge, a pattern.
 *   - A page style on the print sheet: backing behind art pieces prints as a border.
 *   - A material with the rings and spine drawn on the spread, not only the page edge.
 */
