export type QuoteStatus = "draft" | "pending_approval" | "approved" | "rejected" | "cancelled";

export type SalesQuoteRow = {
  id: string;
  quote_no: string;
  customer_id: string | null;
  customer_name: string;
  customer_company: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  billing_address: string | null;
  notes: string | null;
  currency: string;
  subtotal: number;
  discount_total: number;
  include_vat: boolean;
  vat_rate: number;
  vat_amount: number;
  wht_rate: number;
  wht_amount: number;
  tax_total: number;
  grand_total: number;
  valid_until: string | null;
  status: QuoteStatus;
  created_by_profile_id: string | null;
  approved_by_profile_id: string | null;
  approved_at: string | null;
  pdf_storage_path: string | null;
  created_at: string;
  updated_at: string;
};

export type SalesQuoteItemRow = {
  id: string;
  quote_id: string;
  service_id: string | null;
  name: string;
  description: string | null;
  task_list?: string[] | null;
  quantity: number;
  unit_price: number;
  line_total: number;
  sort_order: number;
  created_at: string;
};

export type QuoteFollowupType = "call" | "email" | "meeting" | "task";

export type SalesFollowupRow = {
  id: string;
  quote_id: string;
  type: QuoteFollowupType;
  subject: string;
  notes: string | null;
  due_at: string | null;
  reminder_at: string | null;
  completed_at: string | null;
  assigned_to_profile_id: string | null;
  created_at: string;
  updated_at: string;
};
