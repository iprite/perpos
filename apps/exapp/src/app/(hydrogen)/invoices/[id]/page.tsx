"use client";

import { useParams, useRouter } from "next/navigation";
import React from "react";
import { Button, Input, Textarea } from "rizzui";
import toast from "react-hot-toast";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useAuth } from "@/app/shared/auth-provider";

type InvoiceRow = {
  id: string;
  doc_no: string | null;
  status: string;
  payment_mode: string;
  order_id: string | null;
  installment_no: number | null;
  issue_date: string;
  due_date: string | null;
  customer_id: string | null;
  customer_snapshot: any;
  source_quote_id: string | null;
  subtotal: number;
  discount_total: number;
  include_vat: boolean;
  vat_rate: number;
  vat_amount: number;
  wht_rate: number;
  wht_amount: number;
  grand_total: number;
  notes: string | null;
  issued_at: string | null;
  paid_confirmed_at: string | null;
};

type ItemDraft = {
  key: string;
  name: string;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
};

type PaymentRow = {
  id: string;
  installment_no: number;
  amount: number;
  note: string | null;
  slip_storage_provider: string | null;
  slip_storage_bucket: string | null;
  slip_storage_path: string | null;
  slip_file_name: string | null;
  confirmed_at: string | null;
};

type ReceiptMini = { id: string; doc_no: string | null };

type CustomerOption = {
  id: string;
  name: string;
  address: string | null;
  tax_id: string | null;
  branch_name: string | null;
};

function asMoney(n: number) {
  const x = Number.isFinite(n) ? n : 0;
  return new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(x);
}

function safeNumber(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function toLineTotal(qty: string, unitPrice: string) {
  const q = Math.max(0, safeNumber(qty));
  const p = Math.max(0, safeNumber(unitPrice));
  return Math.round(q * p * 100) / 100;
}

async function getSignedStorageUrl(params: { supabase: any; table: string; id: string; disposition: "inline" | "attachment" }) {
  const sessionRes = await params.supabase.auth.getSession();
  const token = sessionRes.data.session?.access_token;
  if (!token) throw new Error("ยังไม่ได้เข้าสู่ระบบ");
  const res = await fetch("/api/storage/signed-url", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ table: params.table, id: params.id, disposition: params.disposition }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || "ขอ signed url ไม่สำเร็จ");
  }
  const data = (await res.json()) as { ok: true; url: string };
  return data.url;
}

function statusLabel(s: string) {
  if (s === "draft") return "ร่าง";
  if (s === "issued") return "ออกเอกสารแล้ว";
  if (s === "paid_confirmed") return "ยืนยันรับเงินแล้ว";
  if (s === "cancelled") return "ยกเลิก";
  return s;
}

