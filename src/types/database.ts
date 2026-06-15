/**
 * Database types for the Supabase `public` schema.
 *
 * This file is hand-written to match supabase/migrations, so the client is fully typed
 * out of the box. Once your project is linked you should regenerate it from the live
 * schema so it never drifts:
 *
 *   npx supabase gen types typescript --linked > src/types/database.ts
 *
 * See supabase/README.md.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      pokemon: {
        Row: {
          id: string;
          dex_number: number | null;
          name_en: string;
          name_ja: string | null;
          sprite_url: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          dex_number?: number | null;
          name_en: string;
          name_ja?: string | null;
          sprite_url?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          dex_number?: number | null;
          name_en?: string;
          name_ja?: string | null;
          sprite_url?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      illustrators: {
        Row: { id: string; name: string; created_at: string };
        Insert: { id: string; name: string; created_at?: string };
        Update: { id?: string; name?: string; created_at?: string };
        Relationships: [];
      };
      card_sets: {
        Row: {
          id: string;
          name: string;
          series: string | null;
          release_date: string | null;
          symbol_url: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          name: string;
          series?: string | null;
          release_date?: string | null;
          symbol_url?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          series?: string | null;
          release_date?: string | null;
          symbol_url?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      cards: {
        Row: {
          id: string;
          name: string;
          set_id: string | null;
          illustrator_id: string | null;
          pokemon_id: string | null;
          number: string | null;
          rarity: string | null;
          orientation: Database['public']['Enums']['card_orientation'];
          image_url: string | null;
          image_small_url: string | null;
          dominant_color: string | null;
          source_url: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          name: string;
          set_id?: string | null;
          illustrator_id?: string | null;
          pokemon_id?: string | null;
          number?: string | null;
          rarity?: string | null;
          orientation?: Database['public']['Enums']['card_orientation'];
          image_url?: string | null;
          image_small_url?: string | null;
          dominant_color?: string | null;
          source_url?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          set_id?: string | null;
          illustrator_id?: string | null;
          pokemon_id?: string | null;
          number?: string | null;
          rarity?: string | null;
          orientation?: Database['public']['Enums']['card_orientation'];
          image_url?: string | null;
          image_small_url?: string | null;
          dominant_color?: string | null;
          source_url?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          username: string | null;
          display_name: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          username?: string | null;
          display_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          username?: string | null;
          display_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      binders: {
        Row: {
          id: string;
          owner_id: string;
          title: string;
          description: string | null;
          layout_style: Database['public']['Enums']['michi_layout_style'];
          cover_card_id: string | null;
          is_public: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id?: string;
          title: string;
          description?: string | null;
          layout_style?: Database['public']['Enums']['michi_layout_style'];
          cover_card_id?: string | null;
          is_public?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          title?: string;
          description?: string | null;
          layout_style?: Database['public']['Enums']['michi_layout_style'];
          cover_card_id?: string | null;
          is_public?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      binder_pages: {
        Row: {
          id: string;
          binder_id: string;
          position: number;
          title: string | null;
          rows: number;
          cols: number;
          background_color: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          binder_id: string;
          position?: number;
          title?: string | null;
          rows?: number;
          cols?: number;
          background_color?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          binder_id?: string;
          position?: number;
          title?: string | null;
          rows?: number;
          cols?: number;
          background_color?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      binder_slots: {
        Row: {
          id: string;
          page_id: string;
          row_index: number;
          col_index: number;
          row_span: number;
          col_span: number;
          slot_type: Database['public']['Enums']['binder_slot_type'];
          card_id: string | null;
          insert_image_url: string | null;
          orientation: Database['public']['Enums']['card_orientation'];
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          page_id: string;
          row_index: number;
          col_index: number;
          row_span?: number;
          col_span?: number;
          slot_type?: Database['public']['Enums']['binder_slot_type'];
          card_id?: string | null;
          insert_image_url?: string | null;
          orientation?: Database['public']['Enums']['card_orientation'];
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          page_id?: string;
          row_index?: number;
          col_index?: number;
          row_span?: number;
          col_span?: number;
          slot_type?: Database['public']['Enums']['binder_slot_type'];
          card_id?: string | null;
          insert_image_url?: string | null;
          orientation?: Database['public']['Enums']['card_orientation'];
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      michi_layout_style:
        | 'anchor'
        | 'single_pokemon'
        | 'themed_story'
        | 'artist'
        | 'trainer'
        | 'full_page_spread'
        | 'color_theme'
        | 'freeform';
      binder_slot_type: 'card' | 'insert' | 'artwork' | 'empty';
      card_orientation: 'portrait' | 'landscape';
    };
    CompositeTypes: Record<string, never>;
  };
}
