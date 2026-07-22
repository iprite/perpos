// GET    /api/gov-procure/catalogs/[id]?orgId=  → ชุด + KPI + job ล่าสุด (member)
// PUT    /api/gov-procure/catalogs/[id]?orgId=  → แก้ชุด (canWrite — รวม show_prices/status/company)
// DELETE /api/gov-procure/catalogs/[id]?orgId=  → ลบชุด + ไฟล์ใน storage (canDelete)
// contract: §5.9 C-B3 (guard) · A-1 (ล็อกตอน enrich) · C-6 (เปลี่ยนบริษัท = re-copy snapshot) · A-10 (ลบไฟล์)

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../_lib/supabase";
import { setAuditContext } from "../../../_lib/audit";
import { requireGovProcureMember, canWrite, canDelete, orgIdFromQuery, govError } from "../../_lib";
import { loadLetterheadSnapshot, orderBelongsToOrg, removeStoragePrefix } from "../../_catalog-lib";
import {
  getCatalog,
  getCatalogItemStats,
  getLatestCatalogJob,
  type Catalog,
} from "@/lib/gov-procure/catalog";
import { isValidLogoDataUrl } from "@/lib/gov-procure/catalog-html";
import { COMPANIES } from "@/lib/gov-procure/types";

type Ctx = { params: Promise<{ id: string }> };

/** สถานะที่ client ตั้งเองได้ — `enriching` เป็นของ server (ตั้งโดย /enrich เท่านั้น) */
const CLIENT_STATUSES = ["draft", "review", "approved"];
const TEMPLATES = ["table", "narrative"];

/** ฟิลด์ที่กระทบ job ที่กำลังทำอยู่ → ล็อกระหว่าง `enriching` (A-1) */
const ENRICH_LOCKED_FIELDS = ["template", "company"];

function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x ?? "").trim()).filter((s) => s.length > 0);
}

