export type CrmDealStage = {
  key: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
};

export type CrmDealStatus = "open" | "won" | "lost";

export type CrmDeal = {
  id: string;
  customer_id: string;
  title: string;
  amount: number;
  currency: string;
  stage_key: string;
  probability: number;
  expected_close_date: string | null;
  status: CrmDealStatus;
  owner_profile_id: string | null;
  created_at: string;
  updated_at: string;
};

export type CrmActivityType = "call" | "email" | "meeting" | "task";

export type CrmActivity = {
  id: string;
  customer_id: string;
  deal_id: string | null;
  type: CrmActivityType;
  subject: string;
  notes: string | null;
  due_at: string | null;
  reminder_at: string | null;
  completed_at: string | null;
  assigned_to_profile_id: string | null;
  created_at: string;
  updated_at: string;
};

export type CrmReminderGroup = "overdue" | "today" | "next7";

