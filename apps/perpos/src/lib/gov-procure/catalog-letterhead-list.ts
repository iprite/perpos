// catalog-letterhead-list.ts — fetch logic ของ "ค่าตั้งต้นหัวจดหมายต่อบริษัท" สำหรับหน้า SSR
//
// ไฟล์ใหม่ (ไม่แตะ route/lib เดิม — ADDITIVE) · กฎเดียวกับ `catalog.ts`:
// **รับ `client` เข้ามาเสมอ** (หน้า SSR ส่ง rls client · route ส่ง admin หลัง guard)
// + กรอง `org_id` ทุกคิวรี · ข้อมูลชุดนี้มีสูงสุด 1 แถวต่อบริษัท (C1) จึงไม่ต้องแบ่งหน้า

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Letterhead } from "@/lib/gov-procure/catalog";

/** ค่าตั้งต้นหัวจดหมายทุกบริษัทของ org (เรียงตามชื่อบริษัท) */
export async function listLetterheads(
  client: SupabaseClient,
  orgId: string,
): Promise<Letterhead[]> {
  const { data, error } = await client
    .from("gov_procure_catalog_letterheads")
    .select("*")
    .eq("org_id", orgId)
    .order("company", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as Letterhead[];
}
