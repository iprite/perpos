import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { createAdminClient } from "../../../../_lib/supabase";
import { setAuditContext } from "../../../../_lib/audit";
import { recordMetric } from "@/lib/metrics";
import {
  requireAccountingMember,
  canWriteFrontstage,
  accError,
  orgIdFromQuery,
} from "../../../_lib";
import { shareUrlFromToken } from "@/lib/accounting/document-share";

const ROUTE = "/api/accounting/documents/[id]/share";
type Ctx = { params: Promise<{ id: string }> };

/** GET ?orgId= → ลิงก์ที่ยังใช้ได้ของเอกสารนี้ (ไม่มี = null) */
export async function GET(req: NextRequest, ctx: Ctx) {
  const t0 = Date.now();
  const { id } = await ctx.params;
  const orgId = orgIdFromQuery(req);
  if (!orgId) return accError("missing orgId");

  const auth = await requireAccountingMember(req, orgId);
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();
  const { data } = await admin
    .from("acc_document_shares")
    .select("token, expires_at, view_count, last_viewed_at, created_at")
    .eq("org_id", orgId)
    .eq("document_id", id)
    .is("revoked_at", null)
    .maybeSingle();

  void recordMetric({ orgId, route: ROUTE, method: req.method, status: 200, t0 });
  const row = data as { token: string } | null;
  return NextResponse.json({ share: row ? { ...data, url: shareUrlFromToken(row.token) } : null });
}

/**
 * POST → สร้างลิงก์สาธารณะให้เอกสารใบนี้ (ออกใหม่ = เพิกถอนใบเดิมอัตโนมัติ)
 * token เป็นความลับแบบ capability URL — ใครถือลิงก์เปิดดูได้ จึงต้องสุ่มยาวและเพิกถอนได้
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const t0 = Date.now();
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orgId = String(body.orgId ?? "");
  if (!orgId) return accError("missing orgId");

  const auth = await requireAccountingMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWriteFrontstage(auth)) return accError("ไม่มีสิทธิ์แชร์เอกสาร", 403);

  const admin = createAdminClient();
  const { data: doc } = await admin
    .from("acc_documents")
    .select("id, status")
    .eq("org_id", orgId)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!doc) return accError("ไม่พบเอกสาร", 404);
  // ฉบับร่างยังไม่ใช่เอกสารที่ส่งให้ลูกค้า — กันแชร์ของที่ยังแก้อยู่
  if ((doc as { status: string }).status === "draft")
    return accError("เอกสารฉบับร่างยังแชร์ไม่ได้ — เปลี่ยนสถานะเป็น 'ส่งแล้ว' ก่อน", 409);

  await setAuditContext(req, auth.userId, orgId);
  await admin
    .from("acc_document_shares")
    .update({ revoked_at: new Date().toISOString() })
    .eq("org_id", orgId)
    .eq("document_id", id)
    .is("revoked_at", null);

  const token = randomBytes(24).toString("base64url"); // 192-bit เดาไม่ได้
  const { error } = await admin.from("acc_document_shares").insert({
    org_id: orgId,
    document_id: id,
    token,
    created_by: auth.userId,
  });
  if (error) {
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
    return accError(error.message, 500);
  }

  void recordMetric({ orgId, route: ROUTE, method: req.method, status: 201, t0 });
  return NextResponse.json({ token, url: shareUrlFromToken(token) }, { status: 201 });
}

/** DELETE ?orgId= → เพิกถอนลิงก์ (ลิงก์ที่ส่งออกไปแล้วจะเปิดไม่ได้ทันที) */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const t0 = Date.now();
  const { id } = await ctx.params;
  const orgId = orgIdFromQuery(req);
  if (!orgId) return accError("missing orgId");

  const auth = await requireAccountingMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWriteFrontstage(auth)) return accError("ไม่มีสิทธิ์เพิกถอนลิงก์", 403);

  const admin = createAdminClient();
  await setAuditContext(req, auth.userId, orgId);
  const { error } = await admin
    .from("acc_document_shares")
    .update({ revoked_at: new Date().toISOString() })
    .eq("org_id", orgId)
    .eq("document_id", id)
    .is("revoked_at", null);
  if (error) {
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
    return accError(error.message, 500);
  }
  void recordMetric({ orgId, route: ROUTE, method: req.method, status: 200, t0 });
  return NextResponse.json({ ok: true });
}
