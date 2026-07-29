/**
 * accounting-sync.ts — ดึงตัวเลขงบรายเดือนของบริษัทในเครือจากระบบบัญชี (hybrid, contract §7)
 *
 * ⚠️ นี่คือเส้นเดียวของโมดูลที่ **อ่านข้าม org** — ใช้ service-role โดยตั้งใจ
 *    ความชอบธรรมมาจาก `p2pg_companies.org_ref_id` ซึ่ง **ตั้งได้เฉพาะ super_admin** (contract §4)
 *    ถ้าวันใดปล่อยให้ผู้ใช้โมดูลผูก org เองได้ = ช่องดูดงบข้ามองค์กร (บทเรียน acc_firm SEC-1)
 *
 * กฎที่ห้ามพัง:
 *  • รายได้ต้องใช้ `selectBillingDocuments`/`billingSign` เดียวกับสมุดรายวัน — ห้ามคิดกฎเอง
 *    (ไม่งั้นตัวเลขบนแดชบอร์ดจะไม่ตรงกับงบ แล้วไม่มีใครรู้ว่าอันไหนถูก)
 *  • ไม่ทับแถวที่ผู้ใช้กรอกเอง (`source='manual'`) หรือถูกล็อกงวด (`is_locked`)
 *  • ต้องรายงาน "ข้ามอะไรไปบ้าง + เพราะอะไร" ให้ครบทุกเหตุผล (บทเรียน gov-procure-catalog)
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { billingSign, selectBillingDocuments } from "@/lib/accounting/sales-journal";
import { monthRange } from "./metrics";
import type { P2pgCompany } from "./types";

export type SyncSkipReason =
  | "no_linked_org" // ยังไม่ได้ผูกกับ org ในระบบ
  | "manual_override" // ผู้ใช้กรอกตัวเลขเองไว้แล้ว
  | "locked" // ปิดงวดแล้ว
  | "no_data"; // ผูกแล้วแต่เดือนนั้นไม่มีเอกสารเลย

export interface SyncSkipped {
  companyId: string;
  companyName: string;
  reason: SyncSkipReason;
}

export interface SyncResult {
  periodMonth: string;
  pulled: {
    companyId: string;
    companyName: string;
    revenue: number | null;
    cogs: number | null;
  }[];
  skipped: SyncSkipped[];
}

export const SKIP_REASON_LABEL: Record<SyncSkipReason, string> = {
  no_linked_org: "ยังไม่ได้ผูกกับองค์กรในระบบ",
  manual_override: "มีตัวเลขที่กรอกเองไว้แล้ว",
  locked: "ปิดงวดแล้ว",
  no_data: "เดือนนี้ไม่มีเอกสารในระบบบัญชี",
};

interface ExistingRow {
  company_id: string;
  source: string;
  is_locked: boolean;
}

/**
 * ดึงยอดขาย/ต้นทุนของทุกบริษัทที่ผูก org ไว้ สำหรับเดือนที่ระบุ แล้วเขียนลง `p2pg_financials`
 * @param admin service-role client (ต้องเป็น admin — อ่านข้าม org)
 * @param orgId org ของโฮลดิ้ง (เจ้าของแถวที่เขียน)
 */
