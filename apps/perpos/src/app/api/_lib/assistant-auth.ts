/**
 * requireAssistantUser — guard ผู้ช่วย AI (assistant) แบบ per-profile
 *
 * ต่างจาก requireModuleMember (org-scoped) — assistant เป็นบริการระดับบุคคล:
 *   umbrella access = มี grant ของ kind ใด ๆ ใน ASSISTANT_KINDS (ดู lib/assistant/kinds)
 *            หรือ user_permissions('bot.assistant.transcribe')
 *            หรือ super_admin
 *
 * ยังคืน `orgId` = "home org" ของผู้ใช้ (ใช้เป็น storage folder + tag งาน + เรียก worker)
 * โดยไม่ต้องมี org ใน URL — อ่านจาก profiles.personal_org_id (fallback membership จริง)
 */

import { NextRequest, NextResponse } from "next/server";
import { extractBearer, requireUser } from "./auth";
import { createAdminClient, createAuthedClient } from "./supabase";
import { type AssistantKind } from "@/lib/assistant/kinds";
import { resolveAssistantAccess } from "@/lib/assistant/access";

export interface AssistantAuth {
  ok: true;
  userId: string;
  /** home org สำหรับ storage/worker/tag (ไม่โผล่ใน URL) */
  orgId: string;
  isSuperAdmin: boolean;
  /** kind ที่ผู้ใช้มีสิทธิ์ใช้ (super_admin = ทุก kind) — สำหรับ routing ต่อ kind */
  kinds: AssistantKind[];
  rls: ReturnType<typeof createAuthedClient>;
}
type AuthFailure = { ok: false; res: NextResponse };

export async function requireAssistantUser(req: NextRequest): Promise<AssistantAuth | AuthFailure> {
  const auth = await requireUser(req);
  if (!auth.ok) return { ok: false, res: auth.res };

  const admin = createAdminClient();
  const rls = createAuthedClient(extractBearer(req)!);

  const access = await resolveAssistantAccess(admin, auth.userId);
  if (!access.ok) {
    return access.reason === "forbidden"
      ? {
          ok: false,
          res: NextResponse.json({ error: "ไม่มีสิทธิ์ใช้งานผู้ช่วย AI" }, { status: 403 }),
        }
      : {
          ok: false,
          res: NextResponse.json(
            { error: "ไม่พบพื้นที่สำหรับเก็บงาน — กรุณาติดต่อผู้ดูแล" },
            { status: 409 },
          ),
        };
  }

  return {
    ok: true,
    userId: auth.userId,
    orgId: access.orgId,
    isSuperAdmin: access.isSuperAdmin,
    kinds: access.kinds,
    rls,
  };
}
