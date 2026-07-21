"use client";

// purchase-documents/page.tsx — ทะเบียนใบกำกับภาษีซื้อ (หลังบ้าน นักบัญชี)
//   แท็บ: ทะเบียน (list + สร้าง) / รายงานภาษีซื้อ (ตามงวดภาษี พร้อมพิมพ์)
//   ฐานของภาษีซื้อใน ภ.พ.30 — เดิมต้องกรอกมือทุกเดือน
// gate §4: หลังบ้าน — accountant (W) · owner/viewer (V) · staff (–)

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileInput, Plus, Search, Printer, AlertTriangle, CheckCircle2, Ban } from "lucide-react";
import cn from "@core/utils/class-names";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/custom-select";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
  TableLoading,
} from "@/components/ui/table";
import {
  AccountingShell,
  useAccountingRole,
  useAccountingData,
  fmtMoney,
  fmtDateTH,
  NoAccess,
} from "../_components";
import { PurchaseDocumentCreateDialog } from "../_components/purchase-document-dialog";
import { toast } from "@/lib/toast";
import type { AccPurchaseDocument, AccPurchaseDocType } from "@/lib/accounting/types";
import type { PurchaseTaxReport } from "@/lib/accounting/purchase-tax-report";

const PURCHASE_DOC_TYPE_LABEL: Record<AccPurchaseDocType, string> = {
  tax_invoice: "ใบกำกับภาษี",
  receipt_tax_invoice: "ใบเสร็จ/ใบกำกับภาษี",
  credit_note: "ใบลดหนี้",
  debit_note: "ใบเพิ่มหนี้",
  receipt: "ใบเสร็จรับเงิน",
  abbreviated_tax_invoice: "ใบกำกับภาษีอย่างย่อ",
};

const TH_MONTHS = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];

type Tab = "register" | "report";

