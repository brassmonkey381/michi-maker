/**
 * Theme variations (Phase 2). Each variant is a complete token set — the 5
 * scheme-aware `Colors` roles, the semantic `Palette`, the binder `Surface`,
 * control `Radius`, and the slot-backing fallback. `theme.ts` resolves the
 * ACTIVE variant once at module load and re-exports its tokens, so every
 * component (which imports `Palette`/`Colors`/`Radius`/`BinderSurface` from
 * `@/constants/theme`) restyles wholesale when the variant changes.
 *
 * Selecting a variant on web (local dev): append `?variant=vintage` to the URL,
 * or use the on-screen VariantSwitcher (writes localStorage + reloads).
 *
 * `neutral` reproduces the pre-variation values exactly, so it doubles as the
 * "today" reference among the four.
 */
import { Appearance, Platform } from 'react-native';

type ColorRoles = {
  text: string;
  background: string;
  backgroundElement: string;
  backgroundSelected: string;
  textSecondary: string;
};

// ── Neutral (base = current look, refined into a clean gallery neutral) ───────
const NEUTRAL = {
  colors: {
    light: {
      text: '#000000',
      background: '#ffffff',
      backgroundElement: '#F0F0F3',
      backgroundSelected: '#E0E1E6',
      textSecondary: '#60646C',
    },
    dark: {
      text: '#ffffff',
      // Soft near-black, not #000 — pure black against white cards/mats is harsh on OLED
      // and was an eye-strain complaint from the owner.
      background: '#131417',
      backgroundElement: '#212225',
      backgroundSelected: '#2E3135',
      textSecondary: '#B0B4BA',
    },
  },
  palette: {
    accent: '#3B82F6',
    accentText: '#ffffff',
    accentSoft: '#7EB2FF',
    link: '#3c87f7',
    selectionSoft: '#e8f0fe',
    selectionTint: '#dbe7ff',

    white: '#ffffff',
    black: '#000000',
    surface: '#ffffff',
    panel: '#f0f0f3',
    panelAlt: '#f6f6f8',
    controlBorder: '#e0e0e3',
    handle: '#d4d4d4',
    hairline: '#ececec',
    hairlineStrong: '#dddddd',

    ink: '#222222',
    ink2: '#333333',
    ink3: '#444444',
    ink4: '#555555',
    muted: '#666666',
    muted2: '#888888',
    muted3: '#999999',
    muted4: '#aaaaaa',

    onDark: '#9a9a9a',
    onDarkMuted: '#8a8a96',
    onDarkMuted2: '#8a8a93',

    danger: '#DC2626',
    dangerAlt: '#c0392b',
    dangerBg: '#fdeaea',
    success: '#059669',

    chrome: '#14131A',
    chromeDeep: '#11111a',
    chromeDeepest: '#0d0d12',
    toast: '#222228',

    scrim30: 'rgba(0,0,0,0.3)',
    scrim40: 'rgba(0,0,0,0.4)',
    scrim45: 'rgba(0,0,0,0.45)',
    scrim60: 'rgba(0,0,0,0.6)',
    scrim62: 'rgba(0,0,0,0.62)',

    swatchBorder: 'rgba(128,128,128,0.35)',
    grayBorder50: 'rgba(128,128,128,0.5)',
    grayBorder70: 'rgba(128,128,128,0.7)',
    skeletonFill: 'rgba(150,150,150,0.20)',
    tagWarn: 'rgba(192,57,43,0.85)',
  },
  /**
   * Palette overrides applied when the variant's EFFECTIVE scheme is dark (see
   * `activePalette` below). The base `palette` is light-only — surfaces, ink ramp and
   * hairlines all assume a light background, which made dark mode unreadable (dark ink
   * text and white panels on black). Only the roles that assume a background need
   * flipping; accents, chrome, scrims and literals inherit.
   */
  paletteDark: {
    link: '#6FA5F8',
    selectionSoft: 'rgba(59,130,246,0.16)',
    selectionTint: 'rgba(59,130,246,0.30)',
    surface: '#1A1B1E',
    panel: '#212225',
    panelAlt: '#1B1C1F',
    controlBorder: '#3A3B40',
    handle: '#4A4B52',
    hairline: '#26272B',
    hairlineStrong: '#34353B',
    ink: '#F2F2F5',
    ink2: '#E2E3E7',
    ink3: '#C8C9CF',
    ink4: '#AEB0B8',
    muted: '#B0B4BA',
    muted2: '#8E9298',
    muted3: '#75797F',
    muted4: '#5C6066',
    dangerBg: 'rgba(220,38,38,0.16)',
  },
  surface: {
    mat: '#fbfaf7',
    pocketFill: 'rgba(120, 116, 108, 0.05)',
    pocketBorder: 'rgba(120, 116, 108, 0.20)',
    pocketInnerShadow: 'rgba(80, 76, 70, 0.07)',
    cardFrame: '#ffffff',
    cardFrameBorder: 'rgba(40, 34, 28, 0.12)',
    foilSheen: 'rgba(255, 255, 255, 0.16)',
    insertHighlight: 'rgba(255, 255, 255, 0.22)',
    insertBorder: 'rgba(0, 0, 0, 0.05)',
    selection: '#3B82F6',
  },
  radius: { xs: 2, tag: 3, sm: 4, thumb: 6, control: 8, panel: 12, actionBar: 14, lg: 16, sheet: 20, pill: 999 },
  slotBacking: '#f1f1f1',
};

