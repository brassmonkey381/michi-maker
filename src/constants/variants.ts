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
import { Platform } from 'react-native';

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
      background: '#000000',
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

export type Tokens = typeof NEUTRAL;
type ColorSet = { light: ColorRoles; dark: ColorRoles };
type Deep = {
  colors?: { light?: Partial<ColorRoles>; dark?: Partial<ColorRoles> };
  palette?: Partial<Tokens['palette']>;
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

export const VARIANT_LIST: { id: VariantId; label: string }[] = [
  { id: 'neutral', label: 'Gallery Neutral' },
  { id: 'vintage', label: 'Warm Vintage' },
  { id: 'pop', label: 'Poké-Pop' },
  { id: 'vault', label: 'Dark Vault' },
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