export default function PurchaseDocumentsPage() {
  const { can } = useAccountingRole();
  const canView = can("view", "tax_closing");
  const canWrite = can("write", "tax_closing");

  const { orgId, apiGetRaw } = useAccountingData();

  const [tab, setTab] = useState<Tab>("register");
  const [docs, setDocs] = useState<AccPurchaseDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [truncated, setTruncated] = useState<{ loaded: number; total: number } | null>(null);

  const now = new Date();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [report, setReport] = useState<PurchaseTaxReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiGetRaw<{
        documents: AccPurchaseDocument[];
        total?: number;
        truncated?: boolean;
      }>("purchase-documents");
      setDocs(r.documents ?? []);
      setTruncated(
        r.truncated ? { loaded: (r.documents ?? []).length, total: r.total ?? 0 } : null,
      );
    } catch {
      toast.error("โหลดทะเบียนใบกำกับภาษีซื้อไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [apiGetRaw]);

  useEffect(() => {
    if (canView) void reload();
  }, [canView, reload]);

  const loadReport = useCallback(async () => {
    setReportLoading(true);
    try {
      const r = await apiGetRaw<PurchaseTaxReport>(
        `purchase-tax-report?year=${year}&month=${month}`,
      );
      setReport(r);
    } catch {
      toast.error("โหลดรายงานภาษีซื้อไม่สำเร็จ");
    } finally {
      setReportLoading(false);
    }
  }, [apiGetRaw, year, month]);

  useEffect(() => {
    if (canView && tab === "report") void loadReport();
  }, [canView, tab, loadReport]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter((d) =>
      `${d.doc_number} ${d.seller_name ?? ""} ${d.seller_tax_id ?? ""}`.toLowerCase().includes(q),
    );
  }, [docs, search]);

  const stats = useMemo(() => {
    const live = docs.filter((d) => d.status !== "void");
    const claimable = live.filter((d) => d.is_vat_claimable);
    const sign = (d: AccPurchaseDocument) => (d.doc_type === "credit_note" ? -1 : 1);
    return {
      count: live.length,
      claimableVat: claimable.reduce((s, d) => s + sign(d) * (Number(d.vat_amount) || 0), 0),
      nonClaimableVat: live
        .filter((d) => !d.is_vat_claimable)
        .reduce((s, d) => s + (Number(d.vat_amount) || 0), 0),
      unposted: live.filter((d) => !d.journal_entry_id).length,
    };
  }, [docs]);

  if (!canView)
    return (
      <NoAccess title="ใบกำกับภาษีซื้อ" icon={<FileInput className="h-6 w-6" />}>
        บทบาทนี้ไม่สามารถดูทะเบียนใบกำกับภาษีซื้อได้
      </NoAccess>
    );

  const tabs = (
    <div className="flex gap-1.5 overflow-x-auto rounded-xl border border-gray-200 bg-white p-1.5 shadow-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {(
        [
          { key: "register", label: "ทะเบียนใบกำกับภาษีซื้อ" },
          { key: "report", label: "รายงานภาษีซื้อ" },
        ] as { key: Tab; label: string }[]
      ).map((t) => (
        <Button
          key={t.key}
          size="sm"
          variant={tab === t.key ? "secondary" : "ghost"}
          className={cn("shrink-0 whitespace-nowrap", tab === t.key && "bg-gray-100 text-gray-900")}
          onClick={() => setTab(t.key)}
        >
          {t.label}
        </Button>
      ))}
    </div>
  );

  return (
    <AccountingShell
      title="ใบกำกับภาษีซื้อ"
      description="บันทึกใบกำกับที่ได้รับจากผู้ขาย → ลงบัญชีอัตโนมัติ + เป็นฐานภาษีซื้อของ ภ.พ.30"
      icon={<FileInput className="h-6 w-6" />}
      actions={
        canWrite ? (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> บันทึกใบกำกับซื้อ
          </Button>
        ) : undefined
      }
      tabs={tabs}
    >
      {tab === "register" ? (
        <>
          {truncated && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              แสดง {truncated.loaded.toLocaleString("th-TH")} จากทั้งหมด{" "}
              {truncated.total.toLocaleString("th-TH")} รายการ —
              ยอดรวมด้านล่างคิดจากชุดที่โหลดมาเท่านั้น
              (รายงานภาษีซื้อในแท็บถัดไปคิดจากงวดภาษีเต็มเสมอ)
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={<FileInput className="h-4 w-4" />}
              label="ใบกำกับในทะเบียน"
              value={String(stats.count)}
              sub="ไม่รวมที่ยกเลิก"
              tone="info"
            />
            <StatCard
              icon={<CheckCircle2 className="h-4 w-4" />}
              label="ภาษีซื้อที่เครดิตได้"
              value={fmtMoney(stats.claimableVat)}
              tone="positive"
              valueColored
            />
            <StatCard
              icon={<Ban className="h-4 w-4" />}
              label="ภาษีซื้อต้องห้าม"
              value={fmtMoney(stats.nonClaimableVat)}
              sub="เครดิตไม่ได้"
              tone="neutral"
            />
            <StatCard
              icon={<AlertTriangle className="h-4 w-4" />}
              label="ยังไม่ลงบัญชี"
              value={String(stats.unposted)}
              sub={stats.unposted > 0 ? "ควรตรวจแล้วลงบัญชี" : "ครบแล้ว"}
              tone={stats.unposted > 0 ? "warning" : "positive"}
            />
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                className="pl-9"
                placeholder="ค้นหา เลขที่ใบกำกับ / ชื่อผู้ขาย / เลขผู้เสียภาษี"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <Table className="shadow-sm">
            <TableHeader>
              <TableRow>
                <TableHead>วันที่</TableHead>
                <TableHead>เลขที่ใบกำกับ</TableHead>
                <TableHead>ประเภท</TableHead>
                <TableHead>ผู้ขาย</TableHead>
                <TableHead>งวดภาษี</TableHead>
                <TableHead align="right">มูลค่า</TableHead>
                <TableHead align="right">ภาษีซื้อ</TableHead>
                <TableHead align="center">สถานะ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableLoading colSpan={8} />
              ) : filtered.length === 0 ? (
                <TableEmpty colSpan={8}>
                  <div className="flex flex-col items-center gap-3 py-10 text-center">
                    <div className="rounded-full bg-gray-100 p-4">
                      <FileInput className="h-8 w-8 text-gray-400" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        ยังไม่มีใบกำกับภาษีซื้อ
                      </div>
                      <div className="mt-1 text-sm text-gray-500">
                        บันทึกใบกำกับที่ได้รับจากผู้ขาย เพื่อให้ ภ.พ.30 ดึงภาษีซื้อไปคำนวณเอง
                      </div>
                    </div>
                    {canWrite && (
                      <Button size="sm" onClick={() => setCreateOpen(true)}>
                        <Plus className="mr-1.5 h-4 w-4" /> บันทึกใบแรก
                      </Button>
                    )}
                  </div>
                </TableEmpty>
              ) : (
                filtered.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="whitespace-nowrap text-gray-500">
                      {fmtDateTH(d.issue_date)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-xs tabular-nums text-gray-900">
                      {d.doc_number}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-gray-600">
                      {PURCHASE_DOC_TYPE_LABEL[d.doc_type]}
                    </TableCell>
                    <TableCell className="text-gray-900">
                      <div>{d.seller_name ?? "—"}</div>
                      {d.seller_tax_id && (
                        <div className="text-xs text-gray-400">{d.seller_tax_id}</div>
                      )}
                    </TableCell>
                    <TableCell
                      align="right"
                      className="whitespace-nowrap tabular-nums text-gray-500"
                    >
                      {d.tax_month}/{d.tax_year}
                    </TableCell>
                    <TableCell align="right" tabular className="text-gray-600">
                      {fmtMoney(d.subtotal, { currency: false })}
                    </TableCell>
                    <TableCell align="right" tabular className="font-medium text-gray-900">
                      {fmtMoney(d.vat_amount, { currency: false })}
                    </TableCell>
                    <TableCell align="center">
                      {d.status === "void" ? (
                        <StatusBadge tone="neutral">ยกเลิก</StatusBadge>
                      ) : !d.is_vat_claimable ? (
                        <StatusBadge tone="warning">เครดิตไม่ได้</StatusBadge>
                      ) : d.journal_entry_id ? (
                        <StatusBadge tone="success">ลงบัญชีแล้ว</StatusBadge>
                      ) : (
                        <StatusBadge tone="warning">ยังไม่ลงบัญชี</StatusBadge>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </>
      ) : (
        <PurchaseTaxReportView
          year={year}
          month={month}
          setYear={setYear}
          setMonth={setMonth}
          report={report}
          loading={reportLoading}
        />
      )}

      <PurchaseDocumentCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        orgId={orgId}
        onCreated={() => void reload()}
      />
    </AccountingShell>
  );
}

// ─── รายงานภาษีซื้อ (ประกาศอธิบดีฯ ฉบับที่ 89) ────────────────────────────────
function PurchaseTaxReportView({
  year,
  month,
  setYear,
  setMonth,
  report,
  loading,
}: {
  year: string;
  month: string;
  setYear: (v: string) => void;
  setMonth: (v: string) => void;
  report: PurchaseTaxReport | null;
  loading: boolean;
}) {
  const yearOptions = useMemo(() => {
    const y = new Date().getFullYear();
    return [y + 1, y, y - 1, y - 2].map((v) => ({ value: String(v), label: `${v + 543}` }));
  }, []);
  const monthOptions = TH_MONTHS.map((m, i) => ({ value: String(i + 1), label: m }));

  return (
    <>
      {/* print CSS — พิมพ์เฉพาะตัวรายงาน */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #purchase-tax-report, #purchase-tax-report * { visibility: visible !important; }
          #purchase-tax-report { position: absolute; inset: 0; margin: 0; padding: 16px; }
          [data-no-print] { display: none !important; }
        }
      `}</style>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm" data-no-print>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <CustomSelect value={month} onChange={setMonth} options={monthOptions} />
          <CustomSelect value={year} onChange={setYear} options={yearOptions} />
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="mr-1.5 h-4 w-4" /> พิมพ์
          </Button>
        </div>
      </div>

      <div id="purchase-tax-report">
        <div className="mb-3 text-center">
          <div className="text-base font-bold text-gray-900">รายงานภาษีซื้อ</div>
          <div className="text-sm text-gray-600">
            เดือนภาษี {TH_MONTHS[Number(month) - 1]} {Number(year) + 543}
          </div>
        </div>

        <Table className="shadow-sm">
          <TableHeader>
            <TableRow>
              <TableHead align="center">ลำดับ</TableHead>
              <TableHead>วัน เดือน ปี</TableHead>
              <TableHead>เลขที่ใบกำกับ</TableHead>
              <TableHead>ชื่อผู้ขาย</TableHead>
              <TableHead>เลขประจำตัวผู้เสียภาษี</TableHead>
              <TableHead>สาขา</TableHead>
              <TableHead align="right">มูลค่าสินค้า/บริการ</TableHead>
              <TableHead align="right">ภาษีมูลค่าเพิ่ม</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableLoading colSpan={8} />
            ) : !report || report.rows.length === 0 ? (
              <TableEmpty colSpan={8}>ไม่มีใบกำกับภาษีซื้อในงวดนี้</TableEmpty>
            ) : (
              report.rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell align="center" className="tabular-nums text-gray-500">
                    {r.seq}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-gray-600">
                    {fmtDateTH(r.issue_date)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap font-mono text-xs tabular-nums text-gray-900">
                    {r.doc_number}
                  </TableCell>
                  <TableCell className="text-gray-900">
                    {r.seller_name ?? "—"}
                    {!r.is_vat_claimable && (
                      <span className="ml-1.5 text-xs text-amber-700">(เครดิตไม่ได้)</span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap font-mono text-xs tabular-nums text-gray-600">
                    {r.seller_tax_id ?? "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-gray-600">
                    {r.seller_branch ?? "—"}
                  </TableCell>
                  <TableCell align="right" tabular className="text-gray-600">
                    {fmtMoney(r.signed_subtotal, { currency: false })}
                  </TableCell>
                  <TableCell align="right" tabular className="text-gray-900">
                    {fmtMoney(r.signed_vat, { currency: false })}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {report && report.rows.length > 0 && (
          <div className="ml-auto mt-4 w-full max-w-sm space-y-1.5 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-gray-500">ภาษีซื้อที่เครดิตได้ (เข้า ภ.พ.30)</span>
              <span className="font-mono font-semibold tabular-nums text-gray-900">
                {fmtMoney(report.claimable_vat)}
              </span>
            </div>
            {report.non_claimable_vat !== 0 && (
              <div className="flex items-center justify-between">
                <span className="text-gray-500">ภาษีซื้อที่เครดิตไม่ได้</span>
                <span className="font-mono tabular-nums text-gray-500">
                  {fmtMoney(report.non_claimable_vat)}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between border-t border-gray-200 pt-1.5">
              <span className="font-semibold text-gray-900">รวมทั้งสิ้น ({report.count} ฉบับ)</span>
              <span className="font-mono font-semibold tabular-nums text-gray-900">
                {fmtMoney(report.total_vat)}
              </span>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
