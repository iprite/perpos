/**
 * GET  /api/acc-firm/clients?orgId=<firmOrgId>
 *   — รายการ client orgs ที่ firm นี้ดูแลอยู่ (firm member อ่านได้)
 *
 * POST /api/acc-firm/clients
 *   — เพิ่ม engagement ใหม่ — **super_admin เท่านั้น** (SEC-1: B2B provision model)
 *   body: { firmOrgId, clientOrgId, modulesManaged?, note?, startedAt? }
 *
 * PATCH /api/acc-firm/clients/:id
 *   — อัปเดต status / note / modulesManaged — **super_admin เท่านั้น**
 *
 * DELETE /api/acc-firm/clients
 *   — เลิกเชื่อมลูกค้ากับ org — **super_admin เท่านั้น**
 *   body: { firmOrgId, id }
 *   ลบ engagement + **ถอนสิทธิ์ทีมสำนักงานออกจาก org ลูกค้าทั้งหมด** + ปลด client_org_id
 *   ในทะเบียน (ถ้าเหลือสิทธิ์ค้าง = ทีมยังอ่านงบลูกค้าที่เลิกดูแลแล้วได้ → ห้ามเด็ดขาด)
 *
 * เหตุผล: engagement = "firm X ดูแลบัญชี org Y" → ให้ firm member self-serve เพิ่ม org
 * ใดก็ได้ = cross-tenant data leak (อ่านงบ org ที่ไม่ใช่ลูกค้าจริง). super_admin คุม
 * เหมือน admin/modules (B2B). firm member ใช้ engagement ที่มี + provision ทีมตัวเอง.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireModuleMember } from "../../_lib/module-auth";
import { requireAdmin } from "../../_lib/auth";
import { createAdminClient } from "../../_lib/supabase";
import { firmRoleFor } from "@/lib/acc-firm/provision-roles";

// ── GET ───────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const firmOrgId = req.nextUrl.searchParams.get("orgId");
  if (!firmOrgId) return NextResponse.json({ error: "missing orgId" }, { status: 400 });

  const auth = await requireModuleMember(req, firmOrgId, "acc_firm");
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("acc_firm_clients")
    .select(
      `
      id, status, modules_managed, note, started_at, created_at,
      client_org:organizations!acc_firm_clients_client_org_id_fkey (
        id, name, slug
      )
    `,
    )
    .eq("firm_org_id", firmOrgId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ clients: data });
}

// ── POST ──────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const { firmOrgId, clientOrgId, serviceClientId, modulesManaged, note, startedAt } = body ?? {};

  if (!firmOrgId || typeof firmOrgId !== "string")
    return NextResponse.json({ error: "missing firmOrgId" }, { status: 400 });
  if (!clientOrgId || typeof clientOrgId !== "string")
    return NextResponse.json({ error: "missing clientOrgId" }, { status: 400 });
  // invariant: engagement ต้องเกิดจากลูกค้าที่มีอยู่ในทะเบียน (ทะเบียน = แหล่งเดียวของลูกค้า)
  if (!serviceClientId || typeof serviceClientId !== "string")
    return NextResponse.json({ error: "missing serviceClientId" }, { status: 400 });

  // SEC-1: สร้าง engagement = super_admin เท่านั้น
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();

  // ตรวจ client org มีจริงไหม
  const { data: clientOrg } = await admin
    .from("organizations")
    .select("id, name")
    .eq("id", clientOrgId)
    .maybeSingle();
  if (!clientOrg) return NextResponse.json({ error: "ไม่พบ client org" }, { status: 404 });

  // ตรวจแถวทะเบียนของ firm นี้ + ยังไม่ถูกผูกกับ org อื่น
  const { data: registryRow } = await admin
    .from("acc_firm_service_clients")
    .select("id, client_org_id")
    .eq("id", serviceClientId)
    .eq("firm_org_id", firmOrgId)
    .maybeSingle();
  if (!registryRow) return NextResponse.json({ error: "ไม่พบลูกค้าในทะเบียน" }, { status: 404 });
  if (registryRow.client_org_id && registryRow.client_org_id !== clientOrgId)
    return NextResponse.json({ error: "ลูกค้ารายนี้เชื่อมกับ org อื่นอยู่แล้ว" }, { status: 409 });

  const modules = Array.isArray(modulesManaged) ? modulesManaged : ["accounting"];

  const { data, error } = await admin
    .from("acc_firm_clients")
    .insert({
      firm_org_id: firmOrgId,
      client_org_id: clientOrgId,
      modules_managed: modules,
      note: typeof note === "string" ? note : null,
      started_at: typeof startedAt === "string" ? startedAt : null,
    })
    .select(
      `
      id, status, modules_managed, note, started_at, created_at,
      client_org:organizations!acc_firm_clients_client_org_id_fkey (
        id, name, slug
      )
    `,
    )
    .single();

  if (error) {
    if (error.code === "23505")
      return NextResponse.json({ error: "org นี้เป็น client อยู่แล้ว" }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // ผูกแถวทะเบียนเข้ากับ org (unique partial index กัน org ซ้ำในทะเบียนเดียวกัน)
  const { error: linkError } = await admin
    .from("acc_firm_service_clients")
    .update({ client_org_id: clientOrgId })
    .eq("id", serviceClientId)
    .eq("firm_org_id", firmOrgId);
  if (linkError) {
    // rollback engagement ที่เพิ่งสร้าง — ไม่งั้นจะกลายเป็น engagement กำพร้า (ผิด invariant)
    await admin
      .from("acc_firm_clients")
      .delete()
      .eq("id", (data as { id: string }).id);
    return NextResponse.json({ error: linkError.message }, { status: 500 });
  }

  return NextResponse.json({ client: data }, { status: 201 });
}

// ── PATCH ─────────────────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const { id, firmOrgId, status, note, modulesManaged } = body ?? {};

  if (!id || typeof id !== "string" || !firmOrgId || typeof firmOrgId !== "string")
    return NextResponse.json({ error: "missing id or firmOrgId" }, { status: 400 });

  // SEC-1: แก้ไข engagement = super_admin เท่านั้น
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const updates: Record<string, unknown> = {};
  if (status && ["active", "inactive", "ended"].includes(status as string)) updates.status = status;
  if (typeof note === "string") updates.note = note;
  if (Array.isArray(modulesManaged)) updates.modules_managed = modulesManaged;

  if (Object.keys(updates).length === 0)
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("acc_firm_clients")
    .update(updates)
    .eq("id", id)
    .eq("firm_org_id", firmOrgId)
    .select(
      `
      id, status, modules_managed, note, started_at, created_at,
      client_org:organizations!acc_firm_clients_client_org_id_fkey (
        id, name, slug
      )
    `,
    )
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ client: data });
}

// ── DELETE ────────────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const { id, firmOrgId } = body ?? {};

  if (!id || typeof id !== "string" || !firmOrgId || typeof firmOrgId !== "string")
    return NextResponse.json({ error: "missing id or firmOrgId" }, { status: 400 });

  // SEC-1: เลิกเชื่อม = แตะสิทธิ์ข้าม org → super_admin เท่านั้น (เท่ากับตอนสร้าง)
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();

  const { data: engagement } = await admin
    .from("acc_firm_clients")
    .select("id, client_org_id, modules_managed")
    .eq("id", id)
    .eq("firm_org_id", firmOrgId)
    .maybeSingle();
  if (!engagement) return NextResponse.json({ error: "ไม่พบการเชื่อมระบบนี้" }, { status: 404 });

  const clientOrgId = engagement.client_org_id as string;
  const modules = (engagement.modules_managed as string[]) ?? [];

  // 1. ถอนสิทธิ์ที่ "สำนักงานได้รับจากการเชื่อม" ออกจาก org ลูกค้า
  //
  //    ⚠️ ห้ามถอนแบบเหมารวมทุกแถวของสมาชิกสำนักงาน — คนคนเดียวกันอาจเป็นเจ้าของ org
  //    ลูกค้าเองด้วย (เช่น เจ้าของกิจการที่เป็นสมาชิกสำนักงาน) การถอนเหมาจะฆ่าสิทธิ์
  //    ที่เขามีมาแต่เดิม. เกณฑ์: ถอนเฉพาะแถวที่ "หน้าตาเหมือนของที่ provision ให้"
  //    = module_role ตรงกับ firmRoleFor(module) และ organization_members.role='team_member'
  const { data: firmMembers } = await admin
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", firmOrgId);
  const firmUserIds = (firmMembers ?? []).map((m) => m.user_id as string);

  let revoked = 0;
  if (firmUserIds.length && modules.length) {
    for (const moduleKey of modules) {
      const { data: rows, error: mmErr } = await admin
        .from("module_members")
        .update({ is_active: false })
        .eq("org_id", clientOrgId)
        .eq("module_key", moduleKey)
        .eq("module_role", firmRoleFor(moduleKey))
        .in("user_id", firmUserIds)
        .select("user_id");
      if (mmErr) return NextResponse.json({ error: mmErr.message }, { status: 500 });
      revoked += rows?.length ?? 0;
    }

    // 2. เอาออกจาก organization_members ของ org ลูกค้า — เฉพาะแถวที่ provision สร้าง
    //    (role='team_member') และเฉพาะคนที่ไม่เหลือโมดูล active ใน org นั้นแล้ว
    const { data: stillActive } = await admin
      .from("module_members")
      .select("user_id")
      .eq("org_id", clientOrgId)
      .in("user_id", firmUserIds)
      .eq("is_active", true);
    const keep = new Set((stillActive ?? []).map((m) => m.user_id as string));
    const removable = firmUserIds.filter((u) => !keep.has(u));
    if (removable.length) {
      await admin
        .from("organization_members")
        .delete()
        .eq("organization_id", clientOrgId)
        .in("user_id", removable)
        .eq("role", "team_member");
    }
  }

  // 3. ปลดการผูกในทะเบียน แล้วค่อยลบ engagement
  const { error: unlinkErr } = await admin
    .from("acc_firm_service_clients")
    .update({ client_org_id: null })
    .eq("firm_org_id", firmOrgId)
    .eq("client_org_id", clientOrgId);
  if (unlinkErr) return NextResponse.json({ error: unlinkErr.message }, { status: 500 });

  const { error: delErr } = await admin
    .from("acc_firm_clients")
    .delete()
    .eq("id", id)
    .eq("firm_org_id", firmOrgId);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, revokedGrants: revoked });
}
