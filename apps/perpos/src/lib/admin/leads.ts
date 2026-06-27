/**
 * Demo/contact leads — fetch logic (อ่านผ่าน admin client ตอน SSR)
 *
 * เรียกจาก Server Component (hydrogen)/admin/leads → fetch ตอน SSR
 * filter/page อยู่ใน URL searchParams · รับ admin client (service role);
 * auth/role check เป็นหน้าที่ของ caller (requireSuperAdminPage)
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type LeadStatus = "new" | "contacted" | "qualified" | "won" | "lost" | "spam";

export type LeadRow = {
  id: string;
  name: string;
  phone: string;
  product: string;
  source: string;
  note: string | null;
  status: LeadStatus;
  created_at: string;
  contacted_at: string | null;
};

const PAGE_SIZE = 30;

export async function listLeads(
  admin: SupabaseClient,
  opts: { status?: string; product?: string; page?: number } = {},
): Promise<{ items: LeadRow[]; total: number; page: number; limit: number }> {
  const page = Math.max(1, opts.page ?? 1);
  const from = (page - 1) * PAGE_SIZE;

  let q = admin
    .from("demo_requests")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  if (opts.status) q = q.eq("status", opts.status);
  if (opts.product) q = q.eq("product", opts.product);

  const { data, count } = await q;
  return {
    items: (data ?? []) as LeadRow[],
    total: count ?? 0,
    page,
    limit: PAGE_SIZE,
  };
}

export async function getLeadStats(
  admin: SupabaseClient,
): Promise<{ total: number; new: number; last7d: number }> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString();
  const [{ count: total }, { count: newCount }, { count: last7d }] = await Promise.all([
    admin.from("demo_requests").select("id", { count: "exact", head: true }),
    admin.from("demo_requests").select("id", { count: "exact", head: true }).eq("status", "new"),
    admin
      .from("demo_requests")
      .select("id", { count: "exact", head: true })
      .gte("created_at", sevenDaysAgo),
  ]);
  return { total: total ?? 0, new: newCount ?? 0, last7d: last7d ?? 0 };
}

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  new: "ใหม่",
  contacted: "ติดต่อแล้ว",
  qualified: "คุณภาพ",
  won: "ปิดการขาย",
  lost: "ไม่สำเร็จ",
  spam: "สแปม",
};

export const LEAD_STATUS_TONE: Record<
  LeadStatus,
  "warning" | "info" | "success" | "neutral" | "danger"
> = {
  new: "warning",
  contacted: "info",
  qualified: "info",
  won: "success",
  lost: "neutral",
  spam: "danger",
};

export const PRODUCT_LABEL: Record<string, string> = { suite: "Suite", flow: "Flow" };

export function fmtLeadTime(iso: string): string {
  return new Date(iso).toLocaleString("th-TH", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
