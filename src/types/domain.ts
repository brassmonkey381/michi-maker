/**
 * App-facing domain types and metadata.
 *
 * Entity shapes are derived from the generated database types so they never drift from
 * the schema. UI metadata (labels, descriptions) for the Michi layout styles lives here
 * because it is presentation, not persistence.
 */

import type { Database } from '@/types/database';

type PublicSchema = Database['public'];

// Enums
export type MichiLayoutStyle = PublicSchema['Enums']['michi_layout_style'];
export type BinderSlotType = PublicSchema['Enums']['binder_slot_type'];
export type CardOrientation = PublicSchema['Enums']['card_orientation'];

// Reference data (pokemon, illustrators, sets, cards) lives in the shared tcgscan-data
// server and is consumed over HTTP — see src/lib/catalog.ts and docs/DATA-SERVER.md. It is
// intentionally NOT part of this project's schema, so there are no entity types for it here.

// User data
export type Profile = PublicSchema['Tables']['profiles']['Row'];
export type Binder = PublicSchema['Tables']['binders']['Row'];
export type BinderPage = PublicSchema['Tables']['binder_pages']['Row'];
export type BinderSlot = PublicSchema['Tables']['binder_slots']['Row'];

/** A page with its placed slots — the unit the binder editor renders. */
export interface BinderPageWithSlots extends BinderPage {
  slots: BinderSlot[];
}

/** A full binder with its ordered pages — convenient for the binder view. */
export interface BinderWithPages extends Binder {
  pages: BinderPageWithSlots[];
}

export interface MichiLayoutStyleMeta {
  value: MichiLayoutStyle;
  label: string;
  description: string;
}

/**
 * The named "Michi Method" page layouts, for pickers and onboarding.
 * Source: https://woahpoke.com/michi-method/
 */
export const MICHI_LAYOUT_STYLES = [
  {
    value: 'anchor',
    label: 'Anchor',
    description: 'One or two hero cards surrounded by complementary cards.',
  },
  {
    value: 'single_pokemon',
    label: 'Single Pokémon',
    description: 'One species shown across many different art styles.',
  },
  {
    value: 'themed_story',
    label: 'Themed / Story',
    description: 'A narrative spread, like an Eevee evolution progression.',
  },
  {
    value: 'artist',
    label: 'Artist',
    description: "A page celebrating a single illustrator's work.",
  },
  {
    value: 'trainer',
    label: 'Trainer',
    description: 'Built around a specific trainer character.',
  },
  {
    value: 'full_page_spread',
    label: 'Full-page spread',
    description: 'Large artwork spanning the page, with cards as accents.',
  },
  {
    value: 'color_theme',
    label: 'Colour theme',
    description: 'A unified colour palette for cohesive visual impact.',
  },
  {
    value: 'freeform',
    label: 'Freeform',
    description: 'No fixed style. Arrange the canvas however you like.',
  },
] as const satisfies readonly MichiLayoutStyleMeta[];
