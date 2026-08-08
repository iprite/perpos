/**
 * ร่องรอยการแก้ไขบัญชี (accounting audit trail)
 *
 * ทุก mutation ของโมดูล `accounting` ต้องทิ้งร่องรอยว่า **ใครแก้ ในนามใคร เปลี่ยนอะไร**
 * — จำเป็นเป็นพิเศษหลังเปิด firm access (สำนักงานบัญชีแก้บัญชีของ org ลูกค้าได้โดยไม่ได้
 * เป็นสมาชิก org นั้น ดู `docs/ACC_FIRM_CLIENT_ACCESS.md`)
 *
 * **ทำไมส่ง actor เข้ามาตรง ๆ ไม่ใช้ `set_audit_context` (session GUC) ของ audit v2:**
 * PostgREST คุย DB ผ่าน connection pool และ GUC นั้นผูกกับ *session* — ถ้า request หนึ่ง
 * ตั้ง context แล้วการเขียนไม่เกิด ค่าจะค้างบน connection แล้วไปติดกับ request ของ **คนอื่น**
 * ที่ได้ connection เดิม ⇒ "บันทึกผิดคน" ซึ่งแย่กว่า "ไม่รู้ว่าใคร" สำหรับสมุดร่องรอย
 *
 * ข้อจำกัดที่ยอมรับ: การเขียนร่องรอยเป็น best-effort (ไม่ทำให้ mutation ที่สำเร็จแล้ว
 * ล้มตาม) — ถ้าเขียนไม่สำเร็จจะ log error ไว้ · ตัว `audit_logs` เป็น append-only
 * (REVOKE update/delete จาก service_role) และผูก hash chain จึงแก้ย้อนหลังไม่ได้
 */

import { after } from "next/server";
import type { NextRequest } from "next/server";

import { createAdminClient } from "@/app/api/_lib/supabase";
import type { AccountingAuth } from "@/app/api/accounting/_lib";

export type AuditEventInput = {
  /** ชื่อการกระทำเชิงธุรกิจ เช่น "journal.post" / "document.void" / "period.close" */
  action: string;
  /** ตารางปลายทาง — ใช้เป็นสายของ hash chain ต้องตรงกับตารางจริง */
  table: string;
  recordId?: string | null;
  oldData?: unknown;
  newData?: unknown;
  /**
   * DML verb ที่จะบันทึกลง `audit_logs.action` — ระบุเมื่อเดาจาก old/new ไม่ได้
   * โดยเฉพาะ **การลบที่ไม่ได้อ่านแถวเดิมมาก่อน** (ไม่มีทั้ง old และ new → เดาเป็น UPDATE
   * แล้วกรอง DELETE ที่หน้า /admin/audit จะไม่เจอการลบเลย)
   */
  dml?: "INSERT" | "UPDATE" | "DELETE";
};

/** ตัดค่าที่ไม่ควรอยู่ในสมุดร่องรอย (ยาว/ซ้ำ/ไม่ช่วยตรวจสอบ) */
const OMIT_KEYS = new Set(["pdf_base64", "file_base64", "logo_data_url", "signature_data_url"]);

function sanitize(value: unknown): unknown {
  if (value == null || typeof value !== "object") return value ?? null;
  if (Array.isArray(value)) return value.map(sanitize);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (OMIT_KEYS.has(k)) continue;
    out[k] = sanitize(v);
  }
  return out;
}

/**
 * บันทึกร่องรอย 1 เหตุการณ์ — เรียกหลัง mutation สำเร็จ
 *
 * เลื่อนงานด้วย `after()` ของ Next 15 (**ห้ามเปลี่ยนเป็น promise ลอย ๆ** — บน Vercel
 * ฟังก์ชันถูก freeze ตอนตอบ ร่องรอยจะหาย เหมือนกฎของ `recordUsage`)
 */
export function logAccountingAudit(
  auth: Pick<AccountingAuth, "userId" | "orgId" | "firm">,
  req: NextRequest,
  event: AuditEventInput,
): void {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null;
  const ua = req.headers.get("user-agent");
  const requestId = req.headers.get("x-vercel-id") ?? req.headers.get("x-request-id");

  after(async () => {
    try {
      const admin = createAdminClient();
      const { error } = await admin.rpc("log_audit_event", {
        p_org_id: auth.orgId,
        p_actor_id: auth.userId,
        p_action: event.action,
        p_table_name: event.table,
        p_record_id: event.recordId ?? null,
        p_old_data: event.oldData === undefined ? null : sanitize(event.oldData),
        p_new_data: event.newData === undefined ? null : sanitize(event.newData),
        // ไม่ null = ทำในนามสำนักงานบัญชี (ผู้ใช้ไม่ได้เป็นสมาชิก org ลูกค้า)
        p_on_behalf_of_org_id: auth.firm?.firmOrgId ?? null,
        p_ip: ip,
        p_ua: ua,
        p_request_id: requestId,
        p_dml: event.dml ?? null,
      });
      if (error) {
        console.error("[accounting/audit] เขียนร่องรอยไม่สำเร็จ", event.action, error.message);
      }
    } catch (e) {
      console.error("[accounting/audit] เขียนร่องรอยไม่สำเร็จ", event.action, String(e));
    }
  });
}
