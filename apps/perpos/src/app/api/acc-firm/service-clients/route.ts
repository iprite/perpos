/**
 * /api/acc-firm/service-clients?orgId=<firmOrgId>
 *
 * GET   — list all service clients for the firm
 * POST  — create new client record
 * PATCH — update client record
 */

import { NextRequest, NextResponse } from "next/server";
import { requireModuleMember } from "../../_lib/module-auth";
import { createAdminClient } from "../../_lib/supabase";

export type ServiceClient = {
  id: string;
  client_code: string;
  company_name: string;
  fee_2023: number | null;
  fee_2024: number | null;
  fee_2025: number | null;
  fee_2026: number | null;
  fee_yearly: number | null;
  billing_note: string | null;
  svc_invoice: boolean;
  svc_billing: boolean;
  svc_expense: boolean;
  svc_sso: boolean;
  svc_pp30: boolean;
  svc_pnd: boolean;
  svc_pnd51: boolean;
  svc_pnd50: boolean;
  svc_close_f: boolean;
  note: string | null;
  is_active: boolean;
  created_at: string;
  // ── ข้อมูลนิติบุคคล (ใช้ที่คลังเอกสารลูกค้า) ──
  tax_id: string | null;
  entity_type: string | null;
  vat_registered: boolean;
  fiscal_year_end_month: number;
  fiscal_year_end_day: number;
  storage_location: string | null;
  dbd_relocation_notified: boolean;
  /** org ใน PERPOS ของลูกค้ารายนี้ (null = ยังไม่เชื่อมระบบ) */
  client_org_id: string | null;
  /** การเชื่อมระบบ (engagement) — มีเมื่อ client_org_id ไม่ null */
  engagement: ClientEngagement | null;
  // ── ร่องรอยการแก้ไข (updated_at เขียนโดย trigger) ──
  updated_at: string;
  updated_by: string | null;
  updated_by_name: string | null;
};

export type ClientEngagement = {
  id: string;
  status: "active" | "inactive" | "ended";
  modules_managed: string[];
  started_at: string | null;
  note: string | null;
  client_org: { id: string; name: string; slug: string };
};

