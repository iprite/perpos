"use client";

// documents/page.tsx (production) — A3 เอกสารขาย (ใบเสนอราคา/ใบแจ้งหนี้/ใบเสร็จ)
//   Tab (overflow-x-auto) + StatCard×4 (ออกบิล/รอรับชำระ/เกินกำหนด/รับแล้ว)
//   + filter (ค้นหา/สถานะ) + Table row→DocumentDialog (detail+แก้+convert+พรีวิวพิมพ์)
//   + DocumentCreateDialog (typeahead สินค้า + VAT/WHT) · ตัดปุ่มส่ง LINE (B0 เลื่อนเฟส 2)
// gate §4: documents — owner/accountant/staff (W) · viewer (V)

import { useMemo, useState } from "react";
import {
  FileText,
  Search,
  FileSignature,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Plus,
} from "lucide-react";
import cn from "@core/utils/class-names";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/custom-select";
import { StatCard } from "@/components/ui/stat-card";
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
  DocStatusBadge,
  DOC_TYPE_LABEL,
  NoAccess,
} from "../_components";
import { DocumentDialog, DocumentCreateDialog } from "../_components/document-dialog";
import type { AccDocument, AccDocType } from "@/lib/accounting/types";

type DocTab = "all" | AccDocType;

const DOC_TABS: { key: DocTab; label: string }[] = [
  { key: "all", label: "ทั้งหมด" },
  { key: "quotation", label: "ใบเสนอราคา" },
  { key: "invoice", label: "ใบแจ้งหนี้" },
  { key: "receipt", label: "ใบเสร็จรับเงิน" },
];

const STATUS_FILTER = [
  { value: "", label: "ทุกสถานะ" },
  { value: "draft", label: "ฉบับร่าง" },
  { value: "sent", label: "ส่งแล้ว" },
  { value: "accepted", label: "ตอบรับ" },
  { value: "paid", label: "รับชำระแล้ว" },
  { value: "overdue", label: "เกินกำหนด" },
  { value: "void", label: "ยกเลิก" },
];

