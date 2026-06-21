/**
 * Assistant access helpers — pure functions (admin client + userId)
 *
 * แหล่งความจริงเดียวของ "ใครใช้ผู้ช่วย AI ได้" + "home org อยู่ที่ไหน"
 * ใช้ร่วมกันระหว่าง:
 *   - API guard  `requireAssistantUser` (app/api/_lib/assistant-auth.ts)
 *   - Page guard `requireAssistantPage` (lib/assistant/page-guard.ts)
 *
 * แยกออกมาเป็น pure function เพื่อให้ทั้ง Route Handler (NextRequest)
 * และ Server Component (cookies) เรียกใช้ logic ชุดเดียวกันได้
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { ASSISTANT_KINDS, enabledAssistantKinds, type AssistantKind } from "@/lib/assistant/kinds";

/**
 * resolveHomeOrg — หา "home org" ของผู้ใช้ (storage folder + tag งาน + เรียก worker)
 *   1) profiles.personal_org_id — แหล่งความจริง deterministic (เขียนโดย provisionLineUser)
 *   2) fallback membership จริง (line_active_org_id ถ้ายังเป็นสมาชิก → ไม่งั้น org แรกตาม created_at)
 */
export async function resolveHomeOrg(
  admin: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data: prof } = await admin
    .from("profiles")
    .select("personal_org_id, line_active_org_id")
    .eq("id", userId)
    .maybeSingle();
  const p = prof as { personal_org_id?: string | null; line_active_org_id?: string | null } | null;
  if (p?.personal_org_id) return p.personal_org_id;

  const { data: rows } = await admin
    .from("organization_members")
    .select("organization_id, organizations(created_at)")
    .eq("user_id", userId);
  const list = (rows ?? []) as unknown as Array<{
    organization_id: string;
    organizations: { created_at: string } | null;
  }>;
  if (!list.length) return null;
  const activeId = p?.line_active_org_id ?? null;
  if (activeId && list.some((r) => r.organization_id === activeId)) return activeId;
  const sorted = [...list].sort((a, b) =>
    (a.organizations?.created_at ?? "").localeCompare(b.organizations?.created_at ?? ""),
  );
  return sorted[0]?.organization_id ?? list[0].organization_id;
}

export type AssistantAccess =
  | { ok: true; isSuperAdmin: boolean; kinds: AssistantKind[]; orgId: string }
  | { ok: false; reason: "forbidden" | "no-home-org" };

/**
 * resolveAssistantAccess — ตรวจสิทธิ์ใช้ผู้ช่วย AI + คืน home org
 *   access = super_admin · มี grant ของ kind ใด ๆ · หรือ legacy perm bot.assistant.transcribe
 */
export async function resolveAssistantAccess(
  admin: SupabaseClient,
  userId: string,
): Promise<AssistantAccess> {
  const { data: prof } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
  const isSuperAdmin = (prof as { role?: string } | null)?.role === "super_admin";

  const kinds: AssistantKind[] = isSuperAdmin
    ? [...ASSISTANT_KINDS]
    : await enabledAssistantKinds(admin, userId);

  if (!isSuperAdmin && kinds.length === 0) {
    const { data: perm } = await admin
      .from("user_permissions")
      .select("allowed")
      .eq("user_id", userId)
      .eq("function_key", "bot.assistant.transcribe")
      .maybeSingle();
    if (!(perm as { allowed?: boolean } | null)?.allowed) {
      return { ok: false, reason: "forbidden" };
    }
  }

  const orgId = await resolveHomeOrg(admin, userId);
  if (!orgId) return { ok: false, reason: "no-home-org" };

  return { ok: true, isSuperAdmin, kinds, orgId };
}