type PaletteRoles = typeof NEUTRAL.palette;
export type Tokens = Omit<typeof NEUTRAL, 'paletteDark'> & { paletteDark: Partial<PaletteRoles> };
type ColorSet = { light: ColorRoles; dark: ColorRoles };
type Deep = {
  colors?: { light?: Partial<ColorRoles>; dark?: Partial<ColorRoles> };
  palette?: Partial<Tokens['palette']>;
  /** Merged over the neutral dark overrides, then over the variant's own light palette. */
  paletteDark?: Partial<PaletteRoles>;
  surface?: Partial<Tokens['surface']>;
  radius?: Partial<Tokens['radius']>;
  slotBacking?: string;
};

function make(o: Deep): Tokens {
  const b = NEUTRAL;
  return {
    colors: {
      light: { ...b.colors.light, ...o.colors?.light },
      dark: { ...b.colors.dark, ...o.colors?.dark },
    } as ColorSet,
    palette: { ...b.palette, ...o.palette },
    // No inheritance from neutral here: a variant whose BASE palette is already dark
    // (Dark Vault) needs paletteDark to stay empty so the overrides are a no-op.
    paletteDark: { ...o.paletteDark },
    surface: { ...b.surface, ...o.surface },
    radius: { ...b.radius, ...o.radius },
    slotBacking: o.slotBacking ?? b.slotBacking,
  };
}

// ── Warm Vintage Binder ──────────────────────────────────────────────────────
const VINTAGE = make({
  colors: {
    light: { text: '#2E2317', background: '#F7EFE0', backgroundElement: '#EFE6D6', backgroundSelected: '#E4D6BF', textSecondary: '#6E5B42' },
    dark: { text: '#F3E9D8', background: '#1C150D', backgroundElement: '#2A2116', backgroundSelected: '#38301F', textSecondary: '#B8A387' },
  },
  palette: {
    accent: '#A9743E', accentSoft: '#D8B98C', link: '#96602E',
    selectionSoft: '#F1E6D3', selectionTint: '#E4D2B2',
    surface: '#FBF6EC', panel: '#EFE6D6', panelAlt: '#F5EEE0',
    controlBorder: '#DECBAE', handle: '#CBB491', hairline: '#E7DAC5', hairlineStrong: '#D8C6A8',
    ink: '#2E2317', ink2: '#3D2F1E', ink3: '#4E3D28', ink4: '#5E4B33',
    muted: '#6E5B42', muted2: '#8A745A', muted3: '#A08A6E', muted4: '#B8A387',
    danger: '#B4472B', dangerAlt: '#9C3D26', dangerBg: '#F3E1D6', success: '#5E7D4F',
    chrome: '#241C12', chromeDeep: '#1C150D', chromeDeepest: '#150F08', toast: '#2A2116',
  },
  paletteDark: {
    link: '#C89B6A',
    selectionSoft: 'rgba(169,116,62,0.18)', selectionTint: 'rgba(169,116,62,0.32)',
    surface: '#241C12', panel: '#2A2116', panelAlt: '#221A10',
    controlBorder: '#4A3B26', handle: '#5A4A31', hairline: '#332917', hairlineStrong: '#443620',
    ink: '#F3E9D8', ink2: '#E7DAC2', ink3: '#CDBD9F', ink4: '#B8A387',
    muted: '#B8A387', muted2: '#9C8869', muted3: '#83704F', muted4: '#6E5B42',
    dangerBg: 'rgba(180,71,43,0.18)',
  },
  surface: {
    mat: '#F3E7CE', pocketFill: 'rgba(120,100,70,0.06)', pocketBorder: 'rgba(120,100,70,0.22)',
    pocketInnerShadow: 'rgba(80,64,40,0.08)', cardFrame: '#FBF6EC', cardFrameBorder: 'rgba(60,44,24,0.14)',
    insertBorder: 'rgba(40,28,10,0.06)', selection: '#A9743E',
  },
  radius: { control: 6, panel: 10 },
  slotBacking: '#EDE3D1',
});

