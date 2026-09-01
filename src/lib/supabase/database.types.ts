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
      acquisition_source: {
        Row: {
          created_at: string
          id: string
          landing_page: string | null
          referrer: string | null
          user_id: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          landing_page?: string | null
          referrer?: string | null
          user_id: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          landing_page?: string | null
          referrer?: string | null
          user_id?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "acquisition_source_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      bug_reports: {
        Row: {
          context: Json | null
          created_at: string
          description: string
          id: string
          resolved: boolean
          resolved_at: string | null
          screenshot_url: string | null
          severity: Database["public"]["Enums"]["bug_severity"]
          steps: string | null
          title: string
          user_id: string | null
        }
        Insert: {
          context?: Json | null
          created_at?: string
          description: string
          id?: string
          resolved?: boolean
          resolved_at?: string | null
          screenshot_url?: string | null
          severity?: Database["public"]["Enums"]["bug_severity"]
          steps?: string | null
          title: string
          user_id?: string | null
        }
        Update: {
          context?: Json | null
          created_at?: string
          description?: string
          id?: string
          resolved?: boolean
          resolved_at?: string | null
          screenshot_url?: string | null
          severity?: Database["public"]["Enums"]["bug_severity"]
          steps?: string | null
          title?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bug_reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      cancellation_reasons: {
        Row: {
          created_at: string
          feedback: string | null
          id: string
          reason: string
          user_id: string
        }
        Insert: {
          created_at?: string
          feedback?: string | null
          id?: string
          reason: string
          user_id: string
        }
        Update: {
          created_at?: string
          feedback?: string | null
          id?: string
          reason?: string
          user_id?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          advance_per_group: number | null
          best_extra_qualifiers: number
          created_at: string
          display_name: string
          division: Database["public"]["Enums"]["division"]
          fee_override: number | null
          format_type: Database["public"]["Enums"]["format_type"] | null
          gender: Database["public"]["Enums"]["category_gender"]
          id: string
          num_groups: number | null
          status: Database["public"]["Enums"]["category_status"]
          tournament_id: string
        }
        Insert: {
          advance_per_group?: number | null
          best_extra_qualifiers?: number
          created_at?: string
          display_name: string
          division: Database["public"]["Enums"]["division"]
          fee_override?: number | null
          format_type?: Database["public"]["Enums"]["format_type"] | null
          gender: Database["public"]["Enums"]["category_gender"]
          id?: string
          num_groups?: number | null
          status?: Database["public"]["Enums"]["category_status"]
          tournament_id: string
        }
        Update: {
          advance_per_group?: number | null
          best_extra_qualifiers?: number
          created_at?: string
          display_name?: string
          division?: Database["public"]["Enums"]["division"]
          fee_override?: number | null
          format_type?: Database["public"]["Enums"]["format_type"] | null
          gender?: Database["public"]["Enums"]["category_gender"]
          id?: string
          num_groups?: number | null
          status?: Database["public"]["Enums"]["category_status"]
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      email_outbox: {
        Row: {
          attempts: number
          created_at: string
          id: string
          kind: string
          last_error: string | null
          pair_id: string | null
          payload: Json
          provider_message_id: string | null
          sent_at: string | null
          status: string
          to_email: string
          to_user_id: string | null
          tournament_id: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          id?: string
          kind: string
          last_error?: string | null
          pair_id?: string | null
          payload?: Json
          provider_message_id?: string | null
          sent_at?: string | null
          status?: string
          to_email: string
          to_user_id?: string | null
          tournament_id?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string
          id?: string
          kind?: string
          last_error?: string | null
          pair_id?: string | null
          payload?: Json
          provider_message_id?: string | null
          sent_at?: string | null
          status?: string
          to_email?: string
          to_user_id?: string | null
          tournament_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_outbox_pair_id_fkey"
            columns: ["pair_id"]
            isOneToOne: false
            referencedRelation: "bracket_pairs_public"
            referencedColumns: ["pair_id"]
          },
          {
            foreignKeyName: "email_outbox_pair_id_fkey"
            columns: ["pair_id"]
            isOneToOne: false
            referencedRelation: "my_pairs"
            referencedColumns: ["pair_id"]
          },
          {
            foreignKeyName: "email_outbox_pair_id_fkey"
            columns: ["pair_id"]
            isOneToOne: false
            referencedRelation: "organizer_pairs_admin"
            referencedColumns: ["pair_id"]
          },
          {
            foreignKeyName: "email_outbox_pair_id_fkey"
            columns: ["pair_id"]
            isOneToOne: false
            referencedRelation: "pairs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_outbox_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_outbox_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback: {
        Row: {
          context: Json | null
          created_at: string
          feedback_type: Database["public"]["Enums"]["feedback_type"]
          id: string
          message: string
          rating: number | null
          read: boolean
          user_id: string | null
        }
        Insert: {
          context?: Json | null
          created_at?: string
          feedback_type?: Database["public"]["Enums"]["feedback_type"]
          id?: string
          message: string
          rating?: number | null
          read?: boolean
          user_id?: string | null
        }
        Update: {
          context?: Json | null
          created_at?: string
          feedback_type?: Database["public"]["Enums"]["feedback_type"]
          id?: string
          message?: string
          rating?: number | null
          read?: boolean
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      group_standings: {
        Row: {
          clinch_status: Database["public"]["Enums"]["clinch_status"]
          games_lost: number
          games_won: number
          group_id: string
          id: string
          lost: number
          pair_id: string
          played: number
          points: number
          position: number
          sets_lost: number
          sets_won: number
          updated_at: string
          won: number
        }
        Insert: {
          clinch_status?: Database["public"]["Enums"]["clinch_status"]
          games_lost?: number
          games_won?: number
          group_id: string
          id?: string
          lost?: number
          pair_id: string
          played?: number
          points?: number
          position?: number
          sets_lost?: number
          sets_won?: number
          updated_at?: string
          won?: number
        }
        Update: {
          clinch_status?: Database["public"]["Enums"]["clinch_status"]
          games_lost?: number
          games_won?: number
          group_id?: string
          id?: string
          lost?: number
          pair_id?: string
          played?: number
          points?: number
          position?: number
          sets_lost?: number
          sets_won?: number
          updated_at?: string
          won?: number
        }
        Relationships: [
          {
            foreignKeyName: "group_standings_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_standings_pair_id_fkey"
            columns: ["pair_id"]
            isOneToOne: false
            referencedRelation: "bracket_pairs_public"
            referencedColumns: ["pair_id"]
          },
          {
            foreignKeyName: "group_standings_pair_id_fkey"
            columns: ["pair_id"]
            isOneToOne: false
            referencedRelation: "my_pairs"
            referencedColumns: ["pair_id"]
          },
          {
            foreignKeyName: "group_standings_pair_id_fkey"
            columns: ["pair_id"]
            isOneToOne: false
            referencedRelation: "organizer_pairs_admin"
            referencedColumns: ["pair_id"]
          },
          {
            foreignKeyName: "group_standings_pair_id_fkey"
            columns: ["pair_id"]
            isOneToOne: false
            referencedRelation: "pairs"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          category_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          category_id: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          category_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "groups_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      match_schedule: {
        Row: {
          category_id: string
          court_label: string
          created_at: string
          id: string
          scheduled_at: string
          slot_index: number
          stage: Database["public"]["Enums"]["match_stage"]
          tournament_id: string
        }
        Insert: {
          category_id: string
          court_label: string
          created_at?: string
          id?: string
          scheduled_at: string
          slot_index: number
          stage: Database["public"]["Enums"]["match_stage"]
          tournament_id: string
        }
        Update: {
          category_id?: string
          court_label?: string
          created_at?: string
          id?: string
          scheduled_at?: string
          slot_index?: number
          stage?: Database["public"]["Enums"]["match_stage"]
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_schedule_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_schedule_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      match_sets: {
        Row: {
          created_at: string
          games_a: number
          games_b: number
          id: string
          is_super_tiebreak: boolean
          match_id: string
          set_number: number
          tiebreak_a: number | null
          tiebreak_b: number | null
        }
        Insert: {
          created_at?: string
          games_a?: number
          games_b?: number
          id?: string
          is_super_tiebreak?: boolean
          match_id: string
          set_number: number
          tiebreak_a?: number | null
          tiebreak_b?: number | null
        }
        Update: {
          created_at?: string
          games_a?: number
          games_b?: number
          id?: string
          is_super_tiebreak?: boolean
          match_id?: string
          set_number?: number
          tiebreak_a?: number | null
          tiebreak_b?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "match_sets_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          category_id: string
          court_label: string | null
          created_at: string
          group_id: string | null
          id: string
          pair_a_id: string | null
          pair_b_id: string | null
          played_at: string | null
          round_label: string | null
          scheduled_at: string | null
          scheduled_at_original: string | null
          source_match_ids: string[] | null
          stage: Database["public"]["Enums"]["match_stage"]
          status: Database["public"]["Enums"]["match_status"]
          tournament_id: string
          winner_pair_id: string | null
        }
        Insert: {
          category_id: string
          court_label?: string | null
          created_at?: string
          group_id?: string | null
          id?: string
          pair_a_id?: string | null
          pair_b_id?: string | null
          played_at?: string | null
          round_label?: string | null
          scheduled_at?: string | null
          scheduled_at_original?: string | null
          source_match_ids?: string[] | null
          stage: Database["public"]["Enums"]["match_stage"]
          status?: Database["public"]["Enums"]["match_status"]
          tournament_id: string
          winner_pair_id?: string | null
        }
        Update: {
          category_id?: string
          court_label?: string | null
          created_at?: string
          group_id?: string | null
          id?: string
          pair_a_id?: string | null
          pair_b_id?: string | null
          played_at?: string | null
          round_label?: string | null
          scheduled_at?: string | null
          scheduled_at_original?: string | null
          source_match_ids?: string[] | null
          stage?: Database["public"]["Enums"]["match_stage"]
          status?: Database["public"]["Enums"]["match_status"]
          tournament_id?: string
          winner_pair_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_pair_a_id_fkey"
            columns: ["pair_a_id"]
            isOneToOne: false
            referencedRelation: "bracket_pairs_public"
            referencedColumns: ["pair_id"]
          },
          {
            foreignKeyName: "matches_pair_a_id_fkey"
            columns: ["pair_a_id"]
            isOneToOne: false
            referencedRelation: "my_pairs"
            referencedColumns: ["pair_id"]
          },
          {
            foreignKeyName: "matches_pair_a_id_fkey"
            columns: ["pair_a_id"]
            isOneToOne: false
            referencedRelation: "organizer_pairs_admin"
            referencedColumns: ["pair_id"]
          },
          {
            foreignKeyName: "matches_pair_a_id_fkey"
            columns: ["pair_a_id"]
            isOneToOne: false
            referencedRelation: "pairs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_pair_b_id_fkey"
            columns: ["pair_b_id"]
            isOneToOne: false
            referencedRelation: "bracket_pairs_public"
            referencedColumns: ["pair_id"]
          },
          {
            foreignKeyName: "matches_pair_b_id_fkey"
            columns: ["pair_b_id"]
            isOneToOne: false
            referencedRelation: "my_pairs"
            referencedColumns: ["pair_id"]
          },
          {
            foreignKeyName: "matches_pair_b_id_fkey"
            columns: ["pair_b_id"]
            isOneToOne: false
            referencedRelation: "organizer_pairs_admin"
            referencedColumns: ["pair_id"]
          },
          {
            foreignKeyName: "matches_pair_b_id_fkey"
            columns: ["pair_b_id"]
            isOneToOne: false
            referencedRelation: "pairs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_winner_pair_id_fkey"
            columns: ["winner_pair_id"]
            isOneToOne: false
            referencedRelation: "bracket_pairs_public"
            referencedColumns: ["pair_id"]
          },
          {
            foreignKeyName: "matches_winner_pair_id_fkey"
            columns: ["winner_pair_id"]
            isOneToOne: false
            referencedRelation: "my_pairs"
            referencedColumns: ["pair_id"]
          },
          {
            foreignKeyName: "matches_winner_pair_id_fkey"
            columns: ["winner_pair_id"]
            isOneToOne: false
            referencedRelation: "organizer_pairs_admin"
            referencedColumns: ["pair_id"]
          },
          {
            foreignKeyName: "matches_winner_pair_id_fkey"
            columns: ["winner_pair_id"]
            isOneToOne: false
            referencedRelation: "pairs"
            referencedColumns: ["id"]
          },
        ]
      }
      organizer_members: {
        Row: {
          created_at: string
          id: string
          member_role: Database["public"]["Enums"]["organizer_member_role"]
          organizer_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          member_role?: Database["public"]["Enums"]["organizer_member_role"]
          organizer_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          member_role?: Database["public"]["Enums"]["organizer_member_role"]
          organizer_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizer_members_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "organizers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizer_members_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "organizers_public"
            referencedColumns: ["id"]
          },
        ]
      }
      organizers: {
        Row: {
          active: boolean
          application_fee_percent: number
          connect_status: Database["public"]["Enums"]["connect_status"]
          contact_email: string
          created_at: string
          id: string
          name: string
          slug: string
          stripe_connect_account_id: string | null
        }
        Insert: {
          active?: boolean
          application_fee_percent?: number
          connect_status?: Database["public"]["Enums"]["connect_status"]
          contact_email: string
          created_at?: string
          id?: string
          name: string
          slug: string
          stripe_connect_account_id?: string | null
        }
        Update: {
          active?: boolean
          application_fee_percent?: number
          connect_status?: Database["public"]["Enums"]["connect_status"]
          contact_email?: string
          created_at?: string
          id?: string
          name?: string
          slug?: string
          stripe_connect_account_id?: string | null
        }
        Relationships: []
      }
      pair_block_choices: {
        Row: {
          bloque_id: string
          created_at: string
          forzado: boolean
          pair_id: string
          tournament_id: string
          updated_at: string
        }
        Insert: {
          bloque_id: string
          created_at?: string
          forzado?: boolean
          pair_id: string
          tournament_id: string
          updated_at?: string
        }
        Update: {
          bloque_id?: string
          created_at?: string
          forzado?: boolean
          pair_id?: string
          tournament_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pair_block_choices_pair_fkey"
            columns: ["pair_id", "tournament_id"]
            isOneToOne: false
            referencedRelation: "bracket_pairs_public"
            referencedColumns: ["pair_id", "tournament_id"]
          },
          {
            foreignKeyName: "pair_block_choices_pair_fkey"
            columns: ["pair_id", "tournament_id"]
            isOneToOne: false
            referencedRelation: "my_pairs"
            referencedColumns: ["pair_id", "tournament_id"]
          },
          {
            foreignKeyName: "pair_block_choices_pair_fkey"
            columns: ["pair_id", "tournament_id"]
            isOneToOne: false
            referencedRelation: "organizer_pairs_admin"
            referencedColumns: ["pair_id", "tournament_id"]
          },
          {
            foreignKeyName: "pair_block_choices_pair_fkey"
            columns: ["pair_id", "tournament_id"]
            isOneToOne: false
            referencedRelation: "pairs"
            referencedColumns: ["id", "tournament_id"]
          },
        ]
      }
      pairs: {
        Row: {
          category_id: string
          created_at: string
          group_id: string | null
          id: string
          payment_status: Database["public"]["Enums"]["payment_status"]
          player1_id: string
          player2_id: string
          schedule_preference: Database["public"]["Enums"]["schedule_preference"]
          seed: number | null
          tournament_id: string
          tournament_rank: number | null
        }
        Insert: {
          category_id: string
          created_at?: string
          group_id?: string | null
          id?: string
          payment_status?: Database["public"]["Enums"]["payment_status"]
          player1_id: string
          player2_id: string
          schedule_preference?: Database["public"]["Enums"]["schedule_preference"]
          seed?: number | null
          tournament_id: string
          tournament_rank?: number | null
        }
        Update: {
          category_id?: string
          created_at?: string
          group_id?: string | null
          id?: string
          payment_status?: Database["public"]["Enums"]["payment_status"]
          player1_id?: string
          player2_id?: string
          schedule_preference?: Database["public"]["Enums"]["schedule_preference"]
          seed?: number | null
          tournament_id?: string
          tournament_rank?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pairs_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pairs_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pairs_player1_id_fkey"
            columns: ["player1_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pairs_player2_id_fkey"
            columns: ["player2_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pairs_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      player_age_declarations: {
        Row: {
          created_at: string
          declared_by: string | null
          declared_by_email: string
          declared_minor: boolean
          id: string
          statement: string
          tournament_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          declared_by?: string | null
          declared_by_email: string
          declared_minor: boolean
          id?: string
          statement: string
          tournament_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          declared_by?: string | null
          declared_by_email?: string
          declared_minor?: boolean
          id?: string
          statement?: string
          tournament_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_age_declarations_declared_by_fkey"
            columns: ["declared_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_age_declarations_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_age_declarations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      player_ratings: {
        Row: {
          created_at: string
          division: Database["public"]["Enums"]["division"]
          id: string
          last_played_at: string | null
          player_id: string
          rating: number
          rd: number
          updated_at: string
          volatility: number
        }
        Insert: {
          created_at?: string
          division: Database["public"]["Enums"]["division"]
          id?: string
          last_played_at?: string | null
          player_id: string
          rating?: number
          rd?: number
          updated_at?: string
          volatility?: number
        }
        Update: {
          created_at?: string
          division?: Database["public"]["Enums"]["division"]
          id?: string
          last_played_at?: string | null
          player_id?: string
          rating?: number
          rd?: number
          updated_at?: string
          volatility?: number
        }
        Relationships: [
          {
            foreignKeyName: "player_ratings_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ranking_point_rules: {
        Row: {
          created_at: string
          drawsize_multipliers: Json
          group_win_points: number
          id: string
          qualify_bonus: number
          round_points: Json
          roundrobin_champion_bonus: number
          scope: Database["public"]["Enums"]["rule_scope"]
          tournament_id: string | null
        }
        Insert: {
          created_at?: string
          drawsize_multipliers?: Json
          group_win_points?: number
          id?: string
          qualify_bonus?: number
          round_points?: Json
          roundrobin_champion_bonus?: number
          scope?: Database["public"]["Enums"]["rule_scope"]
          tournament_id?: string | null
        }
        Update: {
          created_at?: string
          drawsize_multipliers?: Json
          group_win_points?: number
          id?: string
          qualify_bonus?: number
          round_points?: Json
          roundrobin_champion_bonus?: number
          scope?: Database["public"]["Enums"]["rule_scope"]
          tournament_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ranking_point_rules_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      ranking_points: {
        Row: {
          created_at: string
          division: Database["public"]["Enums"]["division"]
          id: string
          player_id: string
          points: number
          position: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          division: Database["public"]["Enums"]["division"]
          id?: string
          player_id: string
          points?: number
          position?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          division?: Database["public"]["Enums"]["division"]
          id?: string
          player_id?: string
          points?: number
          position?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ranking_points_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      rating_history: {
        Row: {
          created_at: string
          division: Database["public"]["Enums"]["division"]
          id: string
          match_id: string
          played_at: string
          player_id: string
          rating_after: number
          rating_before: number
          rd_after: number
          rd_before: number
          volatility_after: number
          volatility_before: number
        }
        Insert: {
          created_at?: string
          division: Database["public"]["Enums"]["division"]
          id?: string
          match_id: string
          played_at: string
          player_id: string
          rating_after: number
          rating_before: number
          rd_after: number
          rd_before: number
          volatility_after: number
          volatility_before: number
        }
        Update: {
          created_at?: string
          division?: Database["public"]["Enums"]["division"]
          id?: string
          match_id?: string
          played_at?: string
          player_id?: string
          rating_after?: number
          rating_before?: number
          rd_after?: number
          rd_before?: number
          volatility_after?: number
          volatility_before?: number
        }
        Relationships: [
          {
            foreignKeyName: "rating_history_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rating_history_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      registrations: {
        Row: {
          amount: number
          application_fee_amount: number | null
          cfdi_requested: boolean
          created_at: string
          id: string
          organizer_amount: number | null
          pair_id: string
          payment_status: Database["public"]["Enums"]["payment_status"]
          player_legal_name: string | null
          player_rfc: string | null
          stripe_payment_intent_id: string | null
          tournament_id: string
        }
        Insert: {
          amount?: number
          application_fee_amount?: number | null
          cfdi_requested?: boolean
          created_at?: string
          id?: string
          organizer_amount?: number | null
          pair_id: string
          payment_status?: Database["public"]["Enums"]["payment_status"]
          player_legal_name?: string | null
          player_rfc?: string | null
          stripe_payment_intent_id?: string | null
          tournament_id: string
        }
        Update: {
          amount?: number
          application_fee_amount?: number | null
          cfdi_requested?: boolean
          created_at?: string
          id?: string
          organizer_amount?: number | null
          pair_id?: string
          payment_status?: Database["public"]["Enums"]["payment_status"]
          player_legal_name?: string | null
          player_rfc?: string | null
          stripe_payment_intent_id?: string | null
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "registrations_pair_id_fkey"
            columns: ["pair_id"]
            isOneToOne: false
            referencedRelation: "bracket_pairs_public"
            referencedColumns: ["pair_id"]
          },
          {
            foreignKeyName: "registrations_pair_id_fkey"
            columns: ["pair_id"]
            isOneToOne: false
            referencedRelation: "my_pairs"
            referencedColumns: ["pair_id"]
          },
          {
            foreignKeyName: "registrations_pair_id_fkey"
            columns: ["pair_id"]
            isOneToOne: false
            referencedRelation: "organizer_pairs_admin"
            referencedColumns: ["pair_id"]
          },
          {
            foreignKeyName: "registrations_pair_id_fkey"
            columns: ["pair_id"]
            isOneToOne: false
            referencedRelation: "pairs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registrations_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsor_leads: {
        Row: {
          created_at: string
          data_share_consented: boolean
          data_share_consented_at: string | null
          id: string
          note: string | null
          product_id: string
          sponsor_id: string
          status: Database["public"]["Enums"]["lead_status"]
          tournament_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data_share_consented?: boolean
          data_share_consented_at?: string | null
          id?: string
          note?: string | null
          product_id: string
          sponsor_id: string
          status?: Database["public"]["Enums"]["lead_status"]
          tournament_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          data_share_consented?: boolean
          data_share_consented_at?: string | null
          id?: string
          note?: string | null
          product_id?: string
          sponsor_id?: string
          status?: Database["public"]["Enums"]["lead_status"]
          tournament_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sponsor_leads_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "sponsor_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsor_leads_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "sponsors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsor_leads_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsor_leads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsor_products: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          name: string
          price_display: string | null
          product_type: Database["public"]["Enums"]["product_type"]
          sponsor_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name: string
          price_display?: string | null
          product_type?: Database["public"]["Enums"]["product_type"]
          sponsor_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name?: string
          price_display?: string | null
          product_type?: Database["public"]["Enums"]["product_type"]
          sponsor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sponsor_products_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "sponsors"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsors: {
        Row: {
          active: boolean
          contact_email: string
          contact_phone: string | null
          created_at: string
          id: string
          logo_url: string | null
          name: string
        }
        Insert: {
          active?: boolean
          contact_email: string
          contact_phone?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
        }
        Update: {
          active?: boolean
          contact_email?: string
          contact_phone?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
        }
        Relationships: []
      }
      stripe_processed_events: {
        Row: {
          event_id: string
          processed_at: string
          source: string | null
          type: string | null
        }
        Insert: {
          event_id: string
          processed_at?: string
          source?: string | null
          type?: string | null
        }
        Update: {
          event_id?: string
          processed_at?: string
          source?: string | null
          type?: string | null
        }
        Relationships: []
      }
      subscription_handoff_tokens: {
        Row: {
          created_at: string
          expires_at: string
          token: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          token: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          token?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_handoff_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_invoices: {
        Row: {
          amount_total: number | null
          cfdi_error: string | null
          cfdi_provider_id: string | null
          cfdi_status: string
          created_at: string
          currency: string | null
          stripe_customer_id: string | null
          stripe_invoice_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount_total?: number | null
          cfdi_error?: string | null
          cfdi_provider_id?: string | null
          cfdi_status?: string
          created_at?: string
          currency?: string | null
          stripe_customer_id?: string | null
          stripe_invoice_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount_total?: number | null
          cfdi_error?: string | null
          cfdi_provider_id?: string | null
          cfdi_status?: string
          created_at?: string
          currency?: string | null
          stripe_customer_id?: string | null
          stripe_invoice_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_invoices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          billing_cycle: Database["public"]["Enums"]["billing_cycle"]
          cancel_at_period_end: boolean
          canceled_at: string | null
          cancellation_feedback: string | null
          cancellation_reason: string | null
          created_at: string
          current_period_end: string | null
          id: string
          plan: Database["public"]["Enums"]["subscription_plan"]
          status: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id: string
          stripe_subscription_id: string | null
          tax_legal_name: string | null
          tax_regime: string | null
          tax_rfc: string | null
          tax_use_cfdi: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          billing_cycle: Database["public"]["Enums"]["billing_cycle"]
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          cancellation_feedback?: string | null
          cancellation_reason?: string | null
          created_at?: string
          current_period_end?: string | null
          id?: string
          plan: Database["public"]["Enums"]["subscription_plan"]
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id: string
          stripe_subscription_id?: string | null
          tax_legal_name?: string | null
          tax_regime?: string | null
          tax_rfc?: string | null
          tax_use_cfdi?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          billing_cycle?: Database["public"]["Enums"]["billing_cycle"]
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          cancellation_feedback?: string | null
          cancellation_reason?: string | null
          created_at?: string
          current_period_end?: string | null
          id?: string
          plan?: Database["public"]["Enums"]["subscription_plan"]
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string
          stripe_subscription_id?: string | null
          tax_legal_name?: string | null
          tax_regime?: string | null
          tax_rfc?: string | null
          tax_use_cfdi?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      tos_versions: {
        Row: {
          description: string | null
          published_at: string
          version: string
        }
        Insert: {
          description?: string | null
          published_at?: string
          version: string
        }
        Update: {
          description?: string | null
          published_at?: string
          version?: string
        }
        Relationships: []
      }
      tournament_judges: {
        Row: {
          assigned_by: string | null
          created_at: string
          id: string
          tournament_id: string
          user_id: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          tournament_id: string
          user_id: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          tournament_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_judges_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_judges_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_judges_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_ranking_points: {
        Row: {
          breakdown: Json | null
          created_at: string
          division: Database["public"]["Enums"]["division"]
          id: string
          player_id: string
          points: number
          tournament_id: string
        }
        Insert: {
          breakdown?: Json | null
          created_at?: string
          division: Database["public"]["Enums"]["division"]
          id?: string
          player_id: string
          points?: number
          tournament_id: string
        }
        Update: {
          breakdown?: Json | null
          created_at?: string
          division?: Database["public"]["Enums"]["division"]
          id?: string
          player_id?: string
          points?: number
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_ranking_points_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_ranking_points_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_sponsors: {
        Row: {
          created_at: string
          id: string
          sponsor_id: string
          tournament_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          sponsor_id: string
          tournament_id: string
        }
        Update: {
          created_at?: string
          id?: string
          sponsor_id?: string
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_sponsors_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "sponsors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_sponsors_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_windows: {
        Row: {
          created_at: string
          desde: string
          dia: string
          hasta: string
          id: string
          tournament_id: string
        }
        Insert: {
          created_at?: string
          desde: string
          dia: string
          hasta: string
          id?: string
          tournament_id: string
        }
        Update: {
          created_at?: string
          desde?: string
          dia?: string
          hasta?: string
          id?: string
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_windows_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournaments: {
        Row: {
          courts: number | null
          created_at: string
          end_date: string
          id: string
          match_minutes: number | null
          name: string
          organizer_id: string
          registration_fee: number
          start_date: string
          status: Database["public"]["Enums"]["tournament_status"]
          tercer_lugar: boolean
          venue_id: string | null
        }
        Insert: {
          courts?: number | null
          created_at?: string
          end_date: string
          id?: string
          match_minutes?: number | null
          name: string
          organizer_id: string
          registration_fee?: number
          start_date: string
          status?: Database["public"]["Enums"]["tournament_status"]
          tercer_lugar?: boolean
          venue_id?: string | null
        }
        Update: {
          courts?: number | null
          created_at?: string
          end_date?: string
          id?: string
          match_minutes?: number | null
          name?: string
          organizer_id?: string
          registration_fee?: number
          start_date?: string
          status?: Database["public"]["Enums"]["tournament_status"]
          tercer_lugar?: boolean
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tournaments_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "organizers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournaments_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "organizers_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournaments_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          acquisition_source: Json | null
          birthdate: string | null
          created_at: string
          default_schedule_pref: Database["public"]["Enums"]["schedule_preference"]
          email: string
          full_name: string
          gender: Database["public"]["Enums"]["player_gender"] | null
          id: string
          parent_email: string | null
          parent_name: string | null
          parental_consent_at: string | null
          parental_consent_ip: unknown
          phone: string | null
          photo_url: string | null
          preferred_side: Database["public"]["Enums"]["preferred_side"] | null
          role: Database["public"]["Enums"]["platform_role"]
          tos_accepted_at: string | null
          tos_accepted_version: string | null
        }
        Insert: {
          acquisition_source?: Json | null
          birthdate?: string | null
          created_at?: string
          default_schedule_pref?: Database["public"]["Enums"]["schedule_preference"]
          email: string
          full_name: string
          gender?: Database["public"]["Enums"]["player_gender"] | null
          id: string
          parent_email?: string | null
          parent_name?: string | null
          parental_consent_at?: string | null
          parental_consent_ip?: unknown
          phone?: string | null
          photo_url?: string | null
          preferred_side?: Database["public"]["Enums"]["preferred_side"] | null
          role?: Database["public"]["Enums"]["platform_role"]
          tos_accepted_at?: string | null
          tos_accepted_version?: string | null
        }
        Update: {
          acquisition_source?: Json | null
          birthdate?: string | null
          created_at?: string
          default_schedule_pref?: Database["public"]["Enums"]["schedule_preference"]
          email?: string
          full_name?: string
          gender?: Database["public"]["Enums"]["player_gender"] | null
          id?: string
          parent_email?: string | null
          parent_name?: string | null
          parental_consent_at?: string | null
          parental_consent_ip?: unknown
          phone?: string | null
          photo_url?: string | null
          preferred_side?: Database["public"]["Enums"]["preferred_side"] | null
          role?: Database["public"]["Enums"]["platform_role"]
          tos_accepted_at?: string | null
          tos_accepted_version?: string | null
        }
        Relationships: []
      }
      venues: {
        Row: {
          address: string
          altitude_note: string | null
          city: string
          court_speed: Database["public"]["Enums"]["court_speed"] | null
          created_at: string
          created_by: string | null
          id: string
          lat: number | null
          lng: number | null
          name: string
          name_normalized: string | null
        }
        Insert: {
          address: string
          altitude_note?: string | null
          city?: string
          court_speed?: Database["public"]["Enums"]["court_speed"] | null
          created_at?: string
          created_by?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          name: string
          name_normalized?: string | null
        }
        Update: {
          address?: string
          altitude_note?: string | null
          city?: string
          court_speed?: Database["public"]["Enums"]["court_speed"] | null
          created_at?: string
          created_by?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          name?: string
          name_normalized?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      bracket_pairs_public: {
        Row: {
          category_id: string | null
          pair_id: string | null
          player1_id: string | null
          player1_name: string | null
          player1_photo: string | null
          player2_id: string | null
          player2_name: string | null
          player2_photo: string | null
          tournament_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pairs_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pairs_player1_id_fkey"
            columns: ["player1_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pairs_player2_id_fkey"
            columns: ["player2_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pairs_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      my_pairs: {
        Row: {
          category_id: string | null
          created_at: string | null
          pair_id: string | null
          payment_status: Database["public"]["Enums"]["payment_status"] | null
          player1_id: string | null
          player1_name: string | null
          player2_id: string | null
          player2_name: string | null
          tournament_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pairs_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pairs_player1_id_fkey"
            columns: ["player1_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pairs_player2_id_fkey"
            columns: ["player2_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pairs_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      organizer_judges_admin: {
        Row: {
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string | null
          tournament_id: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tournament_judges_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_judges_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      organizer_members_admin: {
        Row: {
          email: string | null
          full_name: string | null
          member_role:
            | Database["public"]["Enums"]["organizer_member_role"]
            | null
          organizer_id: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organizer_members_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "organizers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizer_members_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "organizers_public"
            referencedColumns: ["id"]
          },
        ]
      }
      organizer_pairs_admin: {
        Row: {
          category_id: string | null
          created_at: string | null
          pair_id: string | null
          payment_status: Database["public"]["Enums"]["payment_status"] | null
          player1_activado: boolean | null
          player1_id: string | null
          player1_name: string | null
          player2_activado: boolean | null
          player2_id: string | null
          player2_name: string | null
          tournament_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pairs_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pairs_player1_id_fkey"
            columns: ["player1_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pairs_player2_id_fkey"
            columns: ["player2_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pairs_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      organizers_public: {
        Row: {
          can_charge_online: boolean | null
          id: string | null
          name: string | null
          slug: string | null
          verified: boolean | null
        }
        Insert: {
          can_charge_online?: never
          id?: string | null
          name?: string | null
          slug?: string | null
          verified?: never
        }
        Update: {
          can_charge_online?: never
          id?: string | null
          name?: string | null
          slug?: string | null
          verified?: never
        }
        Relationships: []
      }
      ranking_public: {
        Row: {
          division: Database["public"]["Enums"]["division"] | null
          full_name: string | null
          photo_url: string | null
          player_id: string | null
          points: number | null
          position: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ranking_points_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_terms_on_activation: {
        Args: { p_parent_name?: string; p_tos_version: string }
        Returns: {
          consent_recorded: boolean
          is_minor_account: boolean
        }[]
      }
      advance_bracket_round: {
        Args: { p_actor: string; p_category_id: string; p_next: Json }
        Returns: Json
      }
      ajustar_clasificados: {
        Args: {
          p_advance: number
          p_borrar_cuadro?: boolean
          p_category_id: string
          p_extra: number
        }
        Returns: Json
      }
      apply_tournament_ranking_points: {
        Args: { p_actor: string; p_ledger: Json; p_tournament_id: string }
        Returns: Json
      }
      auth_email_status: { Args: { p_email: string }; Returns: string }
      bloques_ocupacion: {
        Args: { p_tournament_id: string }
        Returns: {
          bloque_id: string
          category_id: string
          parejas: number
        }[]
      }
      can_capture_tournament: {
        Args: { p_tournament_id: string }
        Returns: boolean
      }
      category_tournament: { Args: { c_id: string }; Returns: string }
      close_registration_for_category: {
        Args: {
          p_actor: string
          p_category_id: string
          p_groups: Json
          p_plan: Json
        }
        Returns: Json
      }
      create_organizer: {
        Args: { p_contact_email: string; p_name: string }
        Returns: {
          already_existed: boolean
          organizer_id: string
          slug: string
        }[]
      }
      find_user_by_email: {
        Args: { p_email: string }
        Returns: {
          email: string
          full_name: string
          id: string
        }[]
      }
      finish_tournament: {
        Args: { p_actor: string; p_tournament_id: string }
        Returns: Json
      }
      get_player_match_stats: {
        Args: { p_division?: string; p_player_id: string }
        Returns: Json
      }
      is_admin: { Args: never; Returns: boolean }
      is_my_pair: { Args: { p_pair_id: string }; Returns: boolean }
      is_org_member: { Args: { org: string }; Returns: boolean }
      is_org_owner: { Args: { org: string }; Returns: boolean }
      is_tournament_judge: {
        Args: { p_tournament_id: string }
        Returns: boolean
      }
      is_tournament_participant: {
        Args: { p_tournament_id: string }
        Returns: boolean
      }
      move_match: {
        Args: {
          p_actor: string
          p_court_label: string
          p_esperado_at: string
          p_esperado_court: string
          p_match_id: string
          p_scheduled_at: string
        }
        Returns: Json
      }
      rebuild_division_ratings: {
        Args: { p_division: string; p_history: Json; p_player_ratings: Json }
        Returns: Json
      }
      record_knockout_result: {
        Args: {
          p_actor: string
          p_bracket_state: Json
          p_crear: Json
          p_match_id: string
          p_played_at: string
          p_reapuntar: Json
          p_sets: Json
          p_winner_pair: string
        }
        Returns: Json
      }
      record_match_result: {
        Args: {
          p_actor: string
          p_group_state: Json
          p_match_id: string
          p_played_at: string
          p_sets: Json
          p_standings: Json
          p_winner_pair: string
        }
        Returns: Json
      }
      search_users: {
        Args: { p_query: string }
        Returns: {
          email: string
          exact_email_match: boolean
          full_name: string
          id: string
          photo_url: string
        }[]
      }
      seed_bracket_for_category: {
        Args: { p_actor: string; p_category_id: string; p_matches: Json }
        Returns: Json
      }
      slugify: { Args: { p_text: string }; Returns: string }
      tournament_category_counts: {
        Args: { p_tournament_id: string }
        Returns: {
          category_id: string
          pair_count: number
        }[]
      }
      tournament_org: { Args: { t_id: string }; Returns: string }
      tournament_status: { Args: { t_id: string }; Returns: string }
      unaccent_lower: { Args: { t: string }; Returns: string }
    }
    Enums: {
      billing_cycle: "monthly" | "annual"
      bug_severity: "low" | "medium" | "high" | "critical"
      category_gender: "male" | "female" | "mixed"
      category_status: "open" | "closed" | "seeded" | "in_progress" | "finished"
      clinch_status: "clinched" | "eliminated" | "alive" | "repechage_pending"
      connect_status: "pending" | "onboarding" | "active" | "restricted"
      court_speed: "slow" | "medium" | "fast"
      division:
        | "sexta"
        | "quinta"
        | "cuarta"
        | "tercera"
        | "segunda"
        | "primera"
      feedback_type:
        | "general"
        | "feature_request"
        | "complaint"
        | "praise"
        | "cancellation"
      format_type: "groups_then_knockout" | "round_robin" | "knockout_only"
      lead_status: "new" | "sent" | "contacted"
      match_stage:
        | "group"
        | "round_of_32"
        | "round_of_16"
        | "quarter"
        | "semi"
        | "final"
        | "third_place"
      match_status: "scheduled" | "in_progress" | "finished"
      organizer_member_role: "owner" | "judge"
      payment_status: "paid_online" | "paid_offline" | "comp" | "pending"
      platform_role: "player" | "admin"
      player_gender: "male" | "female"
      preferred_side: "drive" | "reves" | "ambos"
      product_type: "sponsor_lead" | "own_product"
      rule_scope: "global" | "tournament"
      schedule_preference: "morning" | "afternoon" | "any"
      subscription_plan: "pro" | "campeon"
      subscription_status:
        | "active"
        | "trialing"
        | "past_due"
        | "canceled"
        | "incomplete"
        | "incomplete_expired"
        | "paused"
      tournament_status:
        | "draft"
        | "registration_open"
        | "registration_closed"
        | "in_progress"
        | "finished"
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
      billing_cycle: ["monthly", "annual"],
      bug_severity: ["low", "medium", "high", "critical"],
      category_gender: ["male", "female", "mixed"],
      category_status: ["open", "closed", "seeded", "in_progress", "finished"],
      clinch_status: ["clinched", "eliminated", "alive", "repechage_pending"],
      connect_status: ["pending", "onboarding", "active", "restricted"],
      court_speed: ["slow", "medium", "fast"],
      division: ["sexta", "quinta", "cuarta", "tercera", "segunda", "primera"],
      feedback_type: [
        "general",
        "feature_request",
        "complaint",
        "praise",
        "cancellation",
      ],
      format_type: ["groups_then_knockout", "round_robin", "knockout_only"],
      lead_status: ["new", "sent", "contacted"],
      match_stage: [
        "group",
        "round_of_32",
        "round_of_16",
        "quarter",
        "semi",
        "final",
        "third_place",
      ],
      match_status: ["scheduled", "in_progress", "finished"],
      organizer_member_role: ["owner", "judge"],
      payment_status: ["paid_online", "paid_offline", "comp", "pending"],
      platform_role: ["player", "admin"],
      player_gender: ["male", "female"],
      preferred_side: ["drive", "reves", "ambos"],
      product_type: ["sponsor_lead", "own_product"],
      rule_scope: ["global", "tournament"],
      schedule_preference: ["morning", "afternoon", "any"],
      subscription_plan: ["pro", "campeon"],
      subscription_status: [
        "active",
        "trialing",
        "past_due",
        "canceled",
        "incomplete",
        "incomplete_expired",
        "paused",
      ],
      tournament_status: [
        "draft",
        "registration_open",
        "registration_closed",
        "in_progress",
        "finished",
      ],
    },
  },
} as const
