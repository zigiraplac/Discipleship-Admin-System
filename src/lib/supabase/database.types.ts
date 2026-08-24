/**
 * Hand-written to match supabase/migrations/0001_init.sql. Once the project
 * is live, regenerate the authoritative version with:
 *   npx supabase gen types typescript --project-id <ref> > src/lib/supabase/database.types.ts
 * and this file becomes disposable.
 */

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface Database {
  public: {
    Tables: {
      class: {
        Row: {
          id: number;
          title: string;
          part_note: string | null;
          lesson_count: number;
          position: number;
        };
        Insert: Partial<Database["public"]["Tables"]["class"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["class"]["Row"]>;
        Relationships: [];
      };
      lesson: {
        Row: {
          id: number;
          class_id: number;
          index_in_class: number;
          global_index: number;
          title: string;
          has_quiz: boolean;
        };
        Insert: Partial<Database["public"]["Tables"]["lesson"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["lesson"]["Row"]>;
        Relationships: [];
      };
      app_user: {
        Row: {
          id: string;
          name: string;
          email: string;
          role: "facilitator" | "admin" | "teacher" | "leadership";
          state: "active" | "invited";
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["app_user"]["Row"]> & {
          id: string;
          name: string;
          email: string;
          role: "facilitator" | "admin" | "teacher" | "leadership";
        };
        Update: Partial<Database["public"]["Tables"]["app_user"]["Row"]>;
        Relationships: [];
      };
      cohort: {
        Row: {
          id: string;
          name: string;
          city: string | null;
          start_date: string;
          teaching_days: number[];
          facilitator_id: string | null;
          status: "running" | "complete" | "archived";
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["cohort"]["Row"]> & {
          name: string;
          start_date: string;
          teaching_days: number[];
        };
        Update: Partial<Database["public"]["Tables"]["cohort"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "cohort_facilitator_id_fkey";
            columns: ["facilitator_id"];
            isOneToOne: false;
            referencedRelation: "app_user";
            referencedColumns: ["id"];
          },
        ];
      };
      cohort_member: {
        Row: {
          cohort_id: string;
          user_id: string;
          capacity: "facilitator" | "teacher";
        };
        Insert: Database["public"]["Tables"]["cohort_member"]["Row"];
        Update: Partial<Database["public"]["Tables"]["cohort_member"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "cohort_member_cohort_id_fkey";
            columns: ["cohort_id"];
            isOneToOne: false;
            referencedRelation: "cohort";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cohort_member_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "app_user";
            referencedColumns: ["id"];
          },
        ];
      };
      student: {
        Row: {
          id: string;
          cohort_id: string;
          full_name: string;
          full_name_raw: string | null;
          email: string | null;
          email_verified: boolean;
          whatsapp: string | null;
          country: string | null;
          country_raw: string | null;
          dob_day: number | null;
          dob_month: number | null;
          registered_at: string | null;
          enrolled_at: string;
          left_at: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["student"]["Row"]> & {
          cohort_id: string;
          full_name: string;
        };
        Update: Partial<Database["public"]["Tables"]["student"]["Row"]>;
        Relationships: [];
      };
      event: {
        Row: {
          id: string;
          cohort_id: string;
          kind: "lesson" | "crusade";
          event_date: string;
          lesson_id: number | null;
          after_class: number | null;
          crusade_day: number | null;
          edited: boolean;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["event"]["Row"]> & {
          cohort_id: string;
          kind: "lesson" | "crusade";
          event_date: string;
        };
        Update: Partial<Database["public"]["Tables"]["event"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "event_lesson_id_fkey";
            columns: ["lesson_id"];
            isOneToOne: false;
            referencedRelation: "lesson";
            referencedColumns: ["id"];
          },
        ];
      };
      register: {
        Row: {
          event_id: string;
          attendance: Json;
          quiz: Json;
          recorded_by: string | null;
          recorded_at: string | null;
          updated_by: string | null;
          updated_at: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["register"]["Row"]> & {
          event_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["register"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "register_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: true;
            referencedRelation: "event";
            referencedColumns: ["id"];
          },
        ];
      };
      outcome: {
        Row: {
          id: string;
          student_id: string;
          cohort_id: string;
          kind: "catchup" | "continuing" | "left";
          note: string | null;
          recorded_by: string;
          recorded_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["outcome"]["Row"]> & {
          student_id: string;
          cohort_id: string;
          kind: "catchup" | "continuing" | "left";
          recorded_by: string;
        };
        Update: Partial<Database["public"]["Tables"]["outcome"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "outcome_recorded_by_fkey";
            columns: ["recorded_by"];
            isOneToOne: false;
            referencedRelation: "app_user";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "outcome_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "student";
            referencedColumns: ["id"];
          },
        ];
      };
      crusade_report: {
        Row: {
          id: string;
          cohort_id: string;
          after_class: number;
          souls_reached: number | null;
          conversions: number | null;
          followups: number | null;
          notes: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["crusade_report"]["Row"]> & {
          cohort_id: string;
          after_class: number;
        };
        Update: Partial<Database["public"]["Tables"]["crusade_report"]["Row"]>;
        Relationships: [];
      };
      org_setting: {
        Row: { key: string; value: Json };
        Insert: Database["public"]["Tables"]["org_setting"]["Row"];
        Update: Partial<Database["public"]["Tables"]["org_setting"]["Row"]>;
        Relationships: [];
      };
      audit_log: {
        Row: {
          id: number;
          actor_id: string | null;
          entity: string;
          entity_id: string;
          action: string;
          before: Json | null;
          after: Json | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["audit_log"]["Row"]> & {
          entity: string;
          entity_id: string;
          action: string;
        };
        Update: Partial<Database["public"]["Tables"]["audit_log"]["Row"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      cohort_lesson_public_stats: {
        Args: { p_cohort: string };
        Returns: {
          event_id: string;
          present: number;
          absent: number;
          rate: number;
          quiz_avg: number | null;
          enrolled: number;
          recorded: boolean;
        }[];
      };
      is_admin: { Args: Record<string, never>; Returns: boolean };
      activate_self: { Args: Record<string, never>; Returns: undefined };
    };
    Enums: Record<string, never>;
  };
}
