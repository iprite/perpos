import { NextRequest, NextResponse } from "next/server";
import { createAuthedClient } from "../_lib/supabase";
import { requireModuleMember } from "../_lib/module-auth";
import { canModuleWrite } from "@/lib/modules";
import { BI_ROLES, isBiRole, type BiRole } from "@/lib/bi/types";

export const BI_MODULE_KEY = "bi";

export interface BiAuth {
  ok: true;
  userId: string;
  orgId: string;
  role: BiRole;
  /** Authed Supabase client (respects RLS) — ห้ามใช้ service-role กับข้อมูล per-org */
  rls: ReturnType<typeof createAuthedClient>;
}

/** Require user to be an active member of the BI module for this org.
 *  Delegates to the generic requireModuleMember() registry checker
 *  (ท่าเดียวกับ api/tmc/_lib.ts). orgId ต้อง resolve ฝั่งเซิร์ฟเวอร์เสมอ.
 */
export async function requireBiMember(
  req: NextRequest,
  orgId: string,
): Promise<BiAuth | { ok: false; res: NextResponse }> {
  const result = await requireModuleMember(req, orgId, BI_MODULE_KEY);
  if (!result.ok) return result;

  // role ที่ไม่อยู่ใน BI_ROLES (เช่น 'manager' ที่ seed มาจากโมดูลอื่น) จะทำให้ RPC
  // RAISE ทุกคำถาม แล้วผู้ใช้เห็นแค่ "ไม่มีสิทธิ์ดูตัวชี้วัดนี้" โดยไม่รู้สาเหตุจริง
  // → ปฏิเสธตั้งแต่ด่านนี้พร้อมบอกสาเหตุให้ผู้ดูแลแก้ถูกจุด
  if (!isBiRole(result.moduleRole)) {
    return {
      ok: false,
      res: NextResponse.json(
        {
          error:
            `บทบาท "${result.moduleRole}" ยังไม่ได้ตั้งค่าสำหรับผู้ช่วยวิเคราะห์ธุรกิจ ` +
            `กรุณาให้ผู้ดูแลระบบตั้งบทบาทเป็น ${BI_ROLES.join(" / ")}`,
        },
        { status: 403 },
      ),
    };
  }

  return {
    ok: true,
    userId: result.userId,
    orgId: result.orgId,
    role: result.moduleRole,
    rls: result.rls,
  };
}

/** owner/analyst เขียนได้ (สร้าง thread, ให้ feedback, ปักหมุด) · viewer อ่านอย่างเดียว */
export function canWriteBi(role: BiRole): boolean {
  return canModuleWrite(BI_MODULE_KEY, role);
}

/** 403 มาตรฐานเมื่อ role ไม่มีสิทธิ์เขียน (ข้อความไทยที่ผู้ใช้อ่านรู้เรื่อง) */
export function biForbiddenWrite(): NextResponse {
  return NextResponse.json(
    { error: "บทบาทของคุณไม่มีสิทธิ์บันทึกข้อมูลในผู้ช่วยวิเคราะห์ธุรกิจ" },
    { status: 403 },
  );
}

/** ดึง orgId จาก query string ของ GET route — คืน null พร้อม 400 ให้ caller จัดการ */
export function readOrgId(req: NextRequest): string | null {
  const orgId = req.nextUrl.searchParams.get("orgId");
  return orgId && orgId.trim() ? orgId.trim() : null;
}

export function missingOrgId(): NextResponse {
  return NextResponse.json({ error: "ต้องระบุองค์กร (orgId)" }, { status: 400 });
}
