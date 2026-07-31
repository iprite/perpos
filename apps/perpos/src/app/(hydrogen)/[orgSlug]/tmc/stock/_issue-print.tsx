"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Printer } from "lucide-react";
import type { StockIssue } from "./_types";

type PrintLine = {
  quantity: number;
  tmc_stock_items: { name: string; unit: string } | null;
};

/** ใบเช็คของต่อหลัง — พิมพ์ไปเช็คตอนหยิบของออก แล้วเช็คซ้ำตอนไปส่งที่หลังนั้น
 *  เอกสารพิมพ์ใช้ขาว-ดำ-เส้นเทา ตาม DESIGN.md §13.5 (พิมพ์ขาวดำต้องอ่านออก)
 */
export function IssuePrintDialog({
  orgId,
  issue,
  onClose,
  authHeader,
}: {
  orgId: string;
  issue: StockIssue | null;
  onClose: () => void;
  authHeader: () => Promise<Record<string, string>>;
}) {
  const [lines, setLines] = useState<PrintLine[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!issue) return;
    let alive = true;
    setLoading(true);
    (async () => {
      const h = await authHeader();
      const res = await fetch(`/api/tmc/stock/issues?orgId=${orgId}&id=${issue.id}`, {
        headers: h,
      });
      const data = await res.json().catch(() => ({}));
      if (alive) {
        setLines(Array.isArray(data.lines) ? data.lines : []);
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [issue, orgId, authHeader]);

  /** ยอดรวมต่อรายการ = ใบหยิบของจากคลัง */
  const totals = useMemo(() => {
    const m = new Map<string, { name: string; unit: string; qty: number }>();
    for (const l of lines) {
      const name = l.tmc_stock_items?.name ?? "—";
      const cur = m.get(name);
      if (cur) cur.qty += Number(l.quantity);
      else m.set(name, { name, unit: l.tmc_stock_items?.unit ?? "", qty: Number(l.quantity) });
    }
    return Array.from(m.values()).sort((a, b) => a.name.localeCompare(b.name, "th"));
  }, [lines]);

  const issuedAt = issue ? new Date(issue.created_at) : null;
  const docNo = issue ? issue.id.slice(0, 8).toUpperCase() : "";

  return (
    <Dialog open={!!issue} onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="2xl">
        {/* print CSS — ท่าเดียวกับตัวอย่างเอกสารของ accounting: พิมพ์เฉพาะใบ ซ่อนที่เหลือ */}
        <style>{`
          @media print {
            @page { size: A4; margin: 12mm; }
            body * { visibility: hidden !important; }
            #tmc-issue-sheet, #tmc-issue-sheet * { visibility: visible !important; }
            /* กล่อง dialog ถูกจัดกลางจอด้วย fixed + translate และมี max-h/overflow
               ถ้าไม่ปลดออก ใบจะพิมพ์เริ่มกลางหน้าและถูกตัดที่หน้าแรก */
            [role="dialog"] {
              position: static !important;
              transform: none !important;
              inset: auto !important;
              max-height: none !important;
              height: auto !important;
              max-width: none !important;
              width: auto !important;
              overflow: visible !important;
              box-shadow: none !important;
              border: 0 !important;
              border-radius: 0 !important;
            }
            /* ชั้นในปลดแค่ความสูง/สกรอล — ห้ามแตะความกว้าง ไม่งั้น w-full ของตารางหาย
               แล้วตารางจะหดไปกองซ้ายไม่เต็มหน้ากระดาษ */
            [role="dialog"] * {
              max-height: none !important;
              height: auto !important;
              overflow: visible !important;
            }
            /* หลังปลด dialog เป็น static แล้ว จะไม่มี ancestor ที่ positioned เหลือ
               → absolute ตัวนี้จึงอิงกับ "หน้ากระดาษ" จริง ไม่ใช่กล่อง dialog
               (จำเป็น เพราะของที่ซ่อนด้วย visibility ยังกินที่อยู่ ถ้าปล่อย static ใบจะไหลลงไปหน้าถัดไป) */
            #tmc-issue-sheet {
              position: absolute !important;
              top: 0 !important;
              left: 0 !important;
              width: 100% !important;
              margin: 0 !important;
              padding: 0 !important;
            }
            #tmc-issue-sheet table { width: 100% !important; page-break-inside: auto; }
            #tmc-issue-sheet tr { page-break-inside: avoid; }
            #tmc-issue-sheet thead { display: table-header-group; }
            [data-no-print] { display: none !important; }
          }
        `}</style>
        <DialogHeader data-no-print>
          <DialogTitle>
            <span className="inline-flex items-center gap-1.5">
              <Printer className="h-4 w-4" /> ใบเช็คของ — {issue?.property_code}
            </span>
          </DialogTitle>
        </DialogHeader>
        <DialogBody>
          {loading ? (
            <div className="animate-pulse space-y-2">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-6 rounded bg-gray-100" />
              ))}
            </div>
          ) : (
            <div id="tmc-issue-sheet" className="space-y-5 text-[13px] text-black">
              {/* หัวเอกสาร */}
              <div className="border-b border-gray-400 pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-lg font-bold">ใบเบิก–เช็คของ {issue?.property_code}</p>
                    <p className="text-xs text-gray-600">TMC Management · คลังผ้าและของใช้</p>
                  </div>
                  <div className="text-right text-xs text-gray-600">
                    {issue?.status === "voided" && (
                      <p className="mb-0.5 inline-block border-2 border-black px-2 py-0.5 text-sm font-bold text-black">
                        ยกเลิกแล้ว — ห้ามใช้
                      </p>
                    )}
                    <p>เลขที่ {docNo}</p>
                    <p>
                      วันที่{" "}
                      {issuedAt?.toLocaleDateString("th-TH", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                    <p>
                      {issue?.line_count} รายการ · {issue?.total_qty} ชิ้น
                    </p>
                  </div>
                </div>
                {issue?.note && (
                  <p className="mt-1 text-xs text-gray-600">หมายเหตุ: {issue.note}</p>
                )}
              </div>

              {/* 1. ใบหยิบของจากคลัง */}
              <div>
                <p className="mb-1 font-semibold">รายการที่ต้องหยิบ (รวมทั้งหลัง)</p>
                <table className="w-full border-collapse text-[13px]">
                  <thead>
                    <tr className="border-y border-gray-400">
                      <th className="py-1 text-left font-medium">รายการ</th>
                      <th className="w-20 py-1 text-right font-medium">จำนวน</th>
                      <th className="w-16 py-1 text-center font-medium">จ่ายออก</th>
                      <th className="w-16 py-1 text-center font-medium">รับคืน</th>
                    </tr>
                  </thead>
                  <tbody>
                    {totals.map((t) => (
                      <tr key={t.name} className="border-b border-gray-200">
                        <td className="py-1">{t.name}</td>
                        <td className="py-1 text-right font-mono tabular-nums">
                          {t.qty} {t.unit}
                        </td>
                        <td className="py-1 text-center">☐</td>
                        <td className="py-1 text-center">☐</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-gray-400 font-semibold">
                      <td className="py-1">รวม</td>
                      <td className="py-1 text-right font-mono tabular-nums">
                        {totals.reduce((s, t) => s + t.qty, 0)}
                      </td>
                      <td />
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* ลายเซ็น */}
              <div className="grid grid-cols-3 gap-6 pt-6 text-center text-xs text-gray-700">
                <div>
                  <div className="border-b border-gray-500 pb-6" />
                  <p className="pt-1">ผู้จ่ายของ / วันที่</p>
                </div>
                <div>
                  <div className="border-b border-gray-500 pb-6" />
                  <p className="pt-1">ผู้รับของ / วันที่</p>
                </div>
                <div>
                  <div className="border-b border-gray-500 pb-6" />
                  <p className="pt-1">ผู้เช็คเก็บกลับ / วันที่</p>
                </div>
              </div>
            </div>
          )}
        </DialogBody>
        <DialogFooter data-no-print>
          <Button variant="outline" onClick={onClose}>
            ปิด
          </Button>
          <Button onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> พิมพ์
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
