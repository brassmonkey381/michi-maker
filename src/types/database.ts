/**
 * Database types for the Supabase `public` schema of the tcgscan-michi-maker project.
 *
 * Generated from the live schema — regenerate after any migration so it never drifts:
 *   npx supabase gen types typescript --linked > src/types/database.ts
 * (or use the Supabase MCP `generate_typescript_types` tool). This project holds only the
 * app's user data; all card/catalog data comes from the separate tcgscan-data server.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      analytics_events: {
        Row: {
          app: string
          id: string
          name: string
          props: Json
          session_id: string | null
          ts: string
          user_id: string
        }
        Insert: {
          app: string
          id?: string
          name: string
          props?: Json
          session_id?: string | null
          ts?: string
          user_id?: string
        }
        Update: {
          app?: string
          id?: string
          name?: string
          props?: Json
          session_id?: string | null
          ts?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analytics_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "analytics_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_sessions: {
        Row: {
          app: string
          app_version: string | null
          device_id: string | null
          id: string
          is_guest: boolean
          landing_route: string | null
          last_seen_at: string
          platform: string | null
          started_at: string
          upgraded_at: string | null
          user_id: string
        }
        Insert: {
          app: string
          app_version?: string | null
          device_id?: string | null
          id?: string
          is_guest?: boolean
          landing_route?: string | null
          last_seen_at?: string
          platform?: string | null
          started_at?: string
          upgraded_at?: string | null
          user_id?: string
        }
        Update: {
          app?: string
          app_version?: string | null
          device_id?: string | null
          id?: string
          is_guest?: boolean
          landing_route?: string | null
          last_seen_at?: string
          platform?: string | null
          started_at?: string
          upgraded_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      binder_likes: {
        Row: {
          binder_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          binder_id: string
          created_at?: string
          user_id?: string
        }
        Update: {
          binder_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "binder_likes_binder_id_fkey"
            columns: ["binder_id"]
            isOneToOne: false
            referencedRelation: "binders"
            referencedColumns: ["id"]
          },
        ]
      }
      binder_reshares: {
        Row: {
          binder_id: string
          copied_by: string
          created_at: string
          id: string
          source_binder_id: string | null
          source_is_example: boolean
          source_title: string | null
        }
        Insert: {
          binder_id: string
          copied_by?: string
          created_at?: string
          id?: string
          source_binder_id?: string | null
          source_is_example?: boolean
          source_title?: string | null
        }
        Update: {
          binder_id?: string
          copied_by?: string
          created_at?: string
          id?: string
          source_binder_id?: string | null
          source_is_example?: boolean
          source_title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "binder_reshares_binder_id_fkey"
            columns: ["binder_id"]
            isOneToOne: false
            referencedRelation: "binders"
            referencedColumns: ["id"]
          },
        ]
      }
      binder_pages: {
        Row: {
          background_color: string | null
          binder_id: string
          cols: number
          created_at: string
          id: string
          is_public: boolean
          notes: string | null
          position: number
          rows: number
          title: string | null
          updated_at: string
        }
        Insert: {
          background_color?: string | null
          binder_id: string
          cols?: number
          created_at?: string
          id?: string
          is_public?: boolean
          notes?: string | null
          position?: number
          rows?: number
          title?: string | null
          updated_at?: string
        }
        Update: {
          background_color?: string | null
          binder_id?: string
          cols?: number
          created_at?: string
          id?: string
          is_public?: boolean
          notes?: string | null
          position?: number
          rows?: number
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "binder_pages_binder_id_fkey"
            columns: ["binder_id"]
            isOneToOne: false
            referencedRelation: "binders"
            referencedColumns: ["id"]
          },
        ]
      }
      binder_pdf_snapshots: {
        Row: {
          binder_id: string
          binder_json: Json | null
          fingerprint: string
          pdf_path: string | null
          sheets: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          binder_id: string
          binder_json?: Json | null
          fingerprint: string
          pdf_path?: string | null
          sheets?: number | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          binder_id?: string
          binder_json?: Json | null
          fingerprint?: string
          pdf_path?: string | null
          sheets?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      binder_slots: {
        Row: {
          card_id: string | null
          col_index: number
          col_span: number
          created_at: string
          from_collection: boolean | null
          id: string
          image_crop: Json | null
          image_fit: string | null
          image_attribution: Json | null
          image_transform: Json | null
          image_url: string | null
          insert_image_url: string | null
          notes: string | null
          orientation: Database["public"]["Enums"]["card_orientation"]
          page_id: string
          row_index: number
          row_span: number
          slot_type: Database["public"]["Enums"]["binder_slot_type"]
          source_entry_id: string | null
          updated_at: string
        }
        Insert: {
          card_id?: string | null
          col_index: number
          col_span?: number
          created_at?: string
          from_collection?: boolean | null
          id?: string
          image_crop?: Json | null
          image_fit?: string | null
          image_attribution?: Json | null
          image_transform?: Json | null
          image_url?: string | null
          insert_image_url?: string | null
          notes?: string | null
          orientation?: Database["public"]["Enums"]["card_orientation"]
          page_id: string
          row_index: number
          row_span?: number
          slot_type?: Database["public"]["Enums"]["binder_slot_type"]
          source_entry_id?: string | null
          updated_at?: string
        }
        Update: {
          card_id?: string | null
          col_index?: number
          col_span?: number
          created_at?: string
          from_collection?: boolean | null
          id?: string
          image_crop?: Json | null
          image_fit?: string | null
          image_attribution?: Json | null
          image_transform?: Json | null
          image_url?: string | null
          insert_image_url?: string | null
          notes?: string | null
          orientation?: Database["public"]["Enums"]["card_orientation"]
          page_id?: string
          row_index?: number
          row_span?: number
          slot_type?: Database["public"]["Enums"]["binder_slot_type"]
          source_entry_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "binder_slots_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "binder_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      content_reports: {
        Row: {
          binder_id: string | null
          created_at: string
          details: string | null
          id: string
          notified_at: string | null
          profile_id: string | null
          reason: string
          reporter_id: string | null
          status: string
          subject_owner_id: string | null
        }
        Insert: {
          binder_id?: string | null
          created_at?: string
          details?: string | null
          id?: string
          notified_at?: string | null
          profile_id?: string | null
          reason: string
          reporter_id?: string | null
          status?: string
          subject_owner_id?: string | null
        }
        Update: {
          binder_id?: string | null
          created_at?: string
          details?: string | null
          id?: string
          notified_at?: string | null
          profile_id?: string | null
          reason?: string
          reporter_id?: string | null
          status?: string
          subject_owner_id?: string | null
        }
        Relationships: []
      }
      community_stats: {
        Row: {
          artwork_placed: number
          binders_built: number
          cards_placed: number
          collectors: number
          computed_at: string
          id: boolean
          pages_built: number
        }
        Insert: {
          artwork_placed?: number
          binders_built?: number
          cards_placed?: number
          collectors?: number
          computed_at?: string
          id?: boolean
          pages_built?: number
        }
        Update: {
          artwork_placed?: number
          binders_built?: number
          cards_placed?: number
          collectors?: number
          computed_at?: string
          id?: boolean
          pages_built?: number
        }
        Relationships: []
      }
      contest_entries: {
        Row: {
          binder_id: string
          category: string
          contest: string
          created_at: string
          owner_id: string
        }
        Insert: {
          binder_id: string
          category: string
          contest?: string
          created_at?: string
          owner_id: string
        }
        Update: {
          binder_id?: string
          category?: string
          contest?: string
          created_at?: string
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contest_entries_binder_id_fkey"
            columns: ["binder_id"]
            isOneToOne: true
            referencedRelation: "binders"
            referencedColumns: ["id"]
          },
        ]
      }
      contest_winners: {
        Row: {
          binder_id: string
          category: string
          contest: string
          created_at: string
          id: string
          owner_id: string
          place: number
        }
        Insert: {
          binder_id: string
          category: string
          contest: string
          created_at?: string
          id?: string
          owner_id: string
          place: number
        }
        Update: {
          binder_id?: string
          category?: string
          contest?: string
          created_at?: string
          id?: string
          owner_id?: string
          place?: number
        }
        Relationships: [
          {
            foreignKeyName: "contest_winners_binder_id_fkey"
            columns: ["binder_id"]
            isOneToOne: false
            referencedRelation: "binders"
            referencedColumns: ["id"]
          },
        ]
      }
      binders: {
        Row: {
          cover_card_id: string | null
          created_at: string
          description: string | null
          id: string
          is_demo: boolean
          is_public: boolean
          layout_style: Database["public"]["Enums"]["michi_layout_style"]
          owner_id: string
          removed_at: string | null
          share_page_ids: string[] | null
          share_key: string | null
          title: string
          updated_at: string
        }
        Insert: {
          cover_card_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_demo?: boolean
          is_public?: boolean
          layout_style?: Database["public"]["Enums"]["michi_layout_style"]
          owner_id?: string
          removed_at?: string | null
          share_page_ids?: string[] | null
          share_key?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          cover_card_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_demo?: boolean
          is_public?: boolean
          layout_style?: Database["public"]["Enums"]["michi_layout_style"]
          owner_id?: string
          removed_at?: string | null
          share_page_ids?: string[] | null
          share_key?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      collections: {
        Row: {
          archived_at: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id: string
          is_active?: boolean
          name: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      entitlements: {
        Row: {
          expires_at: string | null
          granted_at: string
          interval: string | null
          period_start: string | null
          product: string
          source: string
          term_print_allocation: number | null
          user_id: string
        }
        Insert: {
          expires_at?: string | null
          granted_at?: string
          interval?: string | null
          period_start?: string | null
          product: string
          source?: string
          term_print_allocation?: number | null
          user_id: string
        }
        Update: {
          expires_at?: string | null
          granted_at?: string
          interval?: string | null
          period_start?: string | null
          product?: string
          source?: string
          term_print_allocation?: number | null
          user_id?: string
        }
        Relationships: []
      }
      print_events: {
        Row: {
          binder_id: string | null
          created_at: string
          id: string
          sheets: number | null
          user_id: string
        }
        Insert: {
          binder_id?: string | null
          created_at?: string
          id?: string
          sheets?: number | null
          user_id?: string
        }
        Update: {
          binder_id?: string | null
          created_at?: string
          id?: string
          sheets?: number | null
          user_id?: string
        }
        Relationships: []
      }
      print_pool_unlocks: {
        Row: {
          period_start: string
          unlocked_at: string
          user_id: string
        }
        Insert: {
          period_start: string
          unlocked_at?: string
          user_id?: string
        }
        Update: {
          period_start?: string
          unlocked_at?: string
          user_id?: string
        }
        Relationships: []
      }
      portfolio_entries: {
        Row: {
          added_at: string
          card_id: string
          collection_id: string
          condition: string
          id: string
          purchase_date: string | null
          purchase_price: number | null
          quantity: number
          scan_path: string | null
          scanned_at: string | null
          storage_cols: number | null
          storage_id: string | null
          storage_page: number | null
          storage_pos: number | null
          storage_rows: number | null
          updated_at: string
          user_id: string
          variant: string
        }
        Insert: {
          added_at?: string
          card_id: string
          collection_id: string
          condition: string
          id: string
          purchase_date?: string | null
          purchase_price?: number | null
          quantity?: number
          scan_path?: string | null
          scanned_at?: string | null
          storage_cols?: number | null
          storage_id?: string | null
          storage_page?: number | null
          storage_pos?: number | null
          storage_rows?: number | null
          updated_at?: string
          user_id?: string
          variant: string
        }
        Update: {
          added_at?: string
          card_id?: string
          collection_id?: string
          condition?: string
          id?: string
          purchase_date?: string | null
          purchase_price?: number | null
          quantity?: number
          scan_path?: string | null
          scanned_at?: string | null
          storage_cols?: number | null
          storage_id?: string | null
          storage_page?: number | null
          storage_pos?: number | null
          storage_rows?: number | null
          updated_at?: string
          user_id?: string
          variant?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_entries_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_upvotes: {
        Row: {
          created_at: string
          profile_id: string
          voter_id: string
        }
        Insert: {
          created_at?: string
          profile_id: string
          voter_id?: string
        }
        Update: {
          created_at?: string
          profile_id?: string
          voter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_upvotes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_consented_at: string | null
          avatar_prompt_at: string | null
          pro_trial_offer_due: boolean
          pro_trial_prompt_at: string | null
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string | null
          id: string
          is_admin: boolean
          is_public: boolean
          marketing_consent: boolean
          marketing_consent_at: string | null
          marketing_consent_source: string | null
          marketing_unsubscribed_at: string | null
          preferences: Json
          rights_attested_at: string | null
          rights_prompt_at: string | null
          updated_at: string
          username: string | null
        }
        Insert: {
          avatar_consented_at?: string | null
          avatar_prompt_at?: string | null
          pro_trial_offer_due?: boolean
          pro_trial_prompt_at?: string | null
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          is_admin?: boolean
          is_public?: boolean
          marketing_consent?: boolean
          marketing_consent_at?: string | null
          marketing_consent_source?: string | null
          marketing_unsubscribed_at?: string | null
          preferences?: Json
          rights_attested_at?: string | null
          rights_prompt_at?: string | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          avatar_consented_at?: string | null
          avatar_prompt_at?: string | null
          pro_trial_offer_due?: boolean
          pro_trial_prompt_at?: string | null
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          is_admin?: boolean
          is_public?: boolean
          marketing_consent?: boolean
          marketing_consent_at?: string | null
          marketing_consent_source?: string | null
          marketing_unsubscribed_at?: string | null
          preferences?: Json
          rights_attested_at?: string | null
          rights_prompt_at?: string | null
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      saved_slices: {
        Row: {
          created_at: string
          crop: Json | null
          cs: number
          deleted_at: string | null
          fit: string
          group_id: string | null
          id: string
          image_url: string
          attribution: Json | null
          label: string | null
          owner_id: string
          rs: number
          transform: Json | null
        }
        Insert: {
          created_at?: string
          crop?: Json | null
          cs?: number
          deleted_at?: string | null
          fit?: string
          group_id?: string | null
          id?: string
          image_url: string
          attribution?: Json | null
          label?: string | null
          owner_id?: string
          rs?: number
          transform?: Json | null
        }
        Update: {
          created_at?: string
          crop?: Json | null
          cs?: number
          deleted_at?: string | null
          fit?: string
          group_id?: string | null
          id?: string
          image_url?: string
          attribution?: Json | null
          label?: string | null
          owner_id?: string
          rs?: number
          transform?: Json | null
        }
        Relationships: []
      }
      storage_units: {
        Row: {
          collection_id: string
          created_at: string
          grid_cols: number | null
          grid_rows: number | null
          id: string
          insertion_order: string
          kind: string
          name: string
          page_count: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          collection_id: string
          created_at?: string
          grid_cols?: number | null
          grid_rows?: number | null
          id: string
          insertion_order?: string
          kind: string
          name: string
          page_count?: number | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          collection_id?: string
          created_at?: string
          grid_cols?: number | null
          grid_rows?: number | null
          id?: string
          insertion_order?: string
          kind?: string
          name?: string
          page_count?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "storage_units_user_id_collection_id_fkey"
            columns: ["user_id", "collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      user_cards: {
        Row: {
          acquired_at: string | null
          card_id: string
          condition: string
          created_at: string
          owner_id: string
          quantity: number
          source: string
          updated_at: string
        }
        Insert: {
          acquired_at?: string | null
          card_id: string
          condition?: string
          created_at?: string
          owner_id: string
          quantity?: number
          source?: string
          updated_at?: string
        }
        Update: {
          acquired_at?: string | null
          card_id?: string
          condition?: string
          created_at?: string
          owner_id?: string
          quantity?: number
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_remove_binder: {
        Args: { p_binder_id: string }
        Returns: undefined
      }
      admin_clear_profile: {
        Args: { p_profile_id: string }
        Returns: undefined
      }
      admin_restore_binder: {
        Args: { p_binder_id: string }
        Returns: undefined
      }
      admin_copyright_strikes: {
        Args: Record<PropertyKey, never>
        Returns: {
          owner_id: string
          username: string | null
          strikes: number
          last_at: string
        }[]
      }
      admin_recent_users: {
        Args: { p_app?: string | null; p_limit?: number }
        Returns: {
          user_id: string
          username: string | null
          display_name: string | null
          event_count: number
          session_count: number
          first_seen: string
          last_seen: string
        }[]
      }
      admin_user_journey: {
        Args: { target_user: string; p_app?: string | null }
        Returns: {
          app: string
          id: string
          name: string
          props: Json
          session_id: string | null
          ts: string
          user_id: string
        }[]
      }
      admin_event_funnel: {
        Args: { p_app?: string | null }
        Returns: { name: string; event_count: number; user_count: number }[]
      }
      admin_community_growth: {
        Args: { p_days?: number }
        Returns: {
          day: string
          collectors: number
          binders_built: number
          pages_built: number
          cards_placed: number
          artwork_placed: number
          is_backfilled: boolean
          new_collectors: number | null
          new_binders: number | null
          new_pages: number | null
          new_cards: number | null
          new_artwork: number | null
        }[]
      }
      is_admin: { Args: Record<string, never>; Returns: boolean }
      binder_like_count: { Args: { p_binder_id: string }; Returns: number }
      contest_leaderboard: {
        Args: { p_contest?: string; p_category?: string | null; p_limit?: number }
        Returns: {
          author_name: string
          binder_id: string
          category: string
          like_count: number
        }[]
      }
      contest_entry_feed: {
        Args: { p_contest: string; p_limit?: number }
        Returns: {
          author_name: string
          binder_id: string
          category: string
          entered_at: string
          like_count: number
        }[]
      }
      discover_binders: {
        Args: {
          p_sort?: string
          p_limit?: number
          p_contest?: string | null
          p_author?: string | null
          p_exclude_author?: string | null
        }
        Returns: {
          author_name: string
          binder_id: string
          like_count: number
          made_public_at: string
        }[]
      }
      featured_binders: {
        Args: { p_limit?: number }
        Returns: {
          author_name: string
          binder_id: string
          like_count: number
        }[]
      }
      normalize_username: { Args: { p: string }; Returns: string }
      profile_upvote_count: { Args: { p_profile_id: string }; Returns: number }
      username_available: { Args: { p_username: string }; Returns: Json }
      search_binders: {
        Args: { p_query?: string; p_limit?: number }
        Returns: {
          author_name: string
          binder_id: string
          like_count: number
        }[]
      }
      search_profiles: {
        Args: { p_query?: string; p_limit?: number; p_offset?: number }
        Returns: {
          id: string
          username: string
          avatar_url: string
          upvotes: number
          binder_votes: number
        }[]
      }
    }
    Enums: {
      binder_slot_type: "card" | "insert" | "artwork" | "empty"
      card_orientation: "portrait" | "landscape"
      michi_layout_style:
        | "anchor"
        | "single_pokemon"
        | "themed_story"
        | "artist"
        | "trainer"
        | "full_page_spread"
        | "color_theme"
        | "freeform"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      binder_slot_type: ["card", "insert", "artwork", "empty"],
      card_orientation: ["portrait", "landscape"],
      michi_layout_style: [
        "anchor",
        "single_pokemon",
        "themed_story",
        "artist",
        "trainer",
        "full_page_spread",
        "color_theme",
        "freeform",
      ],
    },
  },
} as const
