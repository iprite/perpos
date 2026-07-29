/**
 * GET /api/acc-firm/reports?orgId=<firmOrgId>
 *
 * Cross-client report data for the firm:
 *   - actionableInvoices: all overdue + due_soon + draft invoices across
 *     active client orgs, with contact name + org info
 *     (สรุปต่อลูกค้าย้ายไปใช้ /api/acc-firm/dashboard แล้ว — ที่นี่ไม่คำนวณซ้ำ)
 *
 * Uses admin client (service role) — firm member doesn't need to be
 * a member of every client org.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireModuleMember } from "../../_lib/module-auth";
import { createAdminClient } from "../../_lib/supabase";
import { fetchAllRows, type RowsPage } from "@/lib/accounting/paging";

type InvoiceRow = {
  id: string;
  org_id: string;
  doc_number: string | null;
  issue_date: string;
  due_date: string | null;
  status: string;
  total: number;
  contact_id: string | null;
  acc_contacts: { name: string } | null;
};

export type ActionableInvoice = {
  id: string;
  orgId: string;
  orgName: string;
  orgSlug: string;
  invoiceNo: string | null;
  contactName: string;
  issueDate: string;
  dueDate: string | null;
  status: string;
  bucket: "overdue" | "due_soon" | "draft" | "open";
  totalAmount: number;
};

export async function GET(req: NextRequest) {
  const firmOrgId = req.nextUrl.searchParams.get("orgId");
  if (!firmOrgId) return NextResponse.json({ error: "missing orgId" }, { status: 400 });

  const auth = await requireModuleMember(req, firmOrgId, "acc_firm");
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();

  // 1. Active client orgs
  const { data: clients, error: cErr } = await admin
    .from("acc_firm_clients")
    .select(
      `
      client_org_id,
      client_org:organizations!acc_firm_clients_client_org_id_fkey (id, name, slug)
    `,
    )
    .eq("firm_org_id", firmOrgId)
    .eq("status", "active");

  const today = new Date().toISOString().slice(0, 10);
  const sevenDaysLater = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10);

  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
  if (!clients?.length) return NextResponse.json({ actionableInvoices: [], asOf: today });

  const clientOrgIds = clients.map((c) => (c.client_org as unknown as { id: string }).id);
  const orgMeta = new Map(
    clients.map((c) => {
      const o = c.client_org as unknown as { id: string; name: string; slug: string };
      return [o.id, o];
    }),
  );

  // 2. Fetch invoices with contact names — accounting "รื้อใหม่" = acc_documents (doc_type='invoice')
  //    + acc_contacts (เดิมอ่าน invoices/contacts ที่ accounting ตัวใหม่ไม่เขียน → ว่างถาวร · INT-1)
  //     ดึงครบทุกแถว — ตัวเลขนี้ถูกเอาไปรวมเป็น KPI (PostgREST ตัด 1,000 แถวเงียบ ๆ)
  const { rows: invoices, truncated } = await fetchAllRows<InvoiceRow>(
    (from, to) =>
      admin
        .from("acc_documents")
        .select(
          "id, org_id, doc_number, issue_date, due_date, status, total, contact_id, acc_contacts(name)",
        )
        .in("org_id", clientOrgIds)
        .eq("doc_type", "invoice")
        .not("status", "in", '("paid","void")')
        .order("due_date", { ascending: true, nullsFirst: false })
        .order("id")
        .range(from, to) as unknown as RowsPage<InvoiceRow>,
  );

  // 3. Classify into buckets
  const actionableInvoices: ActionableInvoice[] = [];

  for (const inv of invoices) {
    const org = orgMeta.get(inv.org_id);
    if (!org) continue;
    const amt = Number(inv.total ?? 0);
    const contact = inv.acc_contacts as unknown as { name: string } | null;

    let bucket: ActionableInvoice["bucket"];
    if (inv.status === "draft") bucket = "draft";
    else if (inv.due_date && inv.due_date < today) bucket = "overdue";
    else if (inv.due_date && inv.due_date <= sevenDaysLater) bucket = "due_soon";
    else bucket = "open";

    if (bucket !== "open") {
      actionableInvoices.push({
        id: inv.id,
        orgId: inv.org_id,
        orgName: org.name,
        orgSlug: org.slug,
        invoiceNo: inv.doc_number,
        contactName: contact?.name ?? "—",
        issueDate: inv.issue_date,
        dueDate: inv.due_date,
        status: inv.status,
        bucket,
        totalAmount: amt,
      });
    }
  }

  // Sort: overdue first, then due_soon, then draft
  const BUCKET_ORDER = { overdue: 0, due_soon: 1, draft: 2, open: 3 };
  actionableInvoices.sort(
    (a, b) =>
      BUCKET_ORDER[a.bucket] - BUCKET_ORDER[b.bucket] ||
      (a.dueDate ?? "").localeCompare(b.dueDate ?? ""),
  );

  return NextResponse.json({ actionableInvoices, asOf: today, truncated });
}
