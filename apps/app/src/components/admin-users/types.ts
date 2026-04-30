import type { RepresentativeLevel, Role } from "@/lib/supabase/types";

export type OrgOption = { label: string; value: string };
export type RepOption = { label: string; value: string };

export type ListedUser = {
  id: string;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  invited_at: string | null;
  profile: {
    id: string;
    email: string | null;
    role: Role;
    representative_level: RepresentativeLevel | null;
    representative_lead_id: string | null;
    created_at: string;
  } | null;
  employer_org: { organization_id: string; organization_name: string | null } | null;
  representative: { id: string; rep_code: string | null } | null;
};

