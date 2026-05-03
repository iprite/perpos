"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React from "react";
import { Button, Input } from "rizzui";
import toast from "react-hot-toast";

import { useAuth } from "@/app/shared/auth-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Modal } from "@core/modal-views/modal";

type InvoiceRow = {
  id: string;
  doc_no: string | null;
  status: string;
  payment_mode: string;
  issue_date: string;
  customer_snapshot: any;
  grand_total: number;
  created_at: string;
};

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

function statusLabel(s: string) {
  if (s === "draft") return "ร่าง";
  if (s === "issued") return "ออกเอกสารแล้ว";
  if (s === "paid_confirmed") return "ยืนยันรับเงินแล้ว";
  if (s === "cancelled") return "ยกเลิก";
  return s;
}

export default function InvoicesPage() {
  const router = useRouter();
  const { role } = useAuth();
  const supabase = React.useMemo(() => createSupabaseBrowserClient(), []);

  const [rows, setRows] = React.useState<InvoiceRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");

  const [createOpen, setCreateOpen] = React.useState(false);
  const [customers, setCustomers] = React.useState<CustomerOption[]>([]);
  const [customerId, setCustomerId] = React.useState("");
  const [creating, setCreating] = React.useState(false);

  const canCreate = role === "admin" || role === "sale" || role === "operation";

  const refresh = React.useCallback(() => {
    Promise.resolve().then(async () => {
      setLoading(true);
      setError(null);
      const res = await supabase
        .from("invoices")
        .select("id,doc_no,status,payment_mode,issue_date,customer_snapshot,grand_total,created_at")
        .order("created_at", { ascending: false })
        .limit(300);
      if (res.error) {
        setError(res.error.message);
        setRows([]);
        setLoading(false);
        return;
      }
      setRows(((res.data ?? []) as any[]) as InvoiceRow[]);
      setLoading(false);
    });
  }, [supabase]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const doc = String(r.doc_no ?? "").toLowerCase();
      const name = String((r.customer_snapshot ?? {})?.name ?? "").toLowerCase();
      return doc.includes(q) || name.includes(q);
    });
  }, [rows, search]);

  const openCreate = React.useCallback(() => {
    if (!canCreate) return;
    setCreateOpen(true);
    setCustomerId("");
    Promise.resolve().then(async () => {
      const res = await supabase
        .from("customers")
        .select("id,name,address,tax_id,branch_name")
        .order("created_at", { ascending: false })
        .limit(300);
      if (!res.error) setCustomers(((res.data ?? []) as any[]) as CustomerOption[]);
    });
  }, [canCreate, supabase]);

  const createDraft = React.useCallback(async () => {
    const cid = customerId.trim();
    if (!cid) return;
    setCreating(true);
    try {
      const c = customers.find((x) => x.id === cid) ?? null;
      const snapshot = {
        name: String(c?.name ?? "").trim(),
        address: String(c?.address ?? "").trim(),
        tax_id: String(c?.tax_id ?? "").trim(),
        branch_name: String(c?.branch_name ?? "").trim(),
      };

      const invRes = await supabase
        .from("invoices")
        .insert({
          status: "draft",
          issue_date: new Date().toISOString().slice(0, 10),
          customer_id: cid,
          customer_snapshot: snapshot,
        })
        .select("id")
        .single();
      if (invRes.error || !invRes.data) throw new Error(invRes.error?.message ?? "สร้างใบแจ้งหนี้ไม่สำเร็จ");
      const invoiceId = String((invRes.data as any).id);

      const itRes = await supabase.from("invoice_items").insert([
        {
          invoice_id: invoiceId,
          name: "บริการ",
          description: null,
          quantity: 1,
          unit: null,
          unit_price: 0,
          line_total: 0,
          sort_order: 1,
        },
      ]);
      if (itRes.error) throw new Error(itRes.error.message);

      toast.success("สร้างใบแจ้งหนี้แบบร่างแล้ว");
      setCreateOpen(false);
      router.push(`/invoices/${invoiceId}`);
    } catch (e: any) {
      toast.error(e?.message ?? "สร้างใบแจ้งหนี้ไม่สำเร็จ");
    } finally {
      setCreating(false);
    }
  }, [customerId, customers, router, supabase]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-gray-900">ใบแจ้งหนี้ (IV)</div>
          <div className="mt-1 text-sm text-gray-600">ออกเอกสาร, ยืนยันรับเงิน, และออกใบเสร็จ/ใบกำกับภาษี</div>
        </div>
        <div className="flex items-center gap-2">
          <Input placeholder="ค้นหาเลขเอกสาร/ชื่อลูกค้า" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Button onClick={openCreate} disabled={!canCreate}>
            สร้าง IV
          </Button>
        </div>
      </div>

      {error ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

      <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="grid grid-cols-[170px_1fr_140px_140px_140px] gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600">
          <div>เลขที่</div>
          <div>ลูกค้า</div>
          <div>วันที่</div>
          <div className="text-right">ยอดสุทธิ</div>
          <div>สถานะ</div>
        </div>
        <div className="divide-y divide-gray-100">
          {loading ? (
            <div className="px-3 py-3 text-sm text-gray-600">กำลังโหลด...</div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-3 text-sm text-gray-600">ไม่พบข้อมูล</div>
          ) : (
            filtered.map((r) => (
              <Link
                key={r.id}
                href={`/invoices/${r.id}`}
                className="grid grid-cols-[170px_1fr_140px_140px_140px] gap-2 px-3 py-3 text-sm hover:bg-gray-50"
              >
                <div className="font-medium text-gray-900">{r.doc_no ?? "(ร่าง)"}</div>
                <div className="truncate text-gray-700">{String((r.customer_snapshot ?? {})?.name ?? "-")}</div>
                <div className="text-gray-700">{r.issue_date}</div>
                <div className="text-right font-semibold text-gray-900">{asMoney(Number(r.grand_total ?? 0))}</div>
                <div className="text-gray-700">
                  <div>{statusLabel(String(r.status ?? ""))}</div>
                  <div className="mt-0.5 text-xs text-gray-500">{String(r.payment_mode) === "full" ? "ชำระเต็ม" : "แบ่งชำระ"}</div>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>

      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)}>
        <div className="rounded-xl bg-white p-5">
          <div className="text-base font-semibold text-gray-900">สร้างใบแจ้งหนี้ (แบบร่าง)</div>
          <div className="mt-4">
            <div className="text-sm font-medium text-gray-700">เลือกลูกค้า</div>
            <select
              className="mt-2 h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              disabled={creating}
            >
              <option value="">- เลือก -</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button onClick={createDraft} disabled={creating || !customerId.trim()}>
              สร้าง
            </Button>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
              ปิด
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
