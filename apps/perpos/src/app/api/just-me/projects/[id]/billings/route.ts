/**
 * /api/just-me/projects/[id]/billings — งวดงาน (สร้าง/แก้/ยกเลิก/ออกใบแจ้งหนี้)
 * GET   = สมาชิก (ยอดฝั่งขาย ไม่ใช่ต้นทุน → viewer เห็นได้)
 * POST  = owner/manager · PATCH = owner/manager (มี `action`)
 *
 * ⛔ invariant (contract §4.5):
 *  1. ผลรวมงวดที่ยังไม่ `cancelled` ต้องไม่เกิน `contract_amount` (คิดด้วย `billingPlanTotals`)
 *  2. งวดที่ `invoiced`/`paid` แก้ยอดไม่ได้ (trigger DB กันอยู่ — ที่นี่ตอบข้อความไทยก่อนถึง DB)
 *  3. ใบแจ้งหนี้เกิดที่ module `accounting` เท่านั้น (ห้ามออกเลขเอง)
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../_lib/supabase";
import { assertOrgRefs, auditMutation, guard, jmError, numOrNull } from "../../../_lib";
import { getProject, listProjectBillings } from "@/lib/just-me/projects";
import {
  billingAmountFromPercent,
  billingPlanTotals,
  billingRetentionAmount,
} from "@/lib/just-me/project-metrics";
import {
  buildInvoicePayload,
  ensureAccContact,
  loadAccountingReadiness,
  loadDocumentNumbers,
  postAccountingDocument,
} from "@/lib/just-me/accounting-bridge";
import type { JustMeProjectBilling } from "@/lib/just-me/types";

type Ctx = { params: Promise<{ id: string }> };

const EDITABLE_STATUSES = new Set(["planned", "ready"]);

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const g = await guard(req);
  if (!g.ok) return g.res;

  const admin = createAdminClient();
  try {
    const project = await getProject(admin, g.orgId, id);
    if (!project) return jmError("ไม่พบโครงการนี้", 404);

    const billings = await listProjectBillings(admin, g.orgId, id);
    const totals = billingPlanTotals(project.contract_amount, billings);
    const docs = await loadDocumentNumbers(
      admin,
      g.orgId,
      billings.map((b) => b.invoice_document_id),
    );

    return NextResponse.json({
      billings,
      contract_amount: project.contract_amount,
      retention_pct: project.retention_pct ?? 0,
      planned: totals.planned,
      remaining: totals.remaining,
      documents: Object.fromEntries(docs),
    });
  } catch (e) {
    return jmError(e instanceof Error ? e.message : "โหลดงวดงานไม่สำเร็จ", 500);
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const g = await guard(req, { write: true });
  if (!g.ok) return g.res;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const admin = createAdminClient();

  try {
    const project = await getProject(admin, g.orgId, id);
    if (!project) return jmError("ไม่พบโครงการนี้", 404);

    const billings = await listProjectBillings(admin, g.orgId, id);
    const resolved = resolveAmount(body, project.contract_amount, project.retention_pct ?? 0);
    if ("error" in resolved) return jmError(resolved.error, 400);

    const check = billingPlanTotals(project.contract_amount, [
      ...billings,
      { amount: resolved.amount, status: "planned" } as JustMeProjectBilling,
    ]);
    if (check.exceeds) {
      return jmError(
        `ยอดงวดรวมเกินมูลค่าสัญญา — วางบิลได้อีก ${fmt(check.remaining === null ? 0 : check.remaining + resolved.amount)} บาท`,
        400,
      );
    }

    const seq = Math.max(0, ...billings.map((b) => b.seq)) + 1;
    await auditMutation(req, g.auth);

    const { data, error } = await admin
      .from("just_me_project_billings")
      .insert({
        org_id: g.orgId,
        project_id: id,
        seq,
        title: text(body.title),
        percent_of_contract: resolved.percent,
        amount: resolved.amount,
        retention_amount: resolved.retention,
        due_date: text(body.due_date),
        status: "planned",
        note: text(body.note),
        created_by: g.auth.userId,
      })
      .select("*")
      .single();
    if (error) return jmError(error.message, 500);

    return NextResponse.json({ billing: data }, { status: 201 });
  } catch (e) {
    return jmError(e instanceof Error ? e.message : "สร้างงวดงานไม่สำเร็จ", 500);
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const g = await guard(req, { write: true });
  if (!g.ok) return g.res;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const billingId = typeof body.id === "string" ? body.id : "";
  if (!billingId) return jmError("ไม่ได้ระบุงวดงานที่ต้องการแก้ไข", 400);

  const admin = createAdminClient();
  try {
    const refErr = await assertOrgRefs(g.orgId, [
      { value: billingId, table: "just_me_project_billings", label: "งวดงาน" },
    ]);
    if (refErr) return jmError(refErr, 404);

    const project = await getProject(admin, g.orgId, id);
    if (!project) return jmError("ไม่พบโครงการนี้", 404);

    const billings = await listProjectBillings(admin, g.orgId, id);
    const billing = billings.find((b) => b.id === billingId);
    if (!billing) return jmError("ไม่พบงวดงานนี้ในโครงการ", 404);

    const action = typeof body.action === "string" ? body.action : "";

    if (action === "invoice") return invoiceBilling(req, g, project, billing, body);

    if (action === "mark-paid") {
      if (billing.status !== "invoiced") {
        return jmError("บันทึกรับเงินได้เฉพาะงวดที่วางบิลแล้ว", 409);
      }
      await auditMutation(req, g.auth);
      const { data, error } = await admin
        .from("just_me_project_billings")
        .update({ status: "paid", paid_at: new Date().toISOString() })
        .eq("org_id", g.orgId)
        .eq("id", billingId)
        .select("*")
        .single();
      if (error) return jmError(error.message, 500);
      return NextResponse.json({ billing: data });
    }

    if (action === "cancel") {
      if (billing.status === "invoiced" || billing.status === "paid") {
        return jmError("งวดที่วางบิลแล้วยกเลิกไม่ได้ — ต้องออกใบลดหนี้ที่ระบบบัญชีแทน", 409);
      }
      await auditMutation(req, g.auth);
      const { data, error } = await admin
        .from("just_me_project_billings")
        .update({ status: "cancelled" })
        .eq("org_id", g.orgId)
        .eq("id", billingId)
        .select("*")
        .single();
      if (error) return jmError(error.message, 500);
      return NextResponse.json({ billing: data });
    }

    // แก้ข้อมูลงวด (เฉพาะที่ยังไม่วางบิล)
    if (!EDITABLE_STATUSES.has(billing.status)) {
      return jmError("งวดที่วางบิล/รับเงิน/ยกเลิกแล้ว แก้ไม่ได้", 409);
    }

    const patch: Record<string, unknown> = {};
    if ("title" in body) patch.title = text(body.title);
    if ("note" in body) patch.note = text(body.note);
    if ("due_date" in body) patch.due_date = text(body.due_date);
    if ("status" in body) {
      const next = String(body.status);
      if (!EDITABLE_STATUSES.has(next)) {
        return jmError("เปลี่ยนสถานะได้เฉพาะ 'วางแผนไว้' ↔ 'พร้อมวางบิล' เท่านั้น", 400);
      }
      patch.status = next;
    }

    if ("amount" in body || "percent_of_contract" in body || "retention_amount" in body) {
      const resolved = resolveAmount(body, project.contract_amount, project.retention_pct ?? 0, {
        current: billing,
      });
      if ("error" in resolved) return jmError(resolved.error, 400);

      const others = billings.filter((b) => b.id !== billingId);
      const check = billingPlanTotals(project.contract_amount, [
        ...others,
        { amount: resolved.amount, status: "planned" } as JustMeProjectBilling,
      ]);
      if (check.exceeds) {
        return jmError(
          `ยอดงวดรวมเกินมูลค่าสัญญา — งวดนี้ตั้งได้ไม่เกิน ${fmt((check.remaining ?? 0) + resolved.amount)} บาท`,
          400,
        );
      }
      patch.amount = resolved.amount;
      patch.percent_of_contract = resolved.percent;
      patch.retention_amount = resolved.retention;
    }

    if (Object.keys(patch).length === 0) return jmError("ไม่มีข้อมูลที่จะแก้ไข", 400);

    await auditMutation(req, g.auth);
    const { data, error } = await admin
      .from("just_me_project_billings")
      .update(patch)
      .eq("org_id", g.orgId)
      .eq("id", billingId)
      .select("*")
      .single();
    if (error) return jmError(error.message, 500);
    return NextResponse.json({ billing: data });
  } catch (e) {
    return jmError(e instanceof Error ? e.message : "แก้ไขงวดงานไม่สำเร็จ", 500);
  }
}

// ─── ออกใบแจ้งหนี้ของงวด (ผ่าน accounting) ──────────────────────────────────
async function invoiceBilling(
  req: NextRequest,
  g: { orgId: string; auth: Parameters<typeof auditMutation>[1] },
  project: Awaited<ReturnType<typeof getProject>>,
  billing: JustMeProjectBilling,
  body: Record<string, unknown>,
): Promise<NextResponse> {
  if (!project) return jmError("ไม่พบโครงการนี้", 404);
  const admin = createAdminClient();

  if (billing.status === "invoiced" || billing.status === "paid") {
    const docs = await loadDocumentNumbers(admin, g.orgId, [billing.invoice_document_id]);
    const doc = billing.invoice_document_id ? docs.get(billing.invoice_document_id) : undefined;
    return jmError(
      `งวดที่ ${billing.seq} วางบิลไปแล้ว${doc ? ` (เลขที่ ${doc.doc_number})` : ""}`,
      409,
    );
  }
  if (billing.status === "cancelled") return jmError("งวดที่ยกเลิกแล้วออกใบแจ้งหนี้ไม่ได้", 409);

  const docType = body.doc_type === "tax_invoice" ? "tax_invoice" : "invoice";
  const retentionMode = body.retention_mode === "discount" ? "discount" : "note";
  const issueDate =
    typeof body.issue_date === "string" && body.issue_date
      ? body.issue_date
      : new Date().toISOString().slice(0, 10);

  const readiness = await loadAccountingReadiness(admin, g.orgId);

  await auditMutation(req, g.auth);
  const contact = await ensureAccContact(admin, g.orgId, project);
  if (!contact.ok) return jmError(contact.error, contact.status);

  let payload;
  try {
    payload = buildInvoicePayload(project, billing, {
      orgId: g.orgId,
      contactId: contact.contactId,
      issueDate,
      dueDate: typeof body.due_date === "string" && body.due_date ? body.due_date : null,
      docType,
      vatEnabled: readiness.vat_registered && body.vat_enabled !== false,
      retentionMode,
      note: typeof body.note === "string" ? body.note : null,
    });
  } catch (e) {
    return jmError(e instanceof Error ? e.message : "เตรียมข้อมูลใบแจ้งหนี้ไม่สำเร็จ", 400);
  }

  const created = await postAccountingDocument({
    origin: req.nextUrl.origin,
    authorization: req.headers.get("authorization"),
    payload,
  });
  if (!created.ok) return jmError(created.error, created.status);

  const { data, error } = await admin
    .from("just_me_project_billings")
    .update({
      status: "invoiced",
      invoice_document_id: created.id,
      invoiced_at: new Date().toISOString(),
    })
    .eq("org_id", g.orgId)
    .eq("id", billing.id)
    .select("*")
    .single();
  if (error) {
    return NextResponse.json(
      {
        document_id: created.id,
        doc_number: created.doc_number,
        warning: `ออกใบแจ้งหนี้ ${created.doc_number} สำเร็จ แต่บันทึกกลับที่งวดงานไม่สำเร็จ (${error.message})`,
      },
      { status: 207 },
    );
  }

  return NextResponse.json({
    billing: data,
    document_id: created.id,
    doc_number: created.doc_number,
    journal_warning: created.journal_warning,
    tax_identity_missing: readiness.tax_identity_ready ? [] : readiness.missing,
  });
}

// ─── ตัวช่วยเล็ก ๆ ──────────────────────────────────────────────────────────
function text(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s : null;
}

function fmt(v: number): string {
  return v.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * ยอดงวด + เงินประกัน — รองรับทั้ง "% ของสัญญา" และ "ยอดกรอกเอง" (contract §10 Q4)
 * ⛔ ตัวเลขทุกช่องมาจาก `project-metrics.ts` — ที่นี่แค่เลือกว่าจะใช้ทางไหน
 */
