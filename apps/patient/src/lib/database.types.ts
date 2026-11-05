/**
 * Supabase database types.
 * Tables live in per-org schemas (e.g. org_care_demo).
 * The public schema holds cross-org infrastructure only.
 */

export interface Database {
  public: {
    Tables: {
      orgs: {
        Row: {
          id: string;
          name: string;
          slug: string;
          schema_name: string;
          created_at: string;
        };
        Insert: { name: string; slug: string; schema_name: string };
        Update: { name?: string; slug?: string };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
    Functions: {
      provision_org: {
        Args: { p_org_name: string; p_slug: string };
        Returns: string;
      };
      get_patient_by_email: {
        Args: { p_email: string; p_org_slug: string };
        Returns: PatientRow;
      };
      get_patient_checkins: {
        Args: { p_patient_id: string; p_org_slug: string };
        Returns: CheckinRow[];
      };
      get_patient_messages: {
        Args: { p_patient_id: string; p_org_slug: string };
        Returns: MessageRow[];
      };
      upsert_checkin: {
        Args: { p_org_slug: string; p_checkin: string };
        Returns: string;
      };
      create_checkin_draft: {
        Args: { p_org_slug: string; p_patient_id: string; p_day_number: number; p_transcript: string };
        Returns: string;
      };
      update_checkin_photo: {
        Args: { p_org_slug: string; p_checkin_id: string; p_photo_url: string };
        Returns: undefined;
      };
      start_call_session: {
        Args: { p_org_slug: string; p_patient_id: string };
        Returns: string;
      };
      save_voice_call: {
        Args: { p_org_slug: string; p_session_id: string; p_transcript_text: string; p_full_transcript?: unknown };
        Returns: string;
      };
    };
  };
}

export interface PatientRow {
  id: string;
  name: string;
  email: string;
  age: number;
  gender: string;
  phone: string | null;
  avatar_url: string | null;
  doctor_id: string;
  treatment_name: string;
  treatment_description: string | null;
  treatment_start_date: string;
  current_day: number;
  status: 'green' | 'yellow' | 'red';
  adherence_percent: number;
  prescribed_products: string | null;
  condition: 'acne' | 'laser_recovery' | 'alopecia_areata' | 'androgenic_alopecia' | 'telogen_effluvium';
  org_slug: string;
}

export interface DoctorRow {
  id: string;
  name: string;
  specialty: string;
  clinic_name: string;
  clinic_location: string;
  avatar_url: string | null;
  phone: string | null;
  email: string;
}

export interface CheckinRow {
  id: string;
  patient_id: string;
  day_number: number;
  checkin_date: string;
  status: 'green' | 'yellow' | 'red';
  symptoms_reported: string | null;
  adherence_today: boolean;
  photo_url: string | null;
  photo_label: string | null;
  ai_headline: string | null;
  ai_summary: string | null;
  ai_zone_analysis: string | null;
  ai_suggested_actions: string | null;
  doctor_response: string | null;
  notes: string | null;
  quality_score: number | null;
  transcript: string | null;
  checkin_status: string | null;
}

export interface MessageRow {
  id: number;
  patient_id: string;
  sender: 'patient' | 'doctor' | 'aisha';
  content: string;
  message_type: 'text' | 'ai_analysis' | 'image';
  timestamp: string;
  is_read: boolean;
  photo_url: string | null;
}

export interface AlertRow {
  id: string;
  patient_id: string;
  severity: 'green' | 'yellow' | 'red';
  title: string;
  ai_analysis: string;
  suggested_actions: string;
  patient_context: string | null;
  photo_url: string | null;
  created_at: string;
  resolved: boolean;
  doctor_action: string | null;
}

export interface ZoneAnalysis {
  forehead: ZoneData;
  left_cheek: ZoneData;
  right_cheek: ZoneData;
  nose_tzone: ZoneData;
  perioral: ZoneData;
  chin: ZoneData;
}

export interface ZoneData {
  redness: number;
  swelling: number;
  texture_concern: number;
  hotspot: boolean;
  notes?: string;
}

export interface HairZoneData {
  density: number;           // 0-3: 3=full density, 2=mild thinning, 1=significant thinning, 0=bald patch
  scalp_visibility: number;  // 0-100: % of scalp skin visible through hair
  hotspot: boolean;
  notes?: string;
}

export interface HairZoneAnalysis {
  crown:        HairZoneData;
  hairline:     HairZoneData;
  left_temple:  HairZoneData;
  right_temple: HairZoneData;
  parting_line: HairZoneData;
  sides:        HairZoneData;
}

export interface AIAnalysis {
  headline: string;
  summary: string;
  alert_level: 1 | 2 | 3;
  checkin_type: 'face' | 'hair';
  zone_analysis: ZoneAnalysis | null;
  hair_zone_analysis: HairZoneAnalysis | null;
  recommendation: string;
  doctor_note: string;
  adherence_assessment: string;
}
