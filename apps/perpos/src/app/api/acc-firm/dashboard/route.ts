/**
 * GET /api/acc-firm/dashboard?orgId=<firmOrgId>
 *
 * Returns per-client summary for all active clients of the firm:
 *   - invoice buckets: draft / overdue / due_soon / open (count + amount)
 *   - KPI this month: revenue + expense from posted journal entries
 *
 * Uses admin client (service role) so the firm member doesn't need to be
 * a member of every client org to read their summary data.
 *
 * Data source = accounting "รื้อใหม่" schema (acc_*):
 *   - invoice buckets ← acc_documents WHERE doc_type='invoice'
 *   - revenue/expense ← posted acc_journal_lines × acc_accounts.account_type
 *   (เดิมอ่าน invoices/journal_entries/journal_items/accounts ซึ่ง accounting
 *    ตัวใหม่ไม่เขียนแล้ว → ทุก client ขึ้นศูนย์. ดู product-factory/backlog/acc-firm.md INT-1)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireModuleMember } from "../../_lib/module-auth";
import { createAdminClient } from "../../_lib/supabase";

type InvoiceBuckets = {
  draft: { count: number; amount: number };
  overdue: { count: number; amount: number };
  due_soon: { count: number; amount: number };
  open: { count: number; amount: number };
};

type ClientSummary = {
  id: string;
  client_org: { id: string; name: string; slug: string };
  modules_managed: string[];
  status: string;
  invoices: InvoiceBuckets;
  kpi: { revenue: number; expense: number };
};

export async function GET(req: NextRequest) {
  const firmOrgId = req.nextUrl.searchParams.get("orgId");
  if (!firmOrgId) return NextResponse.json({ error: "missing orgId" }, { status: 400 });

  const auth = await requireModuleMember(req, firmOrgId, "acc_firm");
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();

  // ── 1. Get active client orgs ─────────────────────────────────────────────
  const { data: clients, error: cErr } = await admin
    .from("acc_firm_clients")
    .select(
      `
      id, modules_managed, status,
      client_org:organizations!acc_firm_clients_client_org_id_fkey (id, name, slug)
    `,
    )
    .eq("firm_org_id", firmOrgId)
    .eq("status", "active");

  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
  if (!clients?.length) return NextResponse.json({ summaries: [] });

  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 7) + "-01";
  const sevenDaysLater = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10);

  // ── 2. Batch fetch invoice + KPI data for all clients ─────────────────────
  const clientOrgIds = clients.map((c) => (c.client_org as unknown as { id: string }).id);

  const [{ data: invoiceRows }, { data: lineRows }] = await Promise.all([
    // Invoice snapshot per org (เฉพาะ doc_type='invoice' — acc_documents รวมใบเสนอราคา/ใบเสร็จด้วย)
    admin
      .from("acc_documents")
      .select("org_id, status, due_date, total")
      .in("org_id", clientOrgIds)
      .eq("doc_type", "invoice")
      .neq("status", "void"),

    // Posted journal lines this month (for revenue / expense) — ยึด pattern lib/accounting/reports.ts
    admin
      .from("acc_journal_lines")
      .select(
        `
        org_id, debit, credit,
        acc_accounts ( account_type ),
        acc_journal_entries!inner ( status, entry_date )
      `,
      )
      .in("org_id", clientOrgIds)
      .eq("acc_journal_entries.status", "posted")
      .gte("acc_journal_entries.entry_date", monthStart)
      .lte("acc_journal_entries.entry_date", today),
  ]);

  // ── 3. Aggregate invoice buckets per org ──────────────────────────────────
  const invoiceMap = new Map<string, InvoiceBuckets>();
  for (const orgId of clientOrgIds) {
    invoiceMap.set(orgId, {
      draft: { count: 0, amount: 0 },
      overdue: { count: 0, amount: 0 },
      due_soon: { count: 0, amount: 0 },
      open: { count: 0, amount: 0 },
    });
  }

  for (const inv of invoiceRows ?? []) {
    const buckets = invoiceMap.get(inv.org_id);
    if (!buckets) continue;
    const amt = Number(inv.total ?? 0);

    if (inv.status === "draft") {
      buckets.draft.count++;
      buckets.draft.amount += amt;
    } else if (inv.due_date && inv.due_date < today && inv.status !== "paid") {
      buckets.overdue.count++;
      buckets.overdue.amount += amt;
    } else if (inv.due_date && inv.due_date <= sevenDaysLater && inv.status !== "paid") {
      buckets.due_soon.count++;
      buckets.due_soon.amount += amt;
    } else if (!["paid", "void"].includes(inv.status)) {
      buckets.open.count++;
      buckets.open.amount += amt;
    }
  }

  // ── 4. Aggregate KPI (revenue / expense) per org ─────────────────────────
  const kpiMap = new Map<string, { revenue: number; expense: number }>();
  for (const orgId of clientOrgIds) kpiMap.set(orgId, { revenue: 0, expense: 0 });

  for (const line of (lineRows ?? []) as unknown as Array<{
    org_id: string;
    debit: number;
    credit: number;
    acc_accounts: { account_type: string } | null;
  }>) {
    const kpi = kpiMap.get(line.org_id);
    if (!kpi) continue;
    const type = line.acc_accounts?.account_type;
    const debit = Number(line.debit ?? 0);
    const credit = Number(line.credit ?? 0);
    if (type === "income") kpi.revenue += credit - debit;
    if (type === "expense") kpi.expense += debit - credit;
  }

  // ── 5. Assemble response ──────────────────────────────────────────────────
  const summaries: ClientSummary[] = clients.map((c) => {
    const corg = c.client_org as unknown as { id: string; name: string; slug: string };
    return {
      id: c.id,
      client_org: corg,
      modules_managed: c.modules_managed as string[],
      status: c.status,
      invoices: invoiceMap.get(corg.id) ?? {
        draft: { count: 0, amount: 0 },
        overdue: { count: 0, amount: 0 },
        due_soon: { count: 0, amount: 0 },
        open: { count: 0, amount: 0 },
      },
      kpi: kpiMap.get(corg.id) ?? { revenue: 0, expense: 0 },
    };
  });

  return NextResponse.json({ summaries, asOf: today });
}
