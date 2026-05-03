export type Role = "admin" | "sale" | "operation" | "employer" | "representative";

export type RepresentativeLevel = "lead" | "member";

export type Profile = {
  id: string;
  email: string | null;
  role: Role;
  representative_level?: RepresentativeLevel | null;
  representative_lead_id?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  line_user_id?: string | null;
  line_linked_at?: string | null;
  created_at: string;
};