// ── Vivid Poké-Pop ───────────────────────────────────────────────────────────
const POP = make({
  colors: {
    light: { text: '#141726', background: '#FFFFFF', backgroundElement: '#EEF1FF', backgroundSelected: '#DEE6FF', textSecondary: '#565B70' },
    dark: { text: '#F4F6FF', background: '#0F1020', backgroundElement: '#1B1D33', backgroundSelected: '#282B47', textSecondary: '#B4B9CC' },
  },
  palette: {
    accent: '#2B6BFF', accentSoft: '#8FB4FF', link: '#1D5AF0',
    selectionSoft: '#E4ECFF', selectionTint: '#CBDBFF',
    surface: '#FFFFFF', panel: '#EEF1FF', panelAlt: '#F3F5FF',
    controlBorder: '#D5DEF8', handle: '#C3CEF0', hairline: '#E8ECFA', hairlineStrong: '#D9DFF4',
    ink: '#141726', ink2: '#1E2233', ink3: '#2C3040', ink4: '#3A3E4E',
    muted: '#565B70', muted2: '#7A8098', muted3: '#969CB2', muted4: '#B4B9CC',
    danger: '#F4364C', dangerAlt: '#D61F38', dangerBg: '#FFE3E7', success: '#12B76A',
    chrome: '#191A2B', chromeDeep: '#141527', chromeDeepest: '#0F1020', toast: '#20223A',
  },
  paletteDark: {
    link: '#8FB4FF',
    selectionSoft: 'rgba(43,107,255,0.18)', selectionTint: 'rgba(43,107,255,0.34)',
    surface: '#1B1D33', panel: '#232647', panelAlt: '#181A30',
    controlBorder: '#3A3E63', handle: '#484D75', hairline: '#282B47', hairlineStrong: '#363A5C',
    ink: '#F4F6FF', ink2: '#E4E8FA', ink3: '#C4C9E4', ink4: '#A6ACCB',
    muted: '#B4B9CC', muted2: '#9298B3', muted3: '#787E9B', muted4: '#606685',
    dangerBg: 'rgba(244,54,76,0.18)',
  },
  surface: {
    mat: '#FFFFFF', pocketFill: 'rgba(43,107,255,0.05)', pocketBorder: 'rgba(43,107,255,0.18)',
    pocketInnerShadow: 'rgba(20,40,90,0.06)', cardFrame: '#ffffff', cardFrameBorder: 'rgba(30,40,80,0.12)',
    insertBorder: 'rgba(0,0,20,0.05)', selection: '#2B6BFF',
  },
  radius: { sm: 6, thumb: 8, control: 12, panel: 16, actionBar: 18, lg: 20, sheet: 24 },
  slotBacking: '#EEF1FF',
});