export default function InvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = React.useMemo(() => createSupabaseBrowserClient(), []);
  const { userId } = useAuth();
  const id = String((params as any)?.id ?? "").trim();

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [invoice, setInvoice] = React.useState<InvoiceRow | null>(null);
  const [items, setItems] = React.useState<ItemDraft[]>([]);

  const [customers, setCustomers] = React.useState<CustomerOption[]>([]);
  const [customerId, setCustomerId] = React.useState("");
  const [customerName, setCustomerName] = React.useState("");
  const [customerAddress, setCustomerAddress] = React.useState("");
  const [customerTaxId, setCustomerTaxId] = React.useState("");
  const [customerBranch, setCustomerBranch] = React.useState("");

  const [issueDate, setIssueDate] = React.useState("");
  const [dueDate, setDueDate] = React.useState("");
  const [includeVat, setIncludeVat] = React.useState(true);
  const [vatRate, setVatRate] = React.useState("7");
  const [whtRate, setWhtRate] = React.useState("0");
  const [discountTotal, setDiscountTotal] = React.useState("0");
  const [notes, setNotes] = React.useState("");

  const [payment, setPayment] = React.useState<PaymentRow | null>(null);
  const [receipt, setReceipt] = React.useState<ReceiptMini | null>(null);

  const [payAmount, setPayAmount] = React.useState("");
  const [payNote, setPayNote] = React.useState("");
  const [payFile, setPayFile] = React.useState<File | null>(null);
  const [paySubmitting, setPaySubmitting] = React.useState(false);
  const [receiptSubmitting, setReceiptSubmitting] = React.useState(false);

  const computed = React.useMemo(() => {
    const subtotal = items.reduce((acc, it) => acc + toLineTotal(it.quantity, it.unitPrice), 0);
    const discount = Math.max(0, safeNumber(discountTotal));
    const afterDiscount = Math.max(0, subtotal - discount);
    const vr = Math.max(0, safeNumber(vatRate));
    const vat = includeVat && vr > 0 ? Math.round(afterDiscount * (vr / 100) * 100) / 100 : 0;
    const wr = Math.max(0, safeNumber(whtRate));
    const wht = wr > 0 ? Math.round(afterDiscount * (wr / 100) * 100) / 100 : 0;
    const grand = Math.round((afterDiscount + vat - wht) * 100) / 100;
    return { subtotal, discount, afterDiscount, vat, wht, grand, whtRate: wr };
  }, [discountTotal, includeVat, items, vatRate, whtRate]);

  const refresh = React.useCallback(() => {
    if (!id) return;
    Promise.resolve().then(async () => {
      setLoading(true);
      setError(null);

      const [invRes, itemRes, payRes, recRes, custRes] = await Promise.all([
        supabase
          .from("invoices")
          .select(
            "id,doc_no,status,payment_mode,order_id,installment_no,issue_date,due_date,customer_id,customer_snapshot,source_quote_id,subtotal,discount_total,include_vat,vat_rate,vat_amount,wht_rate,wht_amount,grand_total,notes,issued_at,paid_confirmed_at",
          )
          .eq("id", id)
          .single(),
        supabase
          .from("invoice_items")
          .select("id,name,description,quantity,unit,unit_price,sort_order")
          .eq("invoice_id", id)
          .order("sort_order", { ascending: true }),
        supabase
          .from("invoice_payments")
          .select(
            "id,installment_no,amount,note,slip_storage_provider,slip_storage_bucket,slip_storage_path,slip_file_name,confirmed_at",
          )
          .eq("invoice_id", id)
          .order("installment_no", { ascending: true }),
        supabase.from("receipts").select("id,doc_no").eq("invoice_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase
          .from("customers")
          .select("id,name,address,tax_id,branch_name")
          .order("updated_at", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(300),
      ]);

      let custData = custRes.data;
      if (custRes.error) {
        const msg = String(custRes.error.message ?? "");
        if (msg.includes("customers.updated_at") || (msg.includes("updated_at") && msg.toLowerCase().includes("does not exist"))) {
          const fallback = await supabase.from("customers").select("id,name,address,tax_id,branch_name").order("created_at", { ascending: false }).limit(300);
          if (!fallback.error) custData = fallback.data;
        }
      }

      const firstErr = invRes.error ?? itemRes.error ?? payRes.error ?? recRes.error;
      if (firstErr) {
        setError(firstErr.message);
        setInvoice(null);
        setItems([]);
        setPayment(null);
        setReceipt(null);
        setCustomers([]);
        setLoading(false);
        return;
      }

      const inv = (invRes.data as any) as InvoiceRow;
      setInvoice(inv);

      const snap = (inv.customer_snapshot ?? {}) as any;
      setCustomerId(String(inv.customer_id ?? ""));
      setCustomerName(String(snap.name ?? ""));
      setCustomerAddress(String(snap.address ?? ""));
      setCustomerTaxId(String(snap.tax_id ?? ""));
      setCustomerBranch(String(snap.branch_name ?? ""));

      setIssueDate(String(inv.issue_date ?? ""));
      setDueDate(String(inv.due_date ?? ""));
      setIncludeVat(!!inv.include_vat);
      setVatRate(String(inv.vat_rate ?? 7));
      setWhtRate(String((inv as any).wht_rate ?? 0));
      setDiscountTotal(String(inv.discount_total ?? 0));
      setNotes(String(inv.notes ?? ""));

      const nextItems: ItemDraft[] = ((itemRes.data ?? []) as any[]).map((it, idx) => ({
        key: String(it.id ?? `${idx + 1}`),
        name: String(it.name ?? ""),
        description: String(it.description ?? ""),
        quantity: String(it.quantity ?? 1),
        unit: String(it.unit ?? ""),
        unitPrice: String(it.unit_price ?? 0),
      }));
      setItems(nextItems.length ? nextItems : [{ key: "1", name: "บริการ", description: "", quantity: "1", unit: "", unitPrice: "0" }]);

      const activeInstallmentNo = (() => {
        const n = Number(inv.installment_no ?? 0);
        return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
      })();
      const payRows = ((payRes.data ?? []) as any[]) as PaymentRow[];
      setPayment(payRows.find((p) => Number(p.installment_no) === activeInstallmentNo) ?? null);
      setReceipt((recRes.data as any) ? ((recRes.data as any) as ReceiptMini) : null);
      setCustomers(((custData ?? []) as any[]) as CustomerOption[]);

      setPayAmount(String(inv.grand_total ?? 0));

      setLoading(false);
    });
  }, [id, supabase]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const onPickCustomer = React.useCallback(
    (cid: string) => {
      setCustomerId(cid);
      const c = customers.find((x) => x.id === cid) ?? null;
      if (!c) return;
      setCustomerName(c.name);
      setCustomerAddress(String(c.address ?? ""));
      setCustomerTaxId(String(c.tax_id ?? ""));
      setCustomerBranch(String(c.branch_name ?? ""));
    },
    [customers],
  );

  const saveDraft = React.useCallback(async () => {
    if (!invoice) return;
    setSaving(true);
    setError(null);
    try {
      const payloadItems = items
        .map((it, idx) => {
          const name = it.name.trim();
          const q = Math.max(0, safeNumber(it.quantity));
          const p = Math.max(0, safeNumber(it.unitPrice));
          if (!name) return null;
          return {
            invoice_id: invoice.id,
            name,
            description: it.description.trim() || null,
            quantity: q,
            unit: it.unit.trim() || null,
            unit_price: p,
            line_total: Math.round(q * p * 100) / 100,
            sort_order: idx + 1,
          };
        })
        .filter(Boolean) as any[];

      if (payloadItems.length === 0) throw new Error("กรุณาเพิ่มรายการอย่างน้อย 1 รายการ");

      const customerSnapshot = {
        name: customerName.trim(),
        address: customerAddress.trim(),
        tax_id: customerTaxId.trim(),
        branch_name: customerBranch.trim(),
      };

      const invUpd = await supabase
        .from("invoices")
        .update({
          issue_date: issueDate || new Date().toISOString().slice(0, 10),
          due_date: dueDate.trim() || null,
          customer_id: customerId.trim() || null,
          customer_snapshot: customerSnapshot,
          subtotal: computed.subtotal,
          discount_total: computed.discount,
          include_vat: includeVat,
          vat_rate: safeNumber(vatRate),
          vat_amount: computed.vat,
          wht_rate: computed.whtRate,
          wht_amount: computed.wht,
          grand_total: computed.grand,
          notes: notes.trim() || null,
        })
        .eq("id", invoice.id);
      if (invUpd.error) throw new Error(invUpd.error.message);

      const del = await supabase.from("invoice_items").delete().eq("invoice_id", invoice.id);
      if (del.error) throw new Error(del.error.message);

      const ins = await supabase.from("invoice_items").insert(payloadItems);
      if (ins.error) throw new Error(ins.error.message);

      toast.success("บันทึกแล้ว");
      await refresh();
    } catch (e: any) {
      setError(e?.message ?? "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }, [computed, customerAddress, customerBranch, customerId, customerName, customerTaxId, dueDate, includeVat, invoice, issueDate, items, notes, refresh, supabase, vatRate]);

  const issueInvoice = React.useCallback(async () => {
    if (!invoice) return;
    setSaving(true);
    setError(null);
    try {
      const res = await supabase
        .from("invoices")
        .update({ status: "issued", issued_at: new Date().toISOString() })
        .eq("id", invoice.id);
      if (res.error) throw new Error(res.error.message);
      toast.success("ออกใบแจ้งหนี้แล้ว");
      await refresh();
    } catch (e: any) {
      setError(e?.message ?? "ออกใบแจ้งหนี้ไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }, [invoice, refresh, supabase]);

  const confirmPayment = React.useCallback(async () => {
    if (!invoice || !payFile) return;
    const amt = safeNumber(payAmount);
    if (amt <= 0) {
      toast.error("กรุณาใส่ยอดรับ");
      return;
    }
    setPaySubmitting(true);
    try {
      const form = new FormData();
      form.set("invoiceId", invoice.id);
      form.set("installmentNo", String(invoice.installment_no ?? 1));
      form.set("amount", String(amt));
      form.set("note", payNote.trim());
      form.set("file", payFile);
      const res = await fetch("/api/invoices/confirm-payment", { method: "POST", body: form });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "ยืนยันรับเงินไม่สำเร็จ");
      }
      toast.success("ยืนยันรับเงินแล้ว");
      setPayFile(null);
      setPayNote("");
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "ยืนยันรับเงินไม่สำเร็จ");
    } finally {
      setPaySubmitting(false);
    }
  }, [invoice, payAmount, payFile, payNote, refresh]);

  const openPaymentSlip = React.useCallback(async () => {
    if (!payment) return;
    const url = await getSignedStorageUrl({ supabase, table: "invoice_payments", id: payment.id, disposition: "inline" });
    window.open(url, "_blank", "noopener,noreferrer");
  }, [payment, supabase]);

  const createReceipt = React.useCallback(async () => {
    if (!invoice) return;
    if (receiptSubmitting) return;
    setReceiptSubmitting(true);
    try {
      const res = await fetch("/api/receipts/from-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: invoice.id }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "ออกใบเสร็จไม่สำเร็จ");
      }
      const data = (await res.json().catch(() => ({}))) as { receiptId?: string; receiptNo?: string | null };
      const receiptId = String(data.receiptId ?? "").trim();
      toast.success(`ออกใบเสร็จ${data.receiptNo ? ` ${data.receiptNo}` : ""} แล้ว`);
      if (receiptId) router.push(`/receipts/${receiptId}`);
    } catch (e: any) {
      toast.error(e?.message ?? "ออกใบเสร็จไม่สำเร็จ");
    } finally {
      setReceiptSubmitting(false);
    }
  }, [invoice, receiptSubmitting, router]);

  const downloadPdf = React.useCallback(async () => {
    if (!invoice) return;
    try {
      const res = await fetch("/api/invoices/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: invoice.id, issued_by_profile_id: userId }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "สร้าง PDF ไม่สำเร็จ");
      }
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = invoice.doc_no ? `${invoice.doc_no}.pdf` : `invoice-${invoice.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
    } catch (e: any) {
      toast.error(e?.message ?? "สร้าง PDF ไม่สำเร็จ");
    }
  }, [invoice, userId]);

  if (loading) return <div className="text-sm text-gray-600">กำลังโหลด...</div>;
  if (!invoice) return <div className="text-sm text-red-700">{error ?? "ไม่พบเอกสาร"}</div>;

  const isFullMode = String(invoice.payment_mode ?? "") === "full";
  const canEdit = invoice.status === "draft" && !isFullMode;
  const canIssue = invoice.status === "draft";
  const canConfirmPayment = invoice.status === "issued";
  const canIssueReceipt = invoice.status === "paid_confirmed";

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-gray-900">ใบแจ้งหนี้ (IV)</div>
          <div className="mt-1 text-sm text-gray-600">
            เลขที่: <span className="font-medium text-gray-900">{invoice.doc_no ?? "(ร่าง)"}</span> • สถานะ: {statusLabel(invoice.status)}
            {invoice.payment_mode ? ` • โหมด: ${isFullMode ? "ชำระเต็ม" : "แบ่งชำระ"}` : ""}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => router.push("/invoices")}>
            กลับ
          </Button>
          <Button variant="outline" onClick={downloadPdf} disabled={!invoice.doc_no}>
            ดาวน์โหลด PDF
          </Button>
          <Button onClick={saveDraft} disabled={!canEdit || saving}>
            บันทึก
          </Button>
          <Button onClick={issueInvoice} disabled={!canIssue || saving}>
            ออกเอกสาร
          </Button>
        </div>
      </div>

      {error ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="text-sm font-semibold text-gray-900">ข้อมูลลูกค้า</div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div>
                <div className="text-sm font-medium text-gray-700">อ้างอิงลูกค้าในระบบ</div>
                <select
                  className="mt-2 h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm"
                  value={customerId}
                  onChange={(e) => onPickCustomer(e.target.value)}
                  disabled={!canEdit}
                >
                  <option value="">- ไม่ผูก -</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className="text-sm font-medium text-gray-700">ชื่อลูกค้า</div>
                <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} disabled={!canEdit} />
              </div>
              <div className="md:col-span-2">
                <div className="text-sm font-medium text-gray-700">ที่อยู่</div>
                <Textarea value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} disabled={!canEdit} />
              </div>
              <div>
                <div className="text-sm font-medium text-gray-700">เลขที่ภาษี</div>
                <Input value={customerTaxId} onChange={(e) => setCustomerTaxId(e.target.value)} disabled={!canEdit} />
              </div>
              <div>
                <div className="text-sm font-medium text-gray-700">สาขา</div>
                <Input value={customerBranch} onChange={(e) => setCustomerBranch(e.target.value)} disabled={!canEdit} />
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="text-sm font-semibold text-gray-900">ข้อมูลเอกสาร</div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <div>
                <div className="text-sm font-medium text-gray-700">วันที่ออก</div>
                <input
                  type="date"
                  className="mt-2 h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                  disabled={!canEdit}
                />
              </div>
              <div>
                <div className="text-sm font-medium text-gray-700">ครบกำหนด</div>
                <input
                  type="date"
                  className="mt-2 h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  disabled={!canEdit}
                />
              </div>
              <div>
                <div className="text-sm font-medium text-gray-700">ส่วนลด</div>
                <Input value={discountTotal} onChange={(e) => setDiscountTotal(e.target.value)} disabled={!canEdit} />
              </div>

              <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300"
                  checked={includeVat}
                  onChange={(e) => setIncludeVat(e.target.checked)}
                  disabled={!canEdit}
                />
                คิด VAT
              </label>
              <div>
                <div className="text-sm font-medium text-gray-700">อัตรา VAT (%)</div>
                <Input value={vatRate} onChange={(e) => setVatRate(e.target.value)} disabled={!canEdit || !includeVat} />
              </div>
              <div />
            </div>

            <div className="mt-4">
              <div className="text-sm font-medium text-gray-700">หมายเหตุ</div>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!canEdit} />
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-gray-900">รายการ</div>
              <Button
                variant="outline"
                onClick={() => setItems((prev) => [...prev, { key: String(Date.now()), name: "", description: "", quantity: "1", unit: "", unitPrice: "0" }])}
                disabled={!canEdit}
              >
                เพิ่มรายการ
              </Button>
            </div>

            <div className="mt-3 overflow-hidden rounded-md border border-gray-200">
              <div className="grid grid-cols-[1fr_90px_90px_120px_120px_40px] gap-2 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600">
                <div>รายละเอียด</div>
                <div className="text-right">จำนวน</div>
                <div>หน่วย</div>
                <div className="text-right">ราคา</div>
                <div className="text-right">รวม</div>
                <div />
              </div>
              <div className="divide-y divide-gray-100">
                {items.map((it) => (
                  <div key={it.key} className="grid grid-cols-[1fr_90px_90px_120px_120px_40px] gap-2 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <Input
                        placeholder="ชื่อรายการ"
                        value={it.name}
                        onChange={(e) =>
                          setItems((prev) => prev.map((x) => (x.key === it.key ? { ...x, name: e.target.value } : x)))
                        }
                        disabled={!canEdit}
                      />
                      <div className="mt-2">
                        <Input
                          placeholder="รายละเอียด (ถ้ามี)"
                          value={it.description}
                          onChange={(e) =>
                            setItems((prev) => prev.map((x) => (x.key === it.key ? { ...x, description: e.target.value } : x)))
                          }
                          disabled={!canEdit}
                        />
                      </div>
                    </div>
                    <Input
                      value={it.quantity}
                      onChange={(e) => setItems((prev) => prev.map((x) => (x.key === it.key ? { ...x, quantity: e.target.value } : x)))}
                      disabled={!canEdit}
                      inputMode="decimal"
                    />
                    <Input
                      value={it.unit}
                      onChange={(e) => setItems((prev) => prev.map((x) => (x.key === it.key ? { ...x, unit: e.target.value } : x)))}
                      disabled={!canEdit}
                    />
                    <Input
                      value={it.unitPrice}
                      onChange={(e) => setItems((prev) => prev.map((x) => (x.key === it.key ? { ...x, unitPrice: e.target.value } : x)))}
                      disabled={!canEdit}
                      inputMode="decimal"
                    />
                    <div className="flex h-10 items-center justify-end text-sm font-semibold text-gray-900">
                      {asMoney(toLineTotal(it.quantity, it.unitPrice))}
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => setItems((prev) => prev.filter((x) => x.key !== it.key))}
                      disabled={!canEdit || items.length <= 1}
                    >
                      ลบ
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="text-sm font-semibold text-gray-900">การรับชำระ</div>
            {invoice.status === "paid_confirmed" ? (
              <div className="mt-3 text-sm text-gray-700">
                <div>ยืนยันรับเงินแล้ว: {invoice.paid_confirmed_at ?? "-"}</div>
                <div>ยอดรับ: {payment ? asMoney(Number(payment.amount ?? 0)) : asMoney(Number(invoice.grand_total ?? 0))} บาท</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {payment ? (
                    <Button variant="outline" onClick={openPaymentSlip}>
                      ดูหลักฐานการโอน
                    </Button>
                  ) : null}
                  {receipt ? (
                    <Button variant="outline" onClick={() => router.push(`/receipts/${receipt.id}`)}>
                      ไปที่ใบเสร็จ {receipt.doc_no ?? ""}
                    </Button>
                  ) : (
                    <Button onClick={createReceipt} disabled={!canIssueReceipt || receiptSubmitting}>
                      ออกใบเสร็จ/ใบกำกับภาษี
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div>
                  <div className="text-sm font-medium text-gray-700">ยอดรับ</div>
                  <Input value={payAmount} onChange={(e) => setPayAmount(e.target.value)} inputMode="decimal" disabled={!canConfirmPayment || paySubmitting} />
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-700">แนบหลักฐานการโอน</div>
                  <input
                    type="file"
                    className="mt-2 block w-full text-sm"
                    accept="image/*,application/pdf"
                    onChange={(e) => setPayFile(e.target.files?.[0] ?? null)}
                    disabled={!canConfirmPayment || paySubmitting}
                  />
                </div>
                <div className="md:col-span-2">
                  <div className="text-sm font-medium text-gray-700">หมายเหตุ (ถ้ามี)</div>
                  <Input value={payNote} onChange={(e) => setPayNote(e.target.value)} disabled={!canConfirmPayment || paySubmitting} />
                </div>
                <div className="md:col-span-2 flex justify-end">
                  <Button onClick={confirmPayment} disabled={!canConfirmPayment || paySubmitting || !payFile}>
                    ยืนยันรับเงิน
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="text-sm font-semibold text-gray-900">สรุปยอด</div>
            <div className="mt-3 space-y-1 text-sm">
              <div className="flex items-center justify-between">
                <div className="text-gray-600">รวมก่อนส่วนลด</div>
                <div className="font-medium text-gray-900">{asMoney(computed.subtotal)}</div>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-gray-600">ส่วนลด</div>
                <div className="font-medium text-gray-900">{asMoney(computed.discount)}</div>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-gray-600">ยอดหลังส่วนลด</div>
                <div className="font-medium text-gray-900">{asMoney(computed.afterDiscount)}</div>
              </div>
              {includeVat ? (
                <div className="flex items-center justify-between">
                  <div className="text-gray-600">VAT</div>
                  <div className="font-medium text-gray-900">{asMoney(computed.vat)}</div>
                </div>
              ) : null}
              {computed.whtRate > 0 ? (
                <div className="flex items-center justify-between">
                  <div className="text-gray-600">หัก ณ ที่จ่าย ({computed.whtRate}%)</div>
                  <div className="font-medium text-gray-900">{asMoney(computed.wht)}</div>
                </div>
              ) : null}
              {computed.whtRate > 0 ? (
                <div className="flex items-center justify-between">
                  <div className="text-gray-600">ยอดก่อนหัก ณ ที่จ่าย</div>
                  <div className="font-medium text-gray-900">{asMoney(computed.grand + computed.wht)}</div>
                </div>
              ) : null}
              <div className="mt-2 flex items-center justify-between border-t border-gray-200 pt-2">
                <div className="text-sm font-semibold text-gray-900">ยอดสุทธิ</div>
                <div className="text-sm font-semibold text-gray-900">{asMoney(computed.grand)}</div>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-700">
            <div className="font-semibold text-gray-900">ข้อมูลอ้างอิง</div>
            <div className="mt-2">Order: {invoice.order_id ?? "-"}</div>
            <div>งวด: {invoice.installment_no ?? "-"}</div>
            <div>โหมด: {isFullMode ? "ชำระเต็ม" : "แบ่งชำระ"}</div>
            <div>อ้างอิง QT: {invoice.source_quote_id ?? "-"}</div>
            <div>ออกเอกสารเมื่อ: {invoice.issued_at ?? "-"}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