export async function syncFinancialsFromAccounting(
  admin: SupabaseClient,
  orgId: string,
  periodMonth: string,
  userId: string,
): Promise<SyncResult> {
  const { from, to } = monthRange(periodMonth);

  const { data: companyRows, error: cErr } = await admin
    .from("p2pg_companies")
    .select("id, name, org_ref_id")
    .eq("org_id", orgId);
  if (cErr) throw new Error(cErr.message);
  const companies = (companyRows ?? []) as Pick<P2pgCompany, "id" | "name" | "org_ref_id">[];

  const { data: existingRows, error: eErr } = await admin
    .from("p2pg_financials")
    .select("company_id, source, is_locked")
    .eq("org_id", orgId)
    .eq("period_month", periodMonth);
  if (eErr) throw new Error(eErr.message);
  const existing = new Map(
    ((existingRows ?? []) as ExistingRow[]).map((r) => [r.company_id, r] as const),
  );

  const result: SyncResult = { periodMonth, pulled: [], skipped: [] };

  for (const c of companies) {
    if (!c.org_ref_id) {
      result.skipped.push({ companyId: c.id, companyName: c.name, reason: "no_linked_org" });
      continue;
    }
    const prev = existing.get(c.id);
    if (prev?.is_locked) {
      result.skipped.push({ companyId: c.id, companyName: c.name, reason: "locked" });
      continue;
    }
    if (prev && prev.source === "manual") {
      result.skipped.push({ companyId: c.id, companyName: c.name, reason: "manual_override" });
      continue;
    }

    const { revenue, cogs, docCount } = await pullOrgMonth(admin, c.org_ref_id, from, to);
    if (docCount === 0) {
      result.skipped.push({ companyId: c.id, companyName: c.name, reason: "no_data" });
      continue;
    }

    const { error: upErr } = await admin.from("p2pg_financials").upsert(
      {
        org_id: orgId,
        company_id: c.id,
        period_month: periodMonth,
        source: "accounting",
        revenue,
        cogs,
        created_by: userId,
      },
      { onConflict: "company_id,period_month" },
    );
    if (upErr) throw new Error(upErr.message);

    result.pulled.push({ companyId: c.id, companyName: c.name, revenue, cogs });
  }

  return result;
}

/** อ่านเอกสารขาย/ซื้อของ org หนึ่งในเดือนหนึ่ง แล้วสรุปเป็นรายได้/ต้นทุน */
async function pullOrgMonth(
  admin: SupabaseClient,
  refOrgId: string,
  from: string,
  to: string,
): Promise<{ revenue: number | null; cogs: number | null; docCount: number }> {
  const { data: settings } = await admin
    .from("acc_org_settings")
    .select("is_vat_registered")
    .eq("org_id", refOrgId)
    .maybeSingle();
  const isVatRegistered = Boolean((settings as { is_vat_registered?: boolean } | null)?.is_vat_registered);

  const { data: docRows, error: dErr } = await admin
    .from("acc_documents")
    .select("id, doc_type, status, converted_from_id, subtotal, total")
    .eq("org_id", refOrgId)
    .is("deleted_at", null)
    .gte("issue_date", from)
    .lte("issue_date", to);
  if (dErr) throw new Error(dErr.message);

  type Doc = {
    id: string;
    doc_type: string;
    status: string;
    converted_from_id: string | null;
    subtotal: number | null;
    total: number | null;
  };
  const docs = (docRows ?? []) as Doc[];

  // กฎเดียวกับ auto journal — กันนับซ้ำ (ใบกำกับ→ใบเสร็จ) และนับเฉพาะจุดรับรู้รายได้
  const billing = selectBillingDocuments(docs, isVatRegistered);
  // ใช้ยอดก่อน VAT (subtotal) เป็นฐานรายได้ — VAT ไม่ใช่รายได้ของกิจการ
  const revenue = billing.reduce(
    (sum, d) => sum + billingSign(d.doc_type) * Number(d.subtotal ?? 0),
    0,
  );

  const { data: purchRows, error: pErr } = await admin
    .from("acc_purchase_documents")
    .select("id, subtotal, status")
    .eq("org_id", refOrgId)
    .is("deleted_at", null)
    .eq("status", "posted")
    .gte("issue_date", from)
    .lte("issue_date", to);
  if (pErr) throw new Error(pErr.message);
  const purchases = (purchRows ?? []) as { subtotal: number | null }[];
  const cogs = purchases.reduce((sum, p) => sum + Number(p.subtotal ?? 0), 0);

  // ไม่มีเอกสารฝั่งไหน = "ยังไม่มีข้อมูล" (null) ไม่ใช่ 0
  // ถ้าเขียน 0 ลงไป กำไรขั้นต้นจะเท่ากับรายได้ = อัตรากำไร 100% ทั้งแถว (บทเรียน mattii)
  return {
    revenue: billing.length ? round2(revenue) : null,
    cogs: purchases.length ? round2(cogs) : null,
    docCount: billing.length + purchases.length,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
