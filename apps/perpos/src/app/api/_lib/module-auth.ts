/**
 * requireModuleMember — generic per-module auth guard
 *
 * Checks:
 *   1. Valid JWT (requireUser)
 *   2. The module is enabled for the org (org_module_settings)
 *   3. The user is an active member of that module (module_members)
 *
 * Super-admins (profiles.role = 'super_admin') bypass checks 2 & 3
 * and receive moduleRole = 'owner'.
 */

import { NextRequest, NextResponse } from "next/server";
import { extractBearer, requireUser } from "./auth";
import { createAdminClient, createAuthedClient } from "./supabase";
import { resolveFirmAccess, type FirmAccess } from "@/lib/acc-firm/firm-access";

export interface ModuleAuth {
  ok: true;
  userId: string;
  orgId: string;
  moduleKey: string;
  moduleRole: string;
  isSuperAdmin: boolean;
  /**
   * ไม่ null = เข้ามาในนามสำนักงานบัญชี (ไม่ได้เป็นสมาชิก org นี้) — ผู้เรียกที่เขียน
   * audit log ต้องบันทึก `firm.firmOrgId` กำกับด้วยว่า "ใครทำในนามใคร"
   */
  firm: FirmAccess | null;
  /** Authed Supabase client (respects RLS) */
  rls: ReturnType<typeof createAuthedClient>;
}

type AuthFailure = { ok: false; res: NextResponse };

export async function requireModuleMember(
  req: NextRequest,
  orgId: string,
  moduleKey: string,
): Promise<ModuleAuth | AuthFailure> {
  const auth = await requireUser(req);
  if (!auth.ok) return { ok: false, res: auth.res };

  const token = extractBearer(req)!;
  const rls = createAuthedClient(token);
  const admin = createAdminClient();

  // Super-admins bypass module membership entirely
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", auth.userId)
    .maybeSingle();

  if ((profile as Record<string, unknown> | null)?.role === "super_admin") {
    return {
      ok: true,
      userId: auth.userId,
      orgId,
      moduleKey,
      moduleRole: "owner",
      isSuperAdmin: true,
      firm: null,
      rls,
    };
  }

  // Check module is enabled for this org
  const { data: modSetting } = await admin
    .from("org_module_settings")
    .select("is_enabled")
    .eq("organization_id", orgId)
    .eq("module_key", moduleKey)
    .maybeSingle();

  if (!(modSetting as Record<string, unknown> | null)?.is_enabled) {
    return {
      ok: false,
      res: NextResponse.json(
        { error: `Module '${moduleKey}' ไม่ได้เปิดใช้งานสำหรับองค์กรนี้` },
        { status: 403 },
      ),
    };
  }

  // Check per-module membership
  const { data: member } = await admin
    .from("module_members")
    .select("module_role")
    .eq("org_id", orgId)
    .eq("module_key", moduleKey)
    .eq("user_id", auth.userId)
    .eq("is_active", true)
    .maybeSingle();

  // ไม่ได้เป็นสมาชิกโมดูลของ org นี้ → ยังเข้าได้ถ้าเป็นสำนักงานบัญชีที่มี engagement active
  // กับ org นี้ (ดู lib/acc-firm/firm-access.ts) · membership จริงชนะเสมอ จึงลองทีหลัง
  let firm: FirmAccess | null = null;
  if (!member) {
    firm = await resolveFirmAccess(admin, auth.userId, orgId, moduleKey);
    if (!firm) {
      return {
        ok: false,
        res: NextResponse.json(
          { error: `ไม่มีสิทธิ์เข้าถึง module '${moduleKey}'` },
          { status: 403 },
        ),
      };
    }
  }

  const method = (req.method ?? "GET").toUpperCase();
  const isMutating =
    method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";
  if (isMutating) {
    const [{ data: org }, { data: billing }] = await Promise.all([
      admin.from("organizations").select("maintenance_mode").eq("id", orgId).maybeSingle(),
      admin
        .from("org_billing")
        .select("payment_status, overdue_count")
        .eq("org_id", orgId)
        .maybeSingle(),
    ]);

    if ((org as Record<string, unknown> | null)?.maintenance_mode === true) {
      return {
        ok: false,
        res: NextResponse.json({ error: "maintenance_mode" }, { status: 503 }),
      };
    }

    const row = billing as Record<string, unknown> | null;
    const isOverdue = String(row?.payment_status ?? "") === "overdue";
    const overdueCount = Number(row?.overdue_count ?? 0);
    if (isOverdue && overdueCount >= 2) {
      return {
        ok: false,
        res: NextResponse.json({ error: "billing_overdue_readonly" }, { status: 402 }),
      };
    }
  }

  return {
    ok: true,
    userId: auth.userId,
    orgId,
    moduleKey,
    moduleRole: firm ? firm.moduleRole : (member as Record<string, string>).module_role,
    isSuperAdmin: false,
    firm,
    rls,
  };
}
