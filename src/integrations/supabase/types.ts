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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      captures: {
        Row: {
          accuracy_m: number | null
          client_capture_id: string
          confidence: number | null
          created_at: string
          distance_m: number | null
          id: string
          location_passed: boolean
          photo_passed: boolean
          reason: string | null
          retry_tip: string | null
          review_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          session_id: string
          status: string
          stop_id: string
          storage_path: string | null
        }
        Insert: {
          accuracy_m?: number | null
          client_capture_id: string
          confidence?: number | null
          created_at?: string
          distance_m?: number | null
          id?: string
          location_passed?: boolean
          photo_passed?: boolean
          reason?: string | null
          retry_tip?: string | null
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          session_id: string
          status: string
          stop_id: string
          storage_path?: string | null
        }
        Update: {
          accuracy_m?: number | null
          client_capture_id?: string
          confidence?: number | null
          created_at?: string
          distance_m?: number | null
          id?: string
          location_passed?: boolean
          photo_passed?: boolean
          reason?: string | null
          retry_tip?: string | null
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          session_id?: string
          status?: string
          stop_id?: string
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "captures_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "hunt_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "captures_stop_id_fkey"
            columns: ["stop_id"]
            isOneToOne: false
            referencedRelation: "stops"
            referencedColumns: ["id"]
          },
        ]
      }
      hunt_sessions: {
        Row: {
          attempt_times: string[]
          completed_at: string | null
          created_at: string
          current_step: number
          id: string
          token_hash: string
        }
        Insert: {
          attempt_times?: string[]
          completed_at?: string | null
          created_at?: string
          current_step?: number
          id?: string
          token_hash: string
        }
        Update: {
          attempt_times?: string[]
          completed_at?: string | null
          created_at?: string
          current_step?: number
          id?: string
          token_hash?: string
        }
        Relationships: []
      }
      reference_photos: {
        Row: {
          created_at: string
          created_by: string
          id: string
          stop_id: string
          storage_path: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          stop_id: string
          storage_path: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          stop_id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "reference_photos_stop_id_fkey"
            columns: ["stop_id"]
            isOneToOne: false
            referencedRelation: "stops"
            referencedColumns: ["id"]
          },
        ]
      }
      stops: {
        Row: {
          calibrated: boolean
          calibrated_at: string | null
          calibrated_by: string | null
          id: string
          landmark_description: string
          lat: number
          lng: number
          name: string
          provenance: string
          radius_m: number
          step: number
        }
        Insert: {
          calibrated?: boolean
          calibrated_at?: string | null
          calibrated_by?: string | null
          id: string
          landmark_description: string
          lat: number
          lng: number
          name: string
          provenance: string
          radius_m?: number
          step: number
        }
        Update: {
          calibrated?: boolean
          calibrated_at?: string | null
          calibrated_by?: string | null
          id?: string
          landmark_description?: string
          lat?: number
          lng?: number
          name?: string
          provenance?: string
          radius_m?: number
          step?: number
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_capture: { Args: { p_capture: string }; Returns: boolean }
      claim_first_organizer: { Args: never; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "organizer"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["organizer"],
    },
  },
} as const