export async function GET(req: NextRequest) {
  const firmOrgId = req.nextUrl.searchParams.get("orgId");
  if (!firmOrgId) return NextResponse.json({ error: "missing orgId" }, { status: 400 });

  const auth = await requireModuleMember(req, firmOrgId, "acc_firm");
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();

  // ทะเบียนลูกค้า + การเชื่อมระบบ (คนละตาราง ไม่มี FK ตรงกัน → join ด้วย client_org_id ในโค้ด)
  const [registry, engagements] = await Promise.all([
    admin
      .from("acc_firm_service_clients")
      .select("*")
      .eq("firm_org_id", firmOrgId)
      .order("client_code"),
    admin
      .from("acc_firm_clients")
      .select(
        `id, status, modules_managed, note, started_at,
         client_org:organizations!acc_firm_clients_client_org_id_fkey (id, name, slug)`,
      )
      .eq("firm_org_id", firmOrgId),
  ]);

  if (registry.error) return NextResponse.json({ error: registry.error.message }, { status: 500 });
  if (engagements.error)
    return NextResponse.json({ error: engagements.error.message }, { status: 500 });

  const byOrgId = new Map<string, ClientEngagement>();
  for (const e of (engagements.data ?? []) as unknown as ClientEngagement[]) {
    if (e.client_org?.id) byOrgId.set(e.client_org.id, e);
  }

  // ชื่อผู้แก้ไขล่าสุด (ไม่มี FK embed เพราะ profiles ถูกอ้างจากหลายคอลัมน์)
  const editorIds = Array.from(
    new Set((registry.data ?? []).map((r) => r.updated_by as string | null).filter(Boolean)),
  ) as string[];
  const editorName = new Map<string, string>();
  if (editorIds.length) {
    const { data: editors } = await admin
      .from("profiles")
      .select("id, display_name, email")
      .in("id", editorIds);
    for (const e of editors ?? [])
      editorName.set(e.id as string, (e.display_name as string) || (e.email as string) || "—");
  }

  const rows = (registry.data ?? []).map((r) => ({
    ...r,
    engagement: r.client_org_id ? (byOrgId.get(r.client_org_id) ?? null) : null,
    updated_by_name: r.updated_by ? (editorName.get(r.updated_by as string) ?? null) : null,
  }));

  // canWrite = ฝั่ง UI ซ่อนปุ่มให้ตรงกับด่านจริงใน POST/PATCH (สิทธิ์อ่านอย่างเดียวแก้ไม่ได้)
  return NextResponse.json({ clients: rows, canWrite: auth.moduleRole !== "viewer" });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { orgId, ...rest } = body;
  if (!orgId) return NextResponse.json({ error: "missing orgId" }, { status: 400 });

  const auth = await requireModuleMember(req, orgId, "acc_firm");
  if (!auth.ok) return auth.res;
  // ทะเบียนลูกค้าผูกกับค่าบริการ/เลขผู้เสียภาษี → สิทธิ์อ่านอย่างเดียวห้ามแก้ (เท่ากับ petty-cash/ocr/vault)
  if (auth.moduleRole === "viewer")
    return NextResponse.json({ error: "ไม่มีสิทธิ์เพิ่มลูกค้า" }, { status: 403 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("acc_firm_service_clients")
    .insert({ firm_org_id: orgId, updated_by: auth.userId, ...sanitize(rest) })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { orgId, id, ...rest } = body;
  if (!orgId || !id) return NextResponse.json({ error: "missing orgId or id" }, { status: 400 });

  const auth = await requireModuleMember(req, orgId, "acc_firm");
  if (!auth.ok) return auth.res;
  if (auth.moduleRole === "viewer")
    return NextResponse.json({ error: "ไม่มีสิทธิ์แก้ไขข้อมูลลูกค้า" }, { status: 403 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("acc_firm_service_clients")
    // updated_at เขียนโดย trigger — ที่นี่ใส่แค่ "ใครแก้"
    .update({ ...sanitize(rest), updated_by: auth.userId })
    .eq("id", id)
    .eq("firm_org_id", orgId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

function sanitize(body: Record<string, unknown>) {
  const numFields = ["fee_2023", "fee_2024", "fee_2025", "fee_2026", "fee_yearly"] as const;
  const out: Record<string, unknown> = { ...body };
  // การเชื่อม org (client_org_id) เปลี่ยนได้ทาง /api/acc-firm/clients เท่านั้น (super_admin)
  // และ engagement เป็นข้อมูลอ่านอย่างเดียวที่ GET ประกอบให้
  delete out.client_org_id;
  delete out.engagement;
  delete out.firm_org_id;
  delete out.id;
  // ร่องรอยการแก้ไข — เซ็ตจากฝั่งเซิร์ฟเวอร์เท่านั้น (updated_at มี trigger คุม)
  delete out.updated_at;
  delete out.updated_by;
  delete out.updated_by_name;
  delete out.created_at;
  for (const f of numFields) {
    if (f in out) {
      const v = out[f];
      out[f] = v !== null && v !== "" ? Number(v) : null;
    }
  }
  // วันสิ้นรอบบัญชีเป็น smallint NOT NULL — ฟอร์มส่งมาเป็น string
  for (const f of ["fiscal_year_end_month", "fiscal_year_end_day"] as const) {
    if (f in out) {
      const n = Number(out[f]);
      if (Number.isFinite(n) && n > 0) out[f] = n;
      else delete out[f];
    }
  }
  // ข้อความว่าง = ยังไม่ระบุ (null) ไม่ใช่สตริงว่าง
  for (const f of ["tax_id", "entity_type", "storage_location"] as const) {
    if (f in out && (out[f] === "" || out[f] === undefined)) out[f] = null;
  }
  return out;
}

/**
 * DELETE /api/acc-firm/service-clients  { orgId, id }
 *
 * ลบลูกค้าออกจากทะเบียนถาวร — ใช้กับรายที่ "กรอกผิด/ซ้ำ" เท่านั้น
 * ลบได้ก็ต่อเมื่อ **ยังไม่มีอะไรผูกอยู่เลย**: ไม่มีเอกสาร/งวด/checklist/ทะเบียนรับ-ส่ง/
 * incident ในคลังเอกสาร และไม่ได้เชื่อมกับ org (เลิกเชื่อมก่อน)
 * ลูกค้าที่เคยทำงานด้วยจริงให้ปิดเป็น "ยกเลิก" (is_active=false) แทน — ห้ามลบประวัติ
 */
export async function DELETE(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const orgId = typeof body?.orgId === "string" ? body.orgId : "";
  const id = typeof body?.id === "string" ? body.id : "";
  if (!orgId || !id) return NextResponse.json({ error: "missing orgId or id" }, { status: 400 });

  const auth = await requireModuleMember(req, orgId, "acc_firm");
  if (!auth.ok) return auth.res;
  if (auth.moduleRole === "viewer")
    return NextResponse.json({ error: "ไม่มีสิทธิ์ลบลูกค้า" }, { status: 403 });

  const admin = createAdminClient();

  const { data: client } = await admin
    .from("acc_firm_service_clients")
    .select("id, company_name, client_org_id")
    .eq("id", id)
    .eq("firm_org_id", orgId)
    .maybeSingle();
  if (!client) return NextResponse.json({ error: "ไม่พบลูกค้ารายนี้" }, { status: 404 });
  if (client.client_org_id)
    return NextResponse.json(
      { error: "ลูกค้ารายนี้เชื่อมกับระบบอยู่ — ต้องเลิกเชื่อมก่อนจึงจะลบได้" },
      { status: 409 },
    );

  // นับของที่ผูกอยู่ทุกตาราง (FK ของ acc_firm_service_clients) ก่อนลบ
  const related = [
    { table: "acc_firm_vault_documents", label: "เอกสารในคลัง" },
    { table: "acc_firm_vault_periods", label: "งวดเอกสาร" },
    { table: "acc_firm_vault_checklist", label: "รายการเอกสารที่ต้องเก็บ" },
    { table: "acc_firm_vault_custody_log", label: "ทะเบียนรับ-ส่ง" },
    { table: "acc_firm_vault_incidents", label: "บันทึกเหตุการณ์" },
  ] as const;

  const blockers: string[] = [];
  for (const r of related) {
    const { count, error } = await admin
      .from(r.table)
      .select("id", { count: "exact", head: true })
      .eq("client_id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if ((count ?? 0) > 0) blockers.push(`${r.label} ${count} รายการ`);
  }

  if (blockers.length)
    return NextResponse.json(
      {
        error: `ลบไม่ได้ — ลูกค้ารายนี้มี ${blockers.join(" · ")} · ให้ปิดเป็น "ยกเลิก" แทน`,
      },
      { status: 409 },
    );

  const { error: delErr } = await admin
    .from("acc_firm_service_clients")
    .delete()
    .eq("id", id)
    .eq("firm_org_id", orgId);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
