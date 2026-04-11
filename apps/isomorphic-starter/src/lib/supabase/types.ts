export type Role = "admin" | "sale" | "operation" | "employer" | "representative";

export type RepresentativeLevel = "lead" | "member";

export type Profile = {
  id: string;
  email: string | null;
  role: Role;
  representative_level?: RepresentativeLevel | null;
  representative_lead_id?: string | null;
  created_at: string;
};
