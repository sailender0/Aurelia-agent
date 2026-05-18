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
      activity_signals: {
        Row: {
          created_at: string
          duration_minutes: number | null
          id: string
          metadata: Json
          occurred_at: string
          project_hint: string | null
          signal_type: string
          source: string
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_minutes?: number | null
          id?: string
          metadata?: Json
          occurred_at: string
          project_hint?: string | null
          signal_type: string
          source: string
          user_id: string
        }
        Update: {
          created_at?: string
          duration_minutes?: number | null
          id?: string
          metadata?: Json
          occurred_at?: string
          project_hint?: string | null
          signal_type?: string
          source?: string
          user_id?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      attendance_events: {
        Row: {
          event_type: string
          id: string
          metadata: Json
          occurred_at: string
          session_id: string | null
          source: string
          user_id: string
        }
        Insert: {
          event_type: string
          id?: string
          metadata?: Json
          occurred_at?: string
          session_id?: string | null
          source?: string
          user_id: string
        }
        Update: {
          event_type?: string
          id?: string
          metadata?: Json
          occurred_at?: string
          session_id?: string | null
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "attendance_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_sessions: {
        Row: {
          check_in_time: string
          check_out_time: string | null
          created_at: string
          id: string
          status: string
          updated_at: string
          user_id: string
          work_date: string
        }
        Insert: {
          check_in_time: string
          check_out_time?: string | null
          created_at?: string
          id?: string
          status?: string
          updated_at?: string
          user_id: string
          work_date: string
        }
        Update: {
          check_in_time?: string
          check_out_time?: string | null
          created_at?: string
          id?: string
          status?: string
          updated_at?: string
          user_id?: string
          work_date?: string
        }
        Relationships: []
      }
      clients: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      draft_timesheets: {
        Row: {
          ai_confidence: number | null
          ai_summary: string | null
          created_at: string
          id: string
          status: string
          submitted_at: string | null
          updated_at: string
          user_id: string
          week_start: string
        }
        Insert: {
          ai_confidence?: number | null
          ai_summary?: string | null
          created_at?: string
          id?: string
          status?: string
          submitted_at?: string | null
          updated_at?: string
          user_id: string
          week_start: string
        }
        Update: {
          ai_confidence?: number | null
          ai_summary?: string | null
          created_at?: string
          id?: string
          status?: string
          submitted_at?: string | null
          updated_at?: string
          user_id?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "draft_timesheets_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      holiday_calendars: {
        Row: {
          country_code: string | null
          created_at: string
          id: string
          name: string
        }
        Insert: {
          country_code?: string | null
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          country_code?: string | null
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      holidays: {
        Row: {
          calendar_id: string
          created_at: string
          holiday_date: string
          id: string
          is_full_day: boolean
          name: string
        }
        Insert: {
          calendar_id: string
          created_at?: string
          holiday_date: string
          id?: string
          is_full_day?: boolean
          name: string
        }
        Update: {
          calendar_id?: string
          created_at?: string
          holiday_date?: string
          id?: string
          is_full_day?: boolean
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "holidays_calendar_id_fkey"
            columns: ["calendar_id"]
            isOneToOne: false
            referencedRelation: "holiday_calendars"
            referencedColumns: ["id"]
          },
        ]
      }
      idempotency_keys: {
        Row: {
          created_at: string
          key: string
        }
        Insert: {
          created_at?: string
          key: string
        }
        Update: {
          created_at?: string
          key?: string
        }
        Relationships: []
      }
      identity_mappings: {
        Row: {
          external_id: string
          id: string
          source: string
          user_id: string
        }
        Insert: {
          external_id: string
          id?: string
          source: string
          user_id: string
        }
        Update: {
          external_id?: string
          id?: string
          source?: string
          user_id?: string
        }
        Relationships: []
      }
      outbox_events: {
        Row: {
          attempts: number
          created_at: string
          event_type: string
          id: string
          last_error: string | null
          payload: Json
          processed_at: string | null
          status: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          event_type: string
          id?: string
          last_error?: string | null
          payload?: Json
          processed_at?: string | null
          status?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          event_type?: string
          id?: string
          last_error?: string | null
          payload?: Json
          processed_at?: string | null
          status?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          calendar_id: string | null
          created_at: string
          display_name: string
          email: string
          employment_type: string
          id: string
          manager_id: string | null
          timezone_preference: string
          work_hours_id: string | null
        }
        Insert: {
          calendar_id?: string | null
          created_at?: string
          display_name: string
          email: string
          employment_type?: string
          id: string
          manager_id?: string | null
          timezone_preference?: string
          work_hours_id?: string | null
        }
        Update: {
          calendar_id?: string | null
          created_at?: string
          display_name?: string
          email?: string
          employment_type?: string
          id?: string
          manager_id?: string | null
          timezone_preference?: string
          work_hours_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_calendar_id_fkey"
            columns: ["calendar_id"]
            isOneToOne: false
            referencedRelation: "holiday_calendars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_work_hours_id_fkey"
            columns: ["work_hours_id"]
            isOneToOne: false
            referencedRelation: "user_work_hours"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          billable: boolean
          client_id: string
          code: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          billable?: boolean
          client_id: string
          code: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          billable?: boolean
          client_id?: string
          code?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      teams_connections: {
        Row: {
          channel_id: string
          created_at: string
          id: string
          installed_by: string | null
          service_url: string
          team_aad_id: string | null
          team_internal_id: string
          team_name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          channel_id: string
          created_at?: string
          id?: string
          installed_by?: string | null
          service_url: string
          team_aad_id?: string | null
          team_internal_id: string
          team_name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          channel_id?: string
          created_at?: string
          id?: string
          installed_by?: string | null
          service_url?: string
          team_aad_id?: string | null
          team_internal_id?: string
          team_name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      timesheet_approvals: {
        Row: {
          comment: string | null
          decided_at: string
          decision: string
          id: string
          manager_id: string
          timesheet_id: string
        }
        Insert: {
          comment?: string | null
          decided_at?: string
          decision: string
          id?: string
          manager_id: string
          timesheet_id: string
        }
        Update: {
          comment?: string | null
          decided_at?: string
          decision?: string
          id?: string
          manager_id?: string
          timesheet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "timesheet_approvals_timesheet_id_fkey"
            columns: ["timesheet_id"]
            isOneToOne: false
            referencedRelation: "draft_timesheets"
            referencedColumns: ["id"]
          },
        ]
      }
      timesheet_entries: {
        Row: {
          ai_confidence: number | null
          ai_rationale: string | null
          category: string
          created_at: string
          hours: number
          id: string
          project_id: string | null
          timesheet_id: string
        }
        Insert: {
          ai_confidence?: number | null
          ai_rationale?: string | null
          category?: string
          created_at?: string
          hours?: number
          id?: string
          project_id?: string | null
          timesheet_id: string
        }
        Update: {
          ai_confidence?: number | null
          ai_rationale?: string | null
          category?: string
          created_at?: string
          hours?: number
          id?: string
          project_id?: string | null
          timesheet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "timesheet_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timesheet_entries_timesheet_id_fkey"
            columns: ["timesheet_id"]
            isOneToOne: false
            referencedRelation: "draft_timesheets"
            referencedColumns: ["id"]
          },
        ]
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
      user_work_hours: {
        Row: {
          created_at: string
          end_time: string
          grace_window_minutes: number
          id: string
          name: string
          start_time: string
          working_days: number[]
        }
        Insert: {
          created_at?: string
          end_time?: string
          grace_window_minutes?: number
          id?: string
          name: string
          start_time?: string
          working_days?: number[]
        }
        Update: {
          created_at?: string
          end_time?: string
          grace_window_minutes?: number
          id?: string
          name?: string
          start_time?: string
          working_days?: number[]
        }
        Relationships: []
      }
      work_sessions: {
        Row: {
          check_in: string
          check_out: string | null
          created_at: string
          id: string
          notes: string | null
          user_id: string
        }
        Insert: {
          check_in?: string
          check_out?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          user_id: string
        }
        Update: {
          check_in?: string
          check_out?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_user_roles: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"][]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_manager_of: { Args: { _employee: string }; Returns: boolean }
      record_attendance_action: {
        Args: {
          p_action: string
          p_idempotency_key: string
          p_metadata?: Json
          p_occurred_at?: string
          p_source?: string
          p_work_date: string
        }
        Returns: Json
      }
    }
    Enums: {
      app_role: "employee" | "manager" | "hr" | "executive" | "admin"
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
      app_role: ["employee", "manager", "hr", "executive", "admin"],
    },
  },
} as const
