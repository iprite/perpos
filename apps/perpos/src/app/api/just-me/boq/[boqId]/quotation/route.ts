/**
 * POST /api/just-me/boq/[boqId]/quotation
 * ออกใบเสนอราคาของ BOQ ที่อนุมัติแล้ว → **สร้างจริงที่ module `accounting`**
 * แล้วเก็บ `quotation_document_id` กลับที่โครงการ + ขยับสถานะเป็น `quoted`
 *
 * contract §6 · §7 ข้อ 3 · กติกาที่ห้ามพัง:
 *  - เลขที่เอกสารมาจาก accounting เท่านั้น (RPC `next_acc_doc_number`)
 *  - ลูกค้าต้องมีแถวใน `acc_contacts` ก่อน (snapshot ม.86/4) — สร้างให้อัตโนมัติจากชื่อลูกค้าของโครงการ
 *  - ออกซ้ำไม่ได้: มี `quotation_document_id` แล้ว → 409 พร้อมบอกเลขเดิม (ยกเลิกที่ระบบบัญชีก่อน)
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../_lib/supabase";
import { auditMutation, guard, jmError } from "../../../_lib";
import { getBoq, listBoqItems } from "@/lib/just-me/boq";
import { listWorkCategories } from "@/lib/just-me/price-book";
import { getProject } from "@/lib/just-me/projects";
import {
  buildQuotationPayload,
  ensureAccContact,
  loadAccountingReadiness,
  loadDocumentNumbers,
  postAccountingDocument,
  type QuotationGroupBy,
} from "@/lib/just-me/accounting-bridge";

type Ctx = { params: Promise<{ boqId: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const { boqId } = await ctx.params;
  const g = await guard(req, { write: true, cost: true });
  if (!g.ok) return g.res;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const groupBy: QuotationGroupBy = body.groupBy === "item" ? "item" : "category";
  const issueDate =
    typeof body.issue_date === "string" && body.issue_date
      ? body.issue_date
      : new Date().toISOString().slice(0, 10);
  const dueDate = typeof body.due_date === "string" && body.due_date ? body.due_date : null;

  const admin = createAdminClient();
  try {
    const boq = await getBoq(admin, g.orgId, boqId);
    if (!boq) return jmError("ไม่พบ BOQ ฉบับนี้", 404);
    if (boq.status !== "approved") {
      return jmError("ออกใบเสนอราคาได้เฉพาะ BOQ ที่อนุมัติแล้วเท่านั้น", 409);
    }

    const project = await getProject(admin, g.orgId, boq.project_id);
    if (!project) return jmError("ไม่พบโครงการของ BOQ ฉบับนี้", 404);

    if (project.quotation_document_id) {
      const docs = await loadDocumentNumbers(admin, g.orgId, [project.quotation_document_id]);
      const doc = docs.get(project.quotation_document_id);
      return jmError(
        `โครงการนี้ออกใบเสนอราคาไปแล้ว${doc ? ` (เลขที่ ${doc.doc_number})` : ""} — ถ้าต้องการออกใหม่ ให้ยกเลิกใบเดิมที่ระบบบัญชีก่อน`,
        409,
      );
    }

    const items = await listBoqItems(admin, g.orgId, boqId);
    if (items.length === 0) return jmError("BOQ ฉบับนี้ยังไม่มีรายการ", 400);

    const [categories, readiness] = await Promise.all([
      listWorkCategories(admin, g.orgId, { includeInactive: true }),
      loadAccountingReadiness(admin, g.orgId),
    ]);

    await auditMutation(req, g.auth);

    const contact = await ensureAccContact(admin, g.orgId, project);
    if (!contact.ok) return jmError(contact.error, contact.status);

    const payload = buildQuotationPayload(project, boq, items, {
      orgId: g.orgId,
      contactId: contact.contactId,
      issueDate,
      dueDate,
      groupBy,
      vatEnabled: readiness.vat_registered && body.vat_enabled !== false,
      categoryNames: new Map(categories.map((c) => [c.id, c.name])),
      note: typeof body.note === "string" ? body.note : null,
    });

    const created = await postAccountingDocument({
      origin: req.nextUrl.origin,
      authorization: req.headers.get("authorization"),
      payload,
    });
    if (!created.ok) return jmError(created.error, created.status);

    const patch: Record<string, unknown> = { quotation_document_id: created.id };
    if (project.status === "survey" || project.status === "boq") patch.status = "quoted";
    const { error: updErr } = await admin
      .from("just_me_projects")
      .update(patch)
      .eq("org_id", g.orgId)
      .eq("id", project.id);
    if (updErr) {
      // เอกสารออกไปแล้วจริง — บอกให้ผู้ใช้รู้ว่าต้องผูกเลขเอง ดีกว่าเงียบ
      return NextResponse.json(
        {
          document_id: created.id,
          doc_number: created.doc_number,
          warning: `ออกใบเสนอราคา ${created.doc_number} สำเร็จ แต่บันทึกกลับที่โครงการไม่สำเร็จ (${updErr.message})`,
        },
        { status: 207 },
      );
    }

    return NextResponse.json(
      {
        document_id: created.id,
        doc_number: created.doc_number,
        contact_id: contact.contactId,
        contact_created: contact.created,
        journal_warning: created.journal_warning,
        tax_identity_missing: readiness.tax_identity_ready ? [] : readiness.missing,
        status: patch.status ?? project.status,
      },
      { status: 201 },
    );
  } catch (e) {
    return jmError(e instanceof Error ? e.message : "ออกใบเสนอราคาไม่สำเร็จ", 500);
  }
}
