// GET /api/gov-procure/catalog-letterheads?orgId=  → ค่าตั้งต้นหัวจดหมายทุกบริษัท (member)
// PUT /api/gov-procure/catalog-letterheads?orgId=  → ตั้งค่าของ 1 บริษัท (**canManageSettings**)
//
// contract: §5.9 C-B3 — **ที่เดียวในฟีเจอร์ที่ใช้ `canManageSettings`** (ค่าตั้งต้นระดับบริษัท) ·
//           การแก้ snapshot รายชุดไปกับ `PUT /catalogs/[id]` (canWrite) · C1 (1 แถว/บริษัท/org) · A-6 (โลโก้)

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../_lib/supabase";
import { setAuditContext } from "../../_lib/audit";
import { requireGovProcureMember, canManageSettings, orgIdFromQuery, govError } from "../_lib";
import { isValidLogoDataUrl } from "@/lib/gov-procure/catalog-html";
import { COMPANIES } from "@/lib/gov-procure/types";
import type { Letterhead } from "@/lib/gov-procure/catalog";

function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => String(x ?? "").trim())
    .filter((s) => s.length > 0)
    .slice(0, 6);
}

export async function GET(req: NextRequest) {
  const orgId = orgIdFromQuery(req);
  if (!orgId) return govError("missing orgId");

  const auth = await requireGovProcureMember(req, orgId);
  if (!auth.ok) return auth.res;

  const company = req.nextUrl.searchParams.get("company");

  try {
    let q = createAdminClient()
      .from("gov_procure_catalog_letterheads")
      .select("*")
      .eq("org_id", orgId);
    if (company) q = q.eq("company", company);

    const { data, error } = await q.order("company", { ascending: true });
    if (error) return govError(error.message, 500);

    return NextResponse.json({ letterheads: (data ?? []) as Letterhead[] });
  } catch (e) {
    return govError((e as Error).message, 500);
  }
}

export async function PUT(req: NextRequest) {
  const orgId = orgIdFromQuery(req);
  if (!orgId) return govError("missing orgId");

  const auth = await requireGovProcureMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canManageSettings(auth.role)) {
    return govError("ไม่มีสิทธิ์ตั้งค่าหัวจดหมายของบริษัท (เฉพาะเจ้าของ/ผู้จัดการ)", 403);
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const company = typeof body.company === "string" ? body.company.trim() : "";
  if (!(COMPANIES as readonly string[]).includes(company)) return govError("ไม่รู้จักบริษัทนี้");

  const companyName = typeof body.company_name === "string" ? body.company_name.trim() : "";
  if (!companyName) return govError("กรุณาระบุชื่อบริษัทที่จะพิมพ์บนหัวจดหมาย");

  // A-6 — โลโก้ต้องเป็น data URL ที่ผ่าน regex + ≤500KB ไม่งั้นปฏิเสธไปเลย (ไม่เก็บของเสีย)
  const logoRaw = typeof body.logo_data_url === "string" ? body.logo_data_url.trim() : "";
  if (logoRaw && !isValidLogoDataUrl(logoRaw)) {
    return govError("ไฟล์โลโก้ไม่ถูกต้อง — ต้องเป็นรูป PNG/JPEG/WebP ขนาดไม่เกิน 500KB");
  }

  const payload = {
    company_name: companyName,
    address_lines: toStringArray(body.address_lines),
    phone: typeof body.phone === "string" && body.phone.trim() ? body.phone.trim() : null,
    tax_id: typeof body.tax_id === "string" && body.tax_id.trim() ? body.tax_id.trim() : null,
    logo_data_url: logoRaw || null,
  };

  const admin = createAdminClient();

  try {
    // A-12 — อ่านด้วย .eq('org_id').eq('company') คิวรีเดียว
    const { data: existing, error: readErr } = await admin
      .from("gov_procure_catalog_letterheads")
      .select("id")
      .eq("org_id", orgId)
      .eq("company", company)
      .maybeSingle();
    if (readErr) return govError(readErr.message, 500);

    await setAuditContext(req, auth.userId, orgId);

    if (existing) {
      const { data, error } = await admin
        .from("gov_procure_catalog_letterheads")
        .update(payload)
        .eq("id", (existing as { id: string }).id)
        .eq("org_id", orgId)
        .select("*")
        .maybeSingle();
      if (error) return govError(error.message, 500);
      return NextResponse.json({ letterhead: data as Letterhead });
    }

    const { data, error } = await admin
      .from("gov_procure_catalog_letterheads")
      .insert({ ...payload, org_id: orgId, company, created_by: auth.userId })
      .select("*")
      .single();

    if (error) {
      if (error.code === "23505") return govError("มีการตั้งค่าของบริษัทนี้อยู่แล้ว", 409);
      return govError(error.message, 500);
    }

    return NextResponse.json({ letterhead: data as Letterhead }, { status: 201 });
  } catch (e) {
    return govError((e as Error).message, 500);
  }
}