function resolveAmount(
  body: Record<string, unknown>,
  contractAmount: number | null,
  retentionPct: number,
  opts?: { current: JustMeProjectBilling },
): { amount: number; percent: number | null; retention: number } | { error: string } {
  const percentRaw =
    "percent_of_contract" in body ? numOrNull(body.percent_of_contract) : undefined;
  const amountRaw = "amount" in body ? numOrNull(body.amount) : undefined;
  if (percentRaw === undefined && amountRaw === undefined && !opts) {
    return { error: "กรุณาระบุยอดงวด หรือ % ของสัญญา" };
  }
  if (percentRaw === undefined && amountRaw === undefined && opts) {
    // แก้เฉพาะเงินประกัน — ยอดเดิมคงไว้
    const retention = resolveRetention(body, opts.current.amount, retentionPct);
    if ("error" in retention) return retention;
    return {
      amount: opts.current.amount,
      percent: opts.current.percent_of_contract,
      retention: retention.value,
    };
  }

  let percent: number | null = null;
  let amount: number | null = null;

  if (percentRaw !== undefined && percentRaw !== null) {
    if (percentRaw <= 0 || percentRaw > 100) return { error: "% ของสัญญาต้องอยู่ระหว่าง 0–100" };
    if (contractAmount === null) {
      return { error: "โครงการนี้ยังไม่มีมูลค่าสัญญา — กรอกยอดงวดเป็นจำนวนเงินแทน" };
    }
    percent = percentRaw;
    amount = billingAmountFromPercent(contractAmount, percentRaw);
  }
  if (amount === null) {
    if (amountRaw === undefined || amountRaw === null) {
      return { error: "กรุณาระบุยอดงวดเป็นจำนวนเงิน" };
    }
    amount = amountRaw;
    percent = percentRaw ?? null;
  }
  if (!Number.isFinite(amount) || amount <= 0) return { error: "ยอดงวดต้องมากกว่า 0" };

  const retention = resolveRetention(body, amount, retentionPct);
  if ("error" in retention) return retention;
  return { amount, percent, retention: retention.value };
}

function resolveRetention(
  body: Record<string, unknown>,
  amount: number,
  retentionPct: number,
): { value: number } | { error: string } {
  if ("retention_amount" in body) {
    const v = numOrNull(body.retention_amount);
    if (v === undefined) return { error: "เงินประกันผลงานไม่ถูกต้อง" };
    const value = v ?? 0;
    if (value < 0) return { error: "เงินประกันผลงานติดลบไม่ได้" };
    if (value > amount) return { error: "เงินประกันผลงานมากกว่ายอดงวดไม่ได้" };
    return { value };
  }
  return { value: billingRetentionAmount(amount, retentionPct) };
}
