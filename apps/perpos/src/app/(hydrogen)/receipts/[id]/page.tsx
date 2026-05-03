"use client";

import { useParams, useRouter } from "next/navigation";
import React from "react";
import { Button } from "rizzui";
import toast from "react-hot-toast";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useAuth } from "@/app/shared/auth-provider";
import { withBasePath } from "@/utils/base-path";

type ReceiptRow = {
  id: string;
  doc_no: string | null;
  status: string;
  invoice_id: string | null;
  issue_date: string;
  customer_snapshot: any;
  subtotal: number;
  discount_total: number;
  include_vat: boolean;
  vat_rate: number;
  vat_amount: number;
  wht_rate: number;
  wht_amount: number;
  grand_total: number;
  paid_date: string | null;
  payment_method: string | null;
  payment_ref: string | null;
  notes: string | null;
};

type ReceiptItemRow = {
  id: string;
  name: string;
  description: string | null;
  quantity: number;
  unit: string | null;
  unit_price: number;
  line_total: number;
  sort_order: number;
};

function asMoney(n: number) {
  const x = Number.isFinite(n) ? n : 0;
  return new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(x);
}

export default function ReceiptDetailPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = React.useMemo(() => createSupabaseBrowserClient(), []);
  const { userId } = useAuth();
  const id = String((params as any)?.id ?? "").trim();

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [receipt, setReceipt] = React.useState<ReceiptRow | null>(null);
  const [items, setItems] = React.useState<ReceiptItemRow[]>([]);

  React.useEffect(() => {
    if (!id) return;
    Promise.resolve().then(async () => {
      setLoading(true);
      setError(null);
      const [rRes, itRes] = await Promise.all([
        supabase
          .from("receipts")
          .select(
            "id,doc_no,status,invoice_id,issue_date,customer_snapshot,subtotal,discount_total,include_vat,vat_rate,vat_amount,wht_rate,wht_amount,grand_total,paid_date,payment_method,payment_ref,notes",
          )
          .eq("id", id)
          .single(),
        supabase
          .from("receipt_items")
          .select("id,name,description,quantity,unit,unit_price,line_total,sort_order")
          .eq("receipt_id", id)
          .order("sort_order", { ascending: true }),
      ]);
      const firstErr = rRes.error ?? itRes.error;
      if (firstErr) {
        setError(firstErr.message);
        setReceipt(null);
        setItems([]);
        setLoading(false);
        return;
      }
      setReceipt((rRes.data as any) as ReceiptRow);
      setItems(((itRes.data ?? []) as any[]) as ReceiptItemRow[]);
      setLoading(false);
    });
  }, [id, supabase]);

  const downloadPdf = React.useCallback(async () => {
    if (!receipt) return;
    try {
      const res = await fetch(withBasePath("/api/receipts/pdf"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receiptId: receipt.id, issued_by_profile_id: userId }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "สร้าง PDF ไม่สำเร็จ");
      }
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = receipt.doc_no ? `${receipt.doc_no}.pdf` : `receipt-${receipt.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
    } catch (e: any) {
      toast.error(e?.message ?? "สร้าง PDF ไม่สำเร็จ");
    }
  }, [receipt, userId]);

  if (loading) return <div className="text-sm text-gray-600">กำลังโหลด...</div>;
  if (!receipt) return <div className="text-sm text-red-700">{error ?? "ไม่พบเอกสาร"}</div>;

  const customerName = String((receipt.customer_snapshot ?? {})?.name ?? "-");

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-gray-900">ใบเสร็จรับเงิน/ใบกำกับภาษี (RT)</div>
          <div className="mt-1 text-sm text-gray-600">
            เลขที่: <span className="font-medium text-gray-900">{receipt.doc_no ?? "(ร่าง)"}</span> • ลูกค้า: {customerName}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => router.push("/receipts")}>กลับ</Button>
          <Button variant="outline" onClick={() => (receipt.invoice_id ? router.push(`/invoices/${receipt.invoice_id}`) : null)} disabled={!receipt.invoice_id}>
            ไปที่ใบแจ้งหนี้
          </Button>
          <Button onClick={downloadPdf} disabled={!receipt.doc_no}>
            ดาวน์โหลด PDF
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-sm font-semibold text-gray-900">รายการ</div>
          <div className="mt-3 overflow-hidden rounded-md border border-gray-200">
            <div className="grid grid-cols-[1fr_90px_120px_120px] gap-2 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600">
              <div>รายละเอียด</div>
              <div className="text-right">จำนวน</div>
              <div className="text-right">ราคา</div>
              <div className="text-right">รวม</div>
            </div>
            <div className="divide-y divide-gray-100">
              {items.length === 0 ? (
                <div className="px-3 py-3 text-sm text-gray-600">ยังไม่มีรายการ</div>
              ) : (
                items.map((it) => (
                  <div key={it.id} className="grid grid-cols-[1fr_90px_120px_120px] gap-2 px-3 py-3 text-sm">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-gray-900">{it.name}</div>
                      {it.description ? <div className="mt-1 text-xs text-gray-600">{it.description}</div> : null}
                    </div>
                    <div className="text-right text-gray-700">{Number(it.quantity ?? 0)}</div>
                    <div className="text-right text-gray-700">{asMoney(Number(it.unit_price ?? 0))}</div>
                    <div className="text-right font-semibold text-gray-900">{asMoney(Number(it.line_total ?? 0))}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="text-sm font-semibold text-gray-900">สรุปยอด</div>
            <div className="mt-3 space-y-1 text-sm">
              <div className="flex items-center justify-between">
                <div className="text-gray-600">รวมก่อนส่วนลด</div>
                <div className="font-medium text-gray-900">{asMoney(Number(receipt.subtotal ?? 0))}</div>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-gray-600">ส่วนลด</div>
                <div className="font-medium text-gray-900">{asMoney(Number(receipt.discount_total ?? 0))}</div>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-gray-600">ยอดหลังส่วนลด</div>
                <div className="font-medium text-gray-900">
                  {asMoney(Math.max(0, Number(receipt.subtotal ?? 0) - Number(receipt.discount_total ?? 0)))}
                </div>
              </div>
              {Boolean(receipt.include_vat) ? (
                <div className="flex items-center justify-between">
                  <div className="text-gray-600">VAT</div>
                  <div className="font-medium text-gray-900">{asMoney(Number(receipt.vat_amount ?? 0))}</div>
                </div>
              ) : null}
              {Number(receipt.wht_rate ?? 0) > 0 ? (
                <div className="flex items-center justify-between">
                  <div className="text-gray-600">หัก ณ ที่จ่าย ({Number(receipt.wht_rate ?? 0)}%)</div>
                  <div className="font-medium text-gray-900">{asMoney(Number(receipt.wht_amount ?? 0))}</div>
                </div>
              ) : null}
              {Number(receipt.wht_rate ?? 0) > 0 ? (
                <div className="flex items-center justify-between">
                  <div className="text-gray-600">ยอดก่อนหัก ณ ที่จ่าย</div>
                  <div className="font-medium text-gray-900">
                    {asMoney(Number(receipt.grand_total ?? 0) + Number(receipt.wht_amount ?? 0))}
                  </div>
                </div>
              ) : null}
              <div className="mt-2 flex items-center justify-between border-t border-gray-200 pt-2">
                <div className="text-sm font-semibold text-gray-900">ยอดสุทธิ</div>
                <div className="text-sm font-semibold text-gray-900">{asMoney(Number(receipt.grand_total ?? 0))}</div>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-700">
            <div className="font-semibold text-gray-900">การรับชำระ</div>
            <div className="mt-2">วันที่รับเงิน: {receipt.paid_date ?? "-"}</div>
            <div>วิธีชำระ: {receipt.payment_method ?? "-"}</div>
            <div>เลขอ้างอิง: {receipt.payment_ref ?? "-"}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
