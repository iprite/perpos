import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../_lib/supabase";
import { setAuditContext } from "../../../_lib/audit";
import { recordMetric } from "@/lib/metrics";
import {
  requireAccountingMember,
  canWriteBackstage,
  accError,
  orgIdFromQuery,
  num,
  round2,
} from "../../_lib";
import { getJournalEntry } from "@/lib/accounting/journal";

const ROUTE = "/api/accounting/journal/[id]";
type Ctx = { params: Promise<{ id: string }> };

interface LineInput {
  account_id: string;
  debit?: unknown;
  credit?: unknown;
  line_note?: string;
}

function normalizeLines(
  raw: unknown,
):
  | {
      ok: true;
      lines: { account_id: string; debit: number; credit: number; line_note: string | null }[];
      totalDebit: number;
      totalCredit: number;
    }
  | { ok: false; error: string } {
  if (!Array.isArray(raw) || raw.length < 2)
    return { ok: false, error: "ต้องมีบรรทัดบัญชีอย่างน้อย 2 บรรทัด" };
  const lines: { account_id: string; debit: number; credit: number; line_note: string | null }[] =
    [];
  let totalDebit = 0;
  let totalCredit = 0;
  for (const l of raw as LineInput[]) {
    if (!l.account_id) return { ok: false, error: "กรุณาเลือกบัญชีให้ครบทุกบรรทัด" };
    const debit = round2(num(l.debit, { nonNeg: true }));
    const credit = round2(num(l.credit, { nonNeg: true }));
    if (debit > 0 && credit > 0)
      return { ok: false, error: "แต่ละบรรทัดใส่ได้เฉพาะเดบิตหรือเครดิต อย่างใดอย่างหนึ่ง" };
    if (debit === 0 && credit === 0)
      return { ok: false, error: "แต่ละบรรทัดต้องมียอดเดบิตหรือเครดิต" };
    lines.push({ account_id: l.account_id, debit, credit, line_note: l.line_note || null });
    totalDebit += debit;
    totalCredit += credit;
  }
  return { ok: true, lines, totalDebit: round2(totalDebit), totalCredit: round2(totalCredit) };
}

/** GET ?orgId= → journal entry + lines */
export async function GET(req: NextRequest, ctx: Ctx) {
  const t0 = Date.now();
  const { id } = await ctx.params;
  const orgId = orgIdFromQuery(req);
  if (!orgId) return accError("missing orgId");

  const auth = await requireAccountingMember(req, orgId);
  if (!auth.ok) return auth.res;

  try {
    const entry = await getJournalEntry(auth.rls, orgId, id);
    if (!entry) return accError("ไม่พบรายการสมุดรายวัน", 404);
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 200, t0 });
    return NextResponse.json(entry);
  } catch (e) {
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
    return accError((e as Error).message, 500);
  }
}

/** PATCH → แก้ไข journal (draft เท่านั้น · posted แก้ไม่ได้ → void+สร้างใหม่). lines = replace ทั้งชุด. */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const t0 = Date.now();
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orgId = String(body.orgId ?? "");
  if (!orgId) return accError("missing orgId");

  const auth = await requireAccountingMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWriteBackstage(auth.role)) return accError("เฉพาะนักบัญชีเท่านั้นที่ลงบัญชีได้", 403);

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("acc_journal_entries")
    .select("status")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!existing) return accError("ไม่พบรายการสมุดรายวัน", 404);
  if ((existing as { status: string }).status !== "draft") {
    return accError(
      "รายการที่ลงบัญชีแล้ว (posted) แก้ไม่ได้ — ให้ยกเลิก (void) แล้วสร้างใหม่",
      409,
    );
  }

  await setAuditContext(req, auth.userId, orgId);

  const headerPatch: Record<string, unknown> = {};
  if (body.entry_date !== undefined) {
    if (!String(body.entry_date)) return accError("กรุณาเลือกวันที่");
    headerPatch.entry_date = body.entry_date;
  }
  if (body.description !== undefined)
    headerPatch.description = (body.description as string) || null;

  // replace lines ทั้งชุด (ถ้าส่งมา)
  if (body.lines !== undefined) {
    const norm = normalizeLines(body.lines);
    if (!norm.ok) return accError(norm.error);
    const accIds = Array.from(new Set(norm.lines.map((l) => l.account_id)));
    const { data: validAccts } = await admin
      .from("acc_accounts")
      .select("id")
      .eq("org_id", orgId)
      .in("id", accIds);
    if ((validAccts ?? []).length !== accIds.length) return accError("มีบัญชีที่ไม่ถูกต้อง", 400);

    await admin.from("acc_journal_lines").delete().eq("journal_entry_id", id).eq("org_id", orgId);
    const lineRows = norm.lines.map((l, i) => ({
      org_id: orgId,
      journal_entry_id: id,
      account_id: l.account_id,
      debit: l.debit,
      credit: l.credit,
      line_note: l.line_note,
      sort_order: i,
      created_by: auth.userId,
    }));
    const { error: lErr } = await admin.from("acc_journal_lines").insert(lineRows);
    if (lErr) {
      void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
      return accError(lErr.message, 500);
    }
    headerPatch.total_debit = norm.totalDebit;
    headerPatch.total_credit = norm.totalCredit;
  }

  if (Object.keys(headerPatch).length > 0) {
    const { error } = await admin
      .from("acc_journal_entries")
      .update(headerPatch)
      .eq("id", id)
      .eq("org_id", orgId);
    if (error) {
      void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
      return accError(error.message, 500);
    }
  }

  const updated = await getJournalEntry(admin, orgId, id);
  void recordMetric({ orgId, route: ROUTE, method: req.method, status: 200, t0 });
  return NextResponse.json(updated);
}
