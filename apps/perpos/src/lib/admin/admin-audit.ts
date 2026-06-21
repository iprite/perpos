/**
 * getAdminAudit — บันทึกการจัดการของแอดมิน (admin_audit_log) แบบแบ่งหน้า + filter
 *
 * เรียกจาก Server Component (hydrogen)/admin/admin-audit/page.tsx → fetch ตอน SSR
 * filter/page อยู่ใน URL searchParams (server re-render เมื่อเปลี่ยน → ใช้ loading.tsx)
 * รับ admin client (service role) — auth/role check เป็นหน้าที่ของ caller
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type AuditEntry = {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  target_label: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
};

export type AdminAuditResult = {
  items: AuditEntry[];
  total: number;
  page: number;
  limit: number;
  actions: string[];
};

export async function getAdminAudit(
  admin: SupabaseClient,
  opts: { page?: number; action?: string; limit?: number } = {},
): Promise<AdminAuditResult> {
  const page = Math.max(1, Number(opts.page ?? 1));
  const limit = Math.min(200, Math.max(1, Number(opts.limit ?? 50)));
  const from = page === 1 ? 0 : (page - 1) * limit;
  const to = from + limit - 1;

  let q = admin
    .from("admin_audit_log")
    .select(
      "id, actor_id, actor_email, action, target_type, target_id, target_label, metadata, ip_address, created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  if (opts.action) q = q.eq("action", opts.action);

  const { data, count } = await q;

  // รายการ action ที่มี (สำหรับ filter dropdown)
  const { data: actionsRaw } = await admin.from("admin_audit_log").select("action").limit(1000);
  const actions = Array.from(new Set((actionsRaw ?? []).map((r) => r.action as string))).sort();

  return {
    items: (data ?? []) as unknown as AuditEntry[],
    total: count ?? 0,
    page,
    limit,
    actions,
  };
}
