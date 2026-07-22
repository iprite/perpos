// POST /api/gov-procure/catalogs/[id]/items/verify-bulk?orgId= → ยืนยันหลายรายการ (canWrite)
//
// contract §5.9 A-3 (binding): **รับ filter descriptor ไม่ใช่ array id ดิบ** —
// route resolve id set เองจาก `catalog_id + org_id` แล้วบังคับกฎความปลอดภัยซ้ำที่ server
// (client ที่แก้ payload เองจะ "ยืนยัน" ของที่ห้ามยืนยันไม่ได้)

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../../_lib/supabase";
import { setAuditContext } from "../../../../../_lib/audit";
import { requireGovProcureMember, canWrite, orgIdFromQuery, govError } from "../../../../_lib";
import { catalogBelongsToOrg } from "../../../../_catalog-lib";
import { CATALOG_ITEM_SOURCES, type CatalogItemSource } from "@/lib/gov-procure/catalog";

type Ctx = { params: Promise<{ id: string }> };

/** ความเชื่อมั่นต่ำกว่านี้ = "รายการเสี่ยง" (A-3 / B-P1-8) */
const RISKY_CONFIDENCE = 0.6;
/** รายการที่ AI ถืออยู่ — ยืนยันไม่ได้เด็ดขาด (ไม่ขึ้นกับ skipRisky) */
const LOCKED_STATES = ["queued", "running"];

interface CandidateRow {
  id: string;
  source: CatalogItemSource;
  confidence: number | null;
  enrich_state: string;
  viewed_at: string | null;
  image_path: string | null;
  unit_price_ref: number | null;
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const orgId = orgIdFromQuery(req);
  if (!orgId) return govError("missing orgId");

  const auth = await requireGovProcureMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWrite(auth.role)) return govError("ไม่มีสิทธิ์ยืนยันรายการ", 403);

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  // filter descriptor เดียวกับที่ตารางหน้า review ใช้ (แท็บ/ค้นหา/หมวดหมู่)
  const tab = typeof body.tab === "string" ? body.tab : "";
  const q = typeof body.q === "string" ? body.q.trim() : "";
  const category = typeof body.category === "string" ? body.category.trim() : "";
  const skipRisky = body.skipRisky !== false; // default = ข้ามรายการเสี่ยง (แนะนำ)

  const admin = createAdminClient();
  if (!(await catalogBelongsToOrg(admin, id, orgId))) {
    return govError("ไม่พบชุดแคตตาล็อกนี้", 404);
  }

  try {
    let sel = admin
      .from("gov_procure_catalog_items")
      .select("id, source, confidence, enrich_state, viewed_at, image_path, unit_price_ref")
      .eq("org_id", orgId)
      .eq("catalog_id", id);

    if (tab && CATALOG_ITEM_SOURCES.includes(tab as CatalogItemSource)) {
      sel = sel.eq("source", tab as CatalogItemSource);
    }
    if (category) sel = sel.eq("category", category);
    if (q) sel = sel.ilike("name", `%${q}%`);

    const { data, error } = await sel;
    if (error) return govError(error.message, 500);

    const rows = (data ?? []) as CandidateRow[];

    const skipped = {
      locked: 0,
      lowConfidence: 0,
      notViewed: 0,
      alreadyVerified: 0,
      noImage: 0,
      noPrice: 0,
    };
    const ids: string[] = [];

    for (const r of rows) {
      if (r.source === "human_verified") {
        skipped.alreadyVerified += 1;
        continue;
      }
      if (LOCKED_STATES.includes(r.enrich_state)) {
        skipped.locked += 1;
        continue;
      }
      if (skipRisky && typeof r.confidence === "number" && r.confidence < RISKY_CONFIDENCE) {
        skipped.lowConfidence += 1;
        continue;
      }
      if (skipRisky && !r.viewed_at) {
        skipped.notViewed += 1;
        continue;
      }
      // สวิตช์ "ข้ามรายการเสี่ยง" บนหน้าจอบอกผู้ใช้ว่าจะข้ามรายการที่ยังไม่มีรูป/ไม่มีราคาด้วย
      // → server ต้องข้ามจริง ไม่งั้นผู้ใช้กดโดยเชื่อว่าปลอดภัย แล้วรายการที่ยังไม่ครบ
      //   ถูกประทับ "ผ่านตาคนแล้ว" และไหลเข้าคลังไปปนงานถัดไป (B-B1)
      if (skipRisky && !r.image_path) {
        skipped.noImage += 1;
        continue;
      }
      if (skipRisky && (r.unit_price_ref === null || r.unit_price_ref === undefined)) {
        skipped.noPrice += 1;
        continue;
      }
      ids.push(r.id);
    }

    if (ids.length === 0) return NextResponse.json({ verified: 0, skipped });

    await setAuditContext(req, auth.userId, orgId);

    const now = new Date().toISOString();
    const { data: updated, error: updErr } = await admin
      .from("gov_procure_catalog_items")
      .update({ source: "human_verified", verified_by: auth.userId, verified_at: now })
      .eq("org_id", orgId)
      .eq("catalog_id", id)
      .in("id", ids)
      // race guard — ถ้ามีคนสั่ง enrich แซงระหว่างทาง แถวนั้นจะไม่ถูกยืนยัน
      .not("enrich_state", "in", "(queued,running)")
      .select("id");

    if (updErr) return govError(updErr.message, 500);

    return NextResponse.json({ verified: (updated ?? []).length, skipped });
  } catch (e) {
    return govError((e as Error).message, 500);
  }
}
