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
      binder_pages: {
        Row: {
          background_color: string | null
          binder_id: string
          cols: number
          created_at: string
          id: string
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
      binder_slots: {
        Row: {
          card_id: string | null
          col_index: number
          col_span: number
          created_at: string
          id: string
          image_crop: Json | null
          image_fit: string | null
          image_url: string | null
          insert_image_url: string | null
          notes: string | null
          orientation: Database["public"]["Enums"]["card_orientation"]
          page_id: string
          row_index: number
          row_span: number
          slot_type: Database["public"]["Enums"]["binder_slot_type"]
          updated_at: string
        }
        Insert: {
          card_id?: string | null
          col_index: number
          col_span?: number
          created_at?: string
          id?: string
          image_crop?: Json | null
          image_fit?: string | null
          image_url?: string | null
          insert_image_url?: string | null
          notes?: string | null
          orientation?: Database["public"]["Enums"]["card_orientation"]
          page_id: string
          row_index: number
          row_span?: number
          slot_type?: Database["public"]["Enums"]["binder_slot_type"]
          updated_at?: string
        }
        Update: {
          card_id?: string | null
          col_index?: number
          col_span?: number
          created_at?: string
          id?: string
          image_crop?: Json | null
          image_fit?: string | null
          image_url?: string | null
          insert_image_url?: string | null
          notes?: string | null
          orientation?: Database["public"]["Enums"]["card_orientation"]
          page_id?: string
          row_index?: number
          row_span?: number
          slot_type?: Database["public"]["Enums"]["binder_slot_type"]
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
      binders: {
        Row: {
          cover_card_id: string | null
          created_at: string
          description: string | null
          id: string
          is_public: boolean
          layout_style: Database["public"]["Enums"]["michi_layout_style"]
          owner_id: string
          title: string
          updated_at: string
        }
        Insert: {
          cover_card_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_public?: boolean
          layout_style?: Database["public"]["Enums"]["michi_layout_style"]
          owner_id?: string
          title: string
          updated_at?: string
        }
        Update: {
          cover_card_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_public?: boolean
          layout_style?: Database["public"]["Enums"]["michi_layout_style"]
          owner_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
