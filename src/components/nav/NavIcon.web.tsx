/**
 * THE GLYPH BESIDE A MENU LABEL, web only.
 *
 * Thirteen text links in a column read as one grey block; a small outline glyph in front of each
 * is what lets the eye land on "My Binders" without reading down to it. Drawn as inline SVG in
 * this .web file because the app carries no icon font and no svg library (the LogoMark is plain
 * Views for the same reason), and a 16 px stroke glyph is a dozen bytes of path, not a package.
 * The native file beside this one renders nothing: there is no rail on native and the drawer
 * there keeps its labels.
 *
 * Every glyph is a 24 unit box, 1.75 stroke, round joins, in `currentColor`, so the row's text
 * colour is the icon's colour and the active and hover states need no second rule.
 */
import type { NavIconName } from '@/components/nav/navItems';

const PATHS: Record<NavIconName, string[]> = {
  // A ring binder: the cover with its spine, and two rings standing off the left edge.
  binders: ['M7 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z', 'M10 3v18', 'M4.5 8a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0', 'M4.5 16a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0'],
  set: ['M3 3h7v7H3z', 'M14 3h7v7h-7z', 'M3 14h7v7H3z', 'M14 14h7v7h-7z'],
  cards: ['M5 3h14a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z', 'M8 7h8', 'M8 11h8'],
  scan: ['M3 7V5a2 2 0 0 1 2-2h2', 'M17 3h2a2 2 0 0 1 2 2v2', 'M21 17v2a2 2 0 0 1-2 2h-2', 'M7 21H5a2 2 0 0 1-2-2v-2', 'M7 12h10'],
  discover: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z', 'M16.2 7.8l-2.1 6.4-6.3 2 2.1-6.4z'],
  // The jigsaw piece the owner handed over as a picture (2026-10-27), traced into a polygon
  // (OpenCV contour, 0.7 unit tolerance) and fitted to the box. Filled, not stroked: see FILLED.
  puzzle: ['M1.1 6 1 12.1 2.4 12.2 3.8 11.7 5 12.3 5.6 13.2 6 14.8 5.3 16.3 4.4 16.9 1 16.8 1 22.8 7.2 22.9 7.1 19.5 8.2 18.4 9.8 18 11.3 18.6 12.2 19.8 12.3 20.5 11.7 21.9 11.9 22.9 17.9 22.9 18.1 16.7 18.5 16.4 19.2 16.4 20.5 16.9 21.5 16.9 22.6 15.7 23 14.5 22.6 13.2 21.5 12 20.2 12 18.9 12.6 18.1 12.1 18 6.1 11.9 5.9 11.7 4.3 12 3.8 11.9 2.5 10.8 1.3 9.5 1 8.2 1.3 7.1 2.8 7.1 3.5 7.6 4.8 7.6 5.5 7.2 5.9z'],
  // A 2 x 2 grid with a tick in three cells: the coverage table's live marks.
  coverage: ['M3 3h18v18H3z', 'M12 3v18', 'M3 12h18', 'M5.5 7.5l1.5 1.5 2.5-3', 'M14.5 7.5l1.5 1.5 2.5-3', 'M5.5 16.5l1.5 1.5 2.5-3'],
  howto: ['M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z', 'M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z'],
  method: ['M9 18h6', 'M10 22h4', 'M15.1 14c.2-1 .6-1.7 1.4-2.5A4.7 4.7 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.8.8 1.2 1.5 1.4 2.5'],
  news: ['M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9', 'M13.7 21a2 2 0 0 1-3.4 0'],
  plans: ['M2 6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z', 'M2 10h20', 'M6 15h4'],
  vote: ['M9 11l3 3L22 4', 'M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11'],
  feedback: ['M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z'],
};

/** Glyphs drawn as a silhouette in currentColor rather than an outline. */
const FILLED = new Set<NavIconName>(['puzzle']);

export function NavIcon({ name, size = 16 }: { name: NavIconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0, display: 'block' }}>
      {PATHS[name].map((d) => (
        <path key={d} d={d} fill={FILLED.has(name) ? 'currentColor' : undefined} stroke={FILLED.has(name) ? 'none' : undefined} />
      ))}
    </svg>
  );
}
