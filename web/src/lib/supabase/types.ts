import type { Role } from "@/lib/roles";

export type Profile = {
  id: string;
  email: string | null;
  role: Role;
  created_at: string;
};

export type Customer = {
  id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  created_by_profile_id: string | null;
  created_at: string;
};

export type Worker = {
  id: string;
  customer_id: string | null;
  full_name: string;
  passport_no: string | null;
  nationality: string | null;
  created_by_profile_id: string | null;
  created_at: string;
};

export type PoaRequestType = {
  id: string;
  name: string;
  description: string | null;
  base_price: number;
  per_worker_price: number;
  is_active: boolean;
  created_at: string;
};

export type PoaRequestStatus = "submitted" | "need_info" | "issued" | "rejected";

export type PoaRequest = {
  id: string;
  customer_id: string | null;
  representative_profile_id: string;
  poa_request_type_id: string;
  worker_count: number;
  reason: string | null;
  unit_price: number;
  total_price: number;
  status: PoaRequestStatus;
  note: string | null;
  created_at: string;
};