export default function DocumentsPage() {
  const { can } = useAccountingRole();
  const canView = can("view", "documents");
  const canWrite = can("write", "documents");

  const { documents, loading } = useAccountingData();

  const [tab, setTab] = useState<DocTab>("all");
  const [search, setSearch] = useState("");
  const [statusF, setStatusF] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState<AccDocument | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return documents
      .filter((d) => {
        if (tab !== "all" && d.doc_type !== tab) return false;
        if (statusF && d.status !== statusF) return false;
        if (q) {
          const hay = `${d.doc_number} ${d.contact_name ?? ""} ${d.note ?? ""}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => b.issue_date.localeCompare(a.issue_date));
  }, [documents, tab, search, statusF]);

  // KPI สรุป (จากเอกสารทั้งหมด)
  const stats = useMemo(() => {
    const invoices = documents.filter((d) => d.doc_type === "invoice");
    const billedTotal = invoices.reduce((s, d) => s + d.total, 0);
    const awaiting = invoices.filter((d) => d.status === "sent" || d.status === "accepted");
    const overdue = documents.filter((d) => d.status === "overdue");
    const paid = documents.filter((d) => d.status === "paid");
    return {
      billedCount: invoices.length,
      billedTotal,
      awaitingTotal: awaiting.reduce((s, d) => s + d.total, 0),
      overdueTotal: overdue.reduce((s, d) => s + d.total, 0),
      overdueCount: overdue.length,
      paidTotal: paid.reduce((s, d) => s + d.total, 0),
    };
  }, [documents]);

  function openDoc(d: AccDocument) {
    setSelected(d);
    setDialogOpen(true);
  }

  if (!canView)
    return (
      <NoAccess title="เอกสารขาย" icon={<FileText className="h-6 w-6" />}>
        บทบาทนี้ไม่สามารถดูเอกสารขายได้
      </NoAccess>
    );

  const tabs = (
    <div className="flex gap-1.5 overflow-x-auto rounded-xl border border-gray-200 bg-white p-1.5 shadow-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {DOC_TABS.map((t) => (
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
      title="เอกสารขาย"
      description="ออกใบเสนอราคา → ใบแจ้งหนี้ → ใบเสร็จ และตามเก็บเงินจบในที่เดียว"
      icon={<FileText className="h-6 w-6" />}
      actions={
        canWrite ? (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> สร้างเอกสาร
          </Button>
        ) : undefined
      }
      tabs={tabs}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<FileSignature className="h-4 w-4" />}
          label="ออกใบแจ้งหนี้"
          value={fmtMoney(stats.billedTotal)}
          sub={`${stats.billedCount} ใบ`}
          tone="info"
          valueColored
        />
        <StatCard
          icon={<Clock className="h-4 w-4" />}
          label="รอรับชำระ"
          value={fmtMoney(stats.awaitingTotal)}
          tone="warning"
          valueColored
        />
        <StatCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="เกินกำหนด"
          value={fmtMoney(stats.overdueTotal)}
          sub={stats.overdueCount > 0 ? `${stats.overdueCount} ใบ — ควรติดตาม` : "ไม่มี"}
          tone="negative"
          valueColored
        />
        <StatCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="รับชำระแล้ว"
          value={fmtMoney(stats.paidTotal)}
          tone="positive"
          valueColored
        />
      </div>

      {/* filter bar */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="relative sm:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              className="pl-9"
              placeholder="ค้นหา เลขเอกสาร / ลูกค้า"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <CustomSelect value={statusF} onChange={setStatusF} options={STATUS_FILTER} />
        </div>
      </div>

      {/* table */}
      <Table className="shadow-sm">
        <TableHeader>
          <TableRow>
            <TableHead>เลขที่</TableHead>
            <TableHead>ประเภท</TableHead>
            <TableHead>ลูกค้า</TableHead>
            <TableHead>วันที่</TableHead>
            <TableHead>กำหนดชำระ</TableHead>
            <TableHead align="center">สถานะ</TableHead>
            <TableHead align="right">ยอดรวม</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading.documents ? (
            <TableLoading colSpan={7} />
          ) : filtered.length === 0 ? (
            <TableEmpty colSpan={7}>
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <div className="rounded-full bg-gray-100 p-4">
                  <FileText className="h-8 w-8 text-gray-400" />
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-900">ยังไม่มีเอกสาร</div>
                  <div className="mt-1 text-sm text-gray-500">
                    เริ่มออกใบเสนอราคาหรือใบแจ้งหนี้ใบแรกของคุณ
                  </div>
                </div>
                {canWrite && (
                  <Button size="sm" onClick={() => setCreateOpen(true)}>
                    <Plus className="mr-1.5 h-4 w-4" /> สร้างเอกสารแรก
                  </Button>
                )}
              </div>
            </TableEmpty>
          ) : (
            filtered.map((d) => (
              <TableRow key={d.id} clickable onClick={() => openDoc(d)}>
                <TableCell className="whitespace-nowrap font-mono text-xs tabular-nums text-gray-900">
                  {d.doc_number}
                </TableCell>
                <TableCell className="whitespace-nowrap text-gray-600">
                  {DOC_TYPE_LABEL[d.doc_type]}
                </TableCell>
                <TableCell className="text-gray-900">{d.contact_name ?? "—"}</TableCell>
                <TableCell className="whitespace-nowrap text-gray-500">
                  {fmtDateTH(d.issue_date)}
                </TableCell>
                <TableCell className="whitespace-nowrap text-gray-500">
                  {d.due_date ? fmtDateTH(d.due_date) : "—"}
                </TableCell>
                <TableCell align="center">
                  <DocStatusBadge status={d.status} />
                </TableCell>
                <TableCell align="right" tabular className="font-medium text-gray-900">
                  {fmtMoney(d.total)}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <DocumentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        document={selected}
        canWrite={canWrite}
      />
      <DocumentCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
    </AccountingShell>
  );
}
