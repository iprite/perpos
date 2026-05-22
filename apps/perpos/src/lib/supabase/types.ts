export type Role = "super_admin" | "user";

export type Profile = {
  id: string;
  email: string | null;
  role: Role;
  is_active?: boolean | null;
  display_name?: string | null;
  avatar_url?: string | null;
  line_user_id?: string | null;
  line_linked_at?: string | null;
  created_at: string;
};
