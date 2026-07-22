// GET  /api/gov-procure/catalogs?orgId=      → list ชุดแคตตาล็อก + KPI (member)
// POST /api/gov-procure/catalogs?orgId=      → สร้างชุดใหม่ (canWrite)
// contract: specs/gov-procure-catalog.md §5.9 C-B3 (guard) · C1/C-6 (letterhead snapshot) · C-B4 (stats)

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../_lib/supabase";
import { setAuditContext } from "../../_lib/audit";
import { requireGovProcureMember, canWrite, orgIdFromQuery, govError } from "../_lib";
import { loadLetterheadSnapshot, orderBelongsToOrg } from "../_catalog-lib";
import { listCatalogs, getCatalogListStats, type CatalogStatus } from "@/lib/gov-procure/catalog";
import { COMPANIES } from "@/lib/gov-procure/types";

const TEMPLATES = ["table", "narrative"] as const;
const STATUSES: CatalogStatus[] = ["draft", "enriching", "review", "approved"];

export async function GET(req: NextRequest) {
  const orgId = orgIdFromQuery(req);
  if (!orgId) return govError("missing orgId");

  const auth = await requireGovProcureMember(req, orgId);
  if (!auth.ok) return auth.res;

  const sp = req.nextUrl.searchParams;
  const statusParam = sp.get("status");
  const status =
    statusParam && STATUSES.includes(statusParam as CatalogStatus)
      ? (statusParam as CatalogStatus)
      : undefined;

  try {
    const admin = createAdminClient();
    const page = await listCatalogs(admin, orgId, {
      status,
      orderId: sp.get("orderId") ?? undefined,
      limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
      offset: sp.get("offset") ? Number(sp.get("offset")) : undefined,
    });

    // stats=0 = ข้ามการคำนวณ KPI (ใช้ตอน dropdown เลือกชุด)
    const stats = sp.get("stats") === "0" ? null : await getCatalogListStats(admin, orgId);

    return NextResponse.json({
      catalogs: page.rows,
      total: page.total,
      truncated: page.truncated,
      stats,
    });
  } catch (e) {
    return govError((e as Error).message, 500);
  }
}

export async function POST(req: NextRequest) {
  const orgId = orgIdFromQuery(req);
  if (!orgId) return govError("missing orgId");

  const auth = await requireGovProcureMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWrite(auth.role)) return govError("ไม่มีสิทธิ์สร้างชุดแคตตาล็อก", 403);

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return govError("กรุณาระบุชื่อชุดแคตตาล็อก");

  const companyRaw = typeof body.company === "string" ? body.company.trim() : "";
  if (companyRaw && !(COMPANIES as readonly string[]).includes(companyRaw)) {
    return govError("ไม่รู้จักบริษัทนี้");
  }
  const company = companyRaw || null;

  const templateRaw = typeof body.template === "string" ? body.template : "table";
  if (!(TEMPLATES as readonly string[]).includes(templateRaw)) {
    return govError("รูปแบบเอกสารไม่ถูกต้อง");
  }

  const orderId = typeof body.order_id === "string" && body.order_id ? body.order_id : null;

  const admin = createAdminClient();

  // G3 — order ของ org อื่นถูกอ้างได้ในระดับ DB → ต้องเช็คก่อนเขียนเสมอ
  if (orderId && !(await orderBelongsToOrg(admin, orderId, orgId))) {
    return govError("ไม่พบงานนี้ในองค์กร", 404);
  }

  try {
    // copy ค่าตั้งต้นหัวจดหมายของบริษัท → snapshot ของชุด (C1)
    const snapshot = await loadLetterheadSnapshot(admin, orgId, company);

    await setAuditContext(req, auth.userId, orgId);

    const { data, error } = await admin
      .from("gov_procure_catalogs")
      .insert({
        org_id: orgId,
        order_id: orderId,
        title,
        company,
        template: templateRaw,
        show_prices: body.show_prices === true,
        notes: typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null,
        letterhead_snapshot: snapshot,
        status: "draft",
        created_by: auth.userId,
      })
      .select("*")
      .single();

    if (error) return govError(error.message, 500);
    return NextResponse.json({ catalog: data }, { status: 201 });
  } catch (e) {
    return govError((e as Error).message, 500);
  }
}
