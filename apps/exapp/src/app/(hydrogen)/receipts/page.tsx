"use client";

import Link from "next/link";
import React from "react";
import { Input } from "rizzui";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type ReceiptRow = {
  id: string;
  doc_no: string | null;
  status: string;
  issue_date: string;
  customer_snapshot: any;
  grand_total: number;
  created_at: string;
};

function asMoney(n: number) {
  const x = Number.isFinite(n) ? n : 0;
  return new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(x);
}

function statusLabel(s: string) {
  if (s === "draft") return "ร่าง";
  if (s === "issued") return "ออกเอกสารแล้ว";
  if (s === "voided") return "ยกเลิก/VOID";
  return s;
}

export default function ReceiptsPage() {
  const supabase = React.useMemo(() => createSupabaseBrowserClient(), []);
  const [rows, setRows] = React.useState<ReceiptRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");

  React.useEffect(() => {
    Promise.resolve().then(async () => {
      setLoading(true);
      setError(null);
      const res = await supabase
        .from("receipts")
        .select("id,doc_no,status,issue_date,customer_snapshot,grand_total,created_at")
        .order("created_at", { ascending: false })
        .limit(300);
      if (res.error) {
        setError(res.error.message);
        setRows([]);
        setLoading(false);
        return;
      }
      setRows(((res.data ?? []) as any[]) as ReceiptRow[]);
      setLoading(false);
    });
  }, [supabase]);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const doc = String(r.doc_no ?? "").toLowerCase();
      const name = String((r.customer_snapshot ?? {})?.name ?? "").toLowerCase();
      return doc.includes(q) || name.includes(q);
    });
  }, [rows, search]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-gray-900">ใบเสร็จรับเงิน/ใบกำกับภาษี (RT)</div>
          <div className="mt-1 text-sm text-gray-600">สร้างจากใบแจ้งหนี้ที่ยืนยันรับเงินแล้ว</div>
        </div>
        <div className="flex items-center gap-2">
          <Input placeholder="ค้นหาเลขเอกสาร/ชื่อลูกค้า" value={search} onChange={(e) => setSearch(e.target.value)} />
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
                href={`/receipts/${r.id}`}
                className="grid grid-cols-[170px_1fr_140px_140px_140px] gap-2 px-3 py-3 text-sm hover:bg-gray-50"
              >
                <div className="font-medium text-gray-900">{r.doc_no ?? "(ร่าง)"}</div>
                <div className="truncate text-gray-700">{String((r.customer_snapshot ?? {})?.name ?? "-")}</div>
                <div className="text-gray-700">{r.issue_date}</div>
                <div className="text-right font-semibold text-gray-900">{asMoney(Number(r.grand_total ?? 0))}</div>
                <div className="text-gray-700">{statusLabel(String(r.status ?? ""))}</div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

