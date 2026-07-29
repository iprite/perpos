/**
 * _lib.ts — ของที่ route ของ vault ใช้ร่วมกัน
 *
 * ⚠️ ห้ามย้ายไปไว้ใน `route.ts` — Next.js อนุญาตให้ route ไฟล์ export เฉพาะ handler/route-config
 * (ของอื่นทำให้ `tsc` พังที่ `.next/types` ด้วย error ที่ไม่ชี้ต้นเหตุ — LESSONS 2026-07-29)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireModuleMember } from "../../_lib/module-auth";
import { createAdminClient } from "../../_lib/supabase";
import { setAuditContext } from "../../_lib/audit";
import { VaultError } from "@/lib/acc-firm/vault/documents";

export type VaultCtx = {
  ok: true;
  firmOrgId: string;
  userId: string;
  moduleRole: string;
  canWrite: boolean;
  db: ReturnType<typeof createAdminClient>;
};

/**
 * guard มาตรฐานของ vault — ท่าเดียวกับ route อื่นใน acc_firm (spec D4):
 * `requireModuleMember` ก่อน แล้วจึงใช้ service-role client (firm ไม่ได้เป็นสมาชิก org ลูกค้า)
 */
export async function requireVault(
  req: NextRequest,
  opts: { write?: boolean } = {},
): Promise<VaultCtx | { ok: false; res: NextResponse }> {
  const firmOrgId = req.nextUrl.searchParams.get("orgId");
  if (!firmOrgId) {
    return { ok: false, res: NextResponse.json({ error: "missing orgId" }, { status: 400 }) };
  }

  const auth = await requireModuleMember(req, firmOrgId, "acc_firm");
  if (!auth.ok) return { ok: false, res: auth.res };

  const canWrite = auth.moduleRole !== "viewer";
  if (opts.write && !canWrite) {
    return {
      ok: false,
      res: NextResponse.json({ error: "สิทธิ์ไม่พอสำหรับการแก้ไข" }, { status: 403 }),
    };
  }

  if (opts.write) await setAuditContext(req, auth.userId, firmOrgId);

  return {
    ok: true,
    firmOrgId,
    userId: auth.userId,
    moduleRole: auth.moduleRole,
    canWrite,
    db: createAdminClient(),
  };
}

/** แปลง error เป็น response ภาษาไทย — VaultError พก status มาเอง */
export function vaultErrorResponse(e: unknown): NextResponse {
  if (e instanceof VaultError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  const message = e instanceof Error ? e.message : "เกิดข้อผิดพลาด";
  return NextResponse.json({ error: message }, { status: 500 });
}

/** ip/user-agent สำหรับ access log (PDPA) */
export function requestMeta(req: NextRequest) {
  return {
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: req.headers.get("user-agent"),
  };
}
