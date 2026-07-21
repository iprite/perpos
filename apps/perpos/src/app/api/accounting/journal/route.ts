import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../_lib/supabase";
import { setAuditContext } from "../../_lib/audit";
import { recordMetric } from "@/lib/metrics";
import {
  requireAccountingMember,
  canWriteBackstage,
  accError,
  orgIdFromQuery,
  num,
  round2,
  nextDocNumber,
} from "../_lib";
import { listJournalEntries } from "@/lib/accounting/journal";

const ROUTE = "/api/accounting/journal";

interface LineInput {
  account_id: string;
  debit?: unknown;
  credit?: unknown;
  line_note?: string;
}

/**
 * validate + normalize lines (G2 nested):
 *   - แต่ละบรรทัด debit หรือ credit อย่างใดอย่างหนึ่ง > 0 (XOR), ≥ 0, NaN guard
 *   - คืน { lines, totalDebit, totalCredit }
 */
function normalizeLines(raw: unknown):
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

/** GET ?orgId=&status=&source=&from=&to= → สมุดรายวัน (header list) */
export async function GET(req: NextRequest) {
  const t0 = Date.now();
  const orgId = orgIdFromQuery(req);
  if (!orgId) return accError("missing orgId");

  const auth = await requireAccountingMember(req, orgId);
  if (!auth.ok) return auth.res;

  const p = req.nextUrl.searchParams;
  try {
    const data = await listJournalEntries(auth.rls, orgId, {
      status: p.get("status") ?? undefined,
      source: p.get("source") ?? undefined,
      from: p.get("from") ?? undefined,
      to: p.get("to") ?? undefined,
    });
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 200, t0 });
    return NextResponse.json({ entries: data });
  } catch (e) {
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
    return accError((e as Error).message, 500);
  }
}

/** POST → สร้าง journal entry (draft) + lines nested atomic (G2) */
export async function POST(req: NextRequest) {
  const t0 = Date.now();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orgId = String(body.orgId ?? "");
  if (!orgId) return accError("missing orgId");

  const auth = await requireAccountingMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWriteBackstage(auth)) return accError("เฉพาะนักบัญชีเท่านั้นที่ลงบัญชีได้", 403);

  const entryDate = String(body.entry_date ?? "");
  if (!entryDate) return accError("กรุณาเลือกวันที่");
  const norm = normalizeLines(body.lines);
  if (!norm.ok) return accError(norm.error);

  await setAuditContext(req, auth.userId, orgId);
  const admin = createAdminClient();

  // ยืนยันบัญชีทุกบรรทัดอยู่ org เดียวกัน (กัน cross-org account)
  const accIds = Array.from(new Set(norm.lines.map((l) => l.account_id)));
  const { data: validAccts } = await admin
    .from("acc_accounts")
    .select("id")
    .eq("org_id", orgId)
    .in("id", accIds);
  if ((validAccts ?? []).length !== accIds.length) return accError("มีบัญชีที่ไม่ถูกต้อง", 400);

  const year = Number(entryDate.slice(0, 4));
  const entryNumber = await nextDocNumber(admin, "acc_journal_entries", orgId, "JV", year);

  const { data: header, error: hErr } = await admin
    .from("acc_journal_entries")
    .insert({
      org_id: orgId,
      entry_number: entryNumber,
      entry_date: entryDate,
      description: (body.description as string) || null,
      status: "draft",
      source: "manual",
      total_debit: norm.totalDebit,
      total_credit: norm.totalCredit,
      created_by: auth.userId,
    })
    .select("id")
    .single();
  if (hErr) {
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
    return accError(hErr.message, 500);
  }
  const journalId = (header as { id: string }).id;

  const lineRows = norm.lines.map((l, i) => ({
    org_id: orgId,
    journal_entry_id: journalId,
    account_id: l.account_id,
    debit: l.debit,
    credit: l.credit,
    line_note: l.line_note,
    sort_order: i,
    created_by: auth.userId,
  }));
  const { error: lErr } = await admin.from("acc_journal_lines").insert(lineRows);
  if (lErr) {
    await admin.from("acc_journal_entries").delete().eq("id", journalId).eq("org_id", orgId);
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
    return accError(lErr.message, 500);
  }
  void recordMetric({ orgId, route: ROUTE, method: req.method, status: 201, t0 });
  return NextResponse.json({ id: journalId, entry_number: entryNumber }, { status: 201 });
}