// ── Dark Vault (dark-first: both schemes render dark) ────────────────────────
const VAULT_DARK: ColorRoles = {
  text: '#F2F3F7', background: '#0E0F14', backgroundElement: '#1A1B22', backgroundSelected: '#262832', textSecondary: '#9A9CA8',
};
const VAULT = make({
  colors: { light: VAULT_DARK, dark: VAULT_DARK },
  palette: {
    accent: '#5B9DFF', accentText: '#0C1220', accentSoft: '#7FB3FF', link: '#7FB3FF',
    selectionSoft: 'rgba(91,157,255,0.16)', selectionTint: 'rgba(91,157,255,0.28)',
    white: '#F2F3F7', surface: '#1A1B22', panel: '#23242D', panelAlt: '#1E1F27',
    controlBorder: '#33343E', handle: '#3A3B45', hairline: '#2A2B33', hairlineStrong: '#33343E',
    ink: '#F2F3F7', ink2: '#E4E5EC', ink3: '#CBCDD6', ink4: '#B4B6C1',
    muted: '#9A9CA8', muted2: '#7E808C', muted3: '#6C6E7A', muted4: '#5A5C68',
    danger: '#FF6B6B', dangerAlt: '#FF8A8A', dangerBg: 'rgba(255,107,107,0.14)', success: '#3DD68C',
    chrome: '#0E0E13', chromeDeep: '#0A0A0F', chromeDeepest: '#070709', toast: '#2A2B36',
  },
  surface: {
    mat: '#181920', pocketFill: 'rgba(255,255,255,0.03)', pocketBorder: 'rgba(255,255,255,0.10)',
    pocketInnerShadow: 'rgba(0,0,0,0.30)', cardFrame: '#22232C', cardFrameBorder: 'rgba(255,255,255,0.10)',
    foilSheen: 'rgba(255,255,255,0.10)', insertHighlight: 'rgba(255,255,255,0.10)', insertBorder: 'rgba(0,0,0,0.30)',
    selection: '#5B9DFF',
  },
  slotBacking: '#20222C',
});

export const VARIANTS = {
  neutral: NEUTRAL,
  vintage: VINTAGE,
  pop: POP,
  vault: VAULT,
} as const;

export type VariantId = keyof typeof VARIANTS;

export const VARIANT_LIST: { id: VariantId; label: string; desc: string }[] = [
  { id: 'neutral', label: 'Gallery Neutral', desc: 'Clean & bright' },
  { id: 'vintage', label: 'Warm Vintage', desc: 'Cream & kraft' },
  { id: 'pop', label: 'Poké-Pop', desc: 'Vivid & rounded' },
  { id: 'vault', label: 'Dark Vault', desc: 'Dark & premium' },
];

const STORAGE_KEY = 'michi-variant';

function isId(v: string | null | undefined): v is VariantId {
  return !!v && v in VARIANTS;
}

/** Resolve the active variant id — URL `?variant=` wins, then localStorage (web). */
export function activeVariantId(): VariantId {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      const q = new URLSearchParams(window.location.search).get('variant');
      if (isId(q)) return q;
      const s = window.localStorage?.getItem(STORAGE_KEY);
      if (isId(s)) return s;
    } catch {
      // ignore — fall through to default
    }
  }
  return 'neutral';
}

/** Persist + activate a variant (web dev switcher). Reloads so static styles re-eval. */
export function setVariant(id: VariantId) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      window.localStorage?.setItem(STORAGE_KEY, id);
      const url = new URL(window.location.href);
      url.searchParams.delete('variant');
      window.location.href = url.toString();
    } catch {
      // ignore
    }
  }
}

export const activeVariant: Tokens = VARIANTS[activeVariantId()];

/** Luminance check so palette darkness follows the variant's EFFECTIVE background. */
function isDarkHex(hex: string): boolean {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return false;
  let h = m[1];
  if (h.length === 3) h = h.replace(/./g, (c) => c + c);
  const n = parseInt(h, 16);
  return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255) < 128;
}

/** The OS scheme at module load (web + native). Falls back to light. */
function loadTimeScheme(): 'light' | 'dark' {
  try {
    return Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/**
 * The palette for the active variant under the scheme in effect at load. Darkness is
 * judged from the variant's resolved background — not the raw OS scheme — because a
 * variant may pin a scheme (Dark Vault renders dark under a light OS). Like every other
 * variant token this resolves once at module load; a mid-session OS scheme flip repaints
 * the scheme-reactive `Colors` roles but needs a reload for palette-styled chrome (the
 * pre-existing limitation documented in theme.ts).
 */
export const activePalette: PaletteRoles = (() => {
  const roles = activeVariant.colors[loadTimeScheme()];
  return isDarkHex(roles.background)
    ? { ...activeVariant.palette, ...activeVariant.paletteDark }
    : activeVariant.palette;
})();