/** snapshot ที่ผู้ใช้แก้เองรายชุด (canWrite — §5.4) — โลโก้ที่ไม่ผ่าน regex/ขนาด = ทิ้ง (A-6) */
function sanitizeSnapshot(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const logo = typeof o.logo_data_url === "string" ? o.logo_data_url : null;
  return {
    company_name: typeof o.company_name === "string" ? o.company_name.trim() || null : null,
    address_lines: toStringArray(o.address_lines),
    phone: typeof o.phone === "string" ? o.phone.trim() || null : null,
    tax_id: typeof o.tax_id === "string" ? o.tax_id.trim() || null : null,
    logo_data_url: logo && isValidLogoDataUrl(logo) ? logo : null,
  };
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const orgId = orgIdFromQuery(req);
  if (!orgId) return govError("missing orgId");

  const auth = await requireGovProcureMember(req, orgId);
  if (!auth.ok) return auth.res;

  try {
    const admin = createAdminClient();
    const catalog = await getCatalog(admin, orgId, id);
    if (!catalog) return govError("ไม่พบชุดแคตตาล็อกนี้", 404);

    const [stats, job] = await Promise.all([
      getCatalogItemStats(admin, orgId, id),
      getLatestCatalogJob(admin, orgId, id),
    ]);

    return NextResponse.json({ catalog, stats, job });
  } catch (e) {
    return govError((e as Error).message, 500);
  }
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const orgId = orgIdFromQuery(req);
  if (!orgId) return govError("missing orgId");

  const auth = await requireGovProcureMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWrite(auth.role)) return govError("ไม่มีสิทธิ์แก้ไขชุดแคตตาล็อก", 403);

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const admin = createAdminClient();

  try {
    const catalog = await getCatalog(admin, orgId, id);
    if (!catalog) return govError("ไม่พบชุดแคตตาล็อกนี้", 404);

    // A-1 — ระหว่าง AI กำลังทำงาน ห้ามเปลี่ยนของที่ job ใช้อยู่ (ฟิลด์อื่นแก้ได้ปกติ)
    if (catalog.status === "enriching" && ENRICH_LOCKED_FIELDS.some((f) => f in body)) {
      return govError(
        "ชุดนี้กำลังให้ AI เติมข้อมูลอยู่ — เปลี่ยนบริษัท/รูปแบบเอกสารไม่ได้จนกว่าจะเสร็จ",
        409,
      );
    }

    const patch: Record<string, unknown> = {};

    if ("title" in body) {
      const title = typeof body.title === "string" ? body.title.trim() : "";
      if (!title) return govError("กรุณาระบุชื่อชุดแคตตาล็อก");
      patch.title = title;
    }

    if ("template" in body) {
      const t = String(body.template ?? "");
      if (!TEMPLATES.includes(t)) return govError("รูปแบบเอกสารไม่ถูกต้อง");
      patch.template = t;
    }

    if ("show_prices" in body) patch.show_prices = body.show_prices === true;

    if ("notes" in body) {
      patch.notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;
    }

    if ("status" in body) {
      const s = String(body.status ?? "");
      if (!CLIENT_STATUSES.includes(s)) {
        return govError("เปลี่ยนเป็นสถานะนี้ไม่ได้ (สถานะ 'กำลังให้ AI เติม' ระบบตั้งเอง)");
      }
      patch.status = s;
    }

    if ("order_id" in body) {
      const orderId = typeof body.order_id === "string" && body.order_id ? body.order_id : null;
      // G3 — ต้องยืนยันว่างานอยู่ใน org นี้ก่อนผูกเสมอ
      if (orderId && !(await orderBelongsToOrg(admin, orderId, orgId))) {
        return govError("ไม่พบงานนี้ในองค์กร", 404);
      }
      patch.order_id = orderId;
    }

    // แก้หัวจดหมายรายชุด (snapshot ของชุดนั้น — §5.4 canWrite)
    if ("letterhead_snapshot" in body) {
      patch.letterhead_snapshot = sanitizeSnapshot(body.letterhead_snapshot);
    }

    let letterheadReset = false;
    if ("company" in body) {
      const raw = typeof body.company === "string" ? body.company.trim() : "";
      if (raw && !(COMPANIES as readonly string[]).includes(raw)) {
        return govError("ไม่รู้จักบริษัทนี้");
      }
      const company = raw || null;
      patch.company = company;
      // C-6 — เปลี่ยนบริษัท = re-copy snapshot จากค่าตั้งต้นของบริษัทใหม่ (ทับของเดิม)
      if (company !== catalog.company) {
        patch.letterhead_snapshot = await loadLetterheadSnapshot(admin, orgId, company);
        letterheadReset = true;
      }
    }

    if (Object.keys(patch).length === 0) return NextResponse.json({ catalog });

    await setAuditContext(req, auth.userId, orgId);

    const { data, error } = await admin
      .from("gov_procure_catalogs")
      .update(patch)
      .eq("id", id)
      .eq("org_id", orgId)
      .select("*")
      .maybeSingle();

    if (error) return govError(error.message, 500);
    if (!data) return govError("ไม่พบชุดแคตตาล็อกนี้", 404);

    return NextResponse.json({ catalog: data as Catalog, letterheadReset });
  } catch (e) {
    return govError((e as Error).message, 500);
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const orgId = orgIdFromQuery(req);
  if (!orgId) return govError("missing orgId");

  const auth = await requireGovProcureMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canDelete(auth.role)) return govError("ไม่มีสิทธิ์ลบชุด (เฉพาะเจ้าของ/ผู้จัดการ)", 403);

  const admin = createAdminClient();

  const { data: found } = await admin
    .from("gov_procure_catalogs")
    .select("id")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!found) return govError("ไม่พบชุดแคตตาล็อกนี้", 404);

  await setAuditContext(req, auth.userId, orgId);

  const { error } = await admin
    .from("gov_procure_catalogs")
    .delete()
    .eq("id", id)
    .eq("org_id", orgId);

  if (error) return govError(error.message, 500);

  // A-10 — ลบไฟล์หลังลบแถวสำเร็จ (best-effort, ไม่ rollback DB)
  await removeStoragePrefix(admin, `${orgId}/catalogs/${id}`, orgId);

  return NextResponse.json({ ok: true });
}
