"use client";

// journal/page.tsx — B1 สมุดรายวัน (หลังบ้านนักบัญชี)
//   list + filter(สถานะ/ที่มา/ค้นหา) + StatCard(ทั้งหมด/ร่าง/ลงบัญชีแล้ว/auto-post)
//   + JournalDialog (double-entry + balance indicator + post/void)
//   ตัด AI anomaly banner + payroll-bridge mock ออก · ข้อมูลจาก API จริง
// gate §4: journal — owner(V) · accountant(W) · staff(–) · viewer(V)

import { useMemo, useState } from "react";
import { BookOpen, Search, Plus, ListChecks, FileEdit, CheckCircle2, Cpu } from "lucide-react";
import cn from "@core/utils/class-names";
import { Input } from "@/components/ui/input";
import { CustomSelect } from "@/components/ui/custom-select";
import { Button } from "@/components/ui/button";
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
import { toast } from "@/lib/toast";
import {
  AccountingShell,
  useAccountingRole,
  useAccountingData,
  fmtMoney,
  fmtDateTH,
  NoAccess,
  JournalStatusBadge,
  JournalDialog,
  JournalSourceBadge,
} from "../_components";
import type { AccJournalEntry, AccJournalSource } from "@/lib/accounting/types";

const STATUS_OPTIONS = [
  { value: "", label: "ทุกสถานะ" },
  { value: "draft", label: "ฉบับร่าง" },
  { value: "posted", label: "ลงบัญชีแล้ว" },
  { value: "void", label: "ยกเลิก" },
];

const SOURCE_OPTIONS = [
  { value: "", label: "ทุกที่มา" },
  { value: "manual", label: "บันทึกเอง" },
  { value: "document", label: "จากเอกสาร" },
  { value: "payroll", label: "เงินเดือน" },
  { value: "depreciation", label: "ค่าเสื่อม" },
];

export default function JournalPage() {
  const { can } = useAccountingRole();
  const canView = can("view", "journal");
  const canWrite = can("write", "journal");

  const { journalEntries, loading, apiGetRaw } = useAccountingData();

  const [search, setSearch] = useState("");
  const [statusF, setStatusF] = useState("");
  const [sourceF, setSourceF] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AccJournalEntry | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...journalEntries]
      .filter((j) => {
        if (statusF && j.status !== statusF) return false;
        if (sourceF && j.source !== sourceF) return false;
        if (q) {
          const hay = `${j.entry_number} ${j.description ?? ""}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => b.entry_date.localeCompare(a.entry_date));
  }, [journalEntries, search, statusF, sourceF]);

  const stats = useMemo(() => {
    const total = journalEntries.length;
    const draft = journalEntries.filter((j) => j.status === "draft").length;
    const posted = journalEntries.filter((j) => j.status === "posted").length;
    const auto = journalEntries.filter(
      (j) => j.source === "payroll" || j.source === "depreciation",
    ).length;
    return { total, draft, posted, auto };
  }, [journalEntries]);

  function openAdd() {
    setEditing(null);
    setDialogOpen(true);
  }
  async function openEdit(j: AccJournalEntry) {
    // list GET คืน header เปล่า — ดึง entry เต็ม (พร้อม lines) ก่อนเปิดฟอร์ม
    try {
      const full = await apiGetRaw<AccJournalEntry>(`journal/${j.id}`);
      setEditing(full);
    } catch {
      setEditing({ ...j, lines: [] });
      toast.error("โหลดรายละเอียดรายการไม่สำเร็จ — แสดงเฉพาะหัวรายการ");
    }
    setDialogOpen(true);
  }

  if (!canView)
    return (
      <NoAccess title="สมุดรายวัน" icon={<BookOpen className="h-6 w-6" />}>
        หน้าหลังบ้านนี้สำหรับนักบัญชี — บทบาทของคุณไม่มีสิทธิ์ดูสมุดรายวัน
      </NoAccess>
    );

  return (
    <AccountingShell
      title="สมุดรายวัน"
      description="ลงบัญชี double-entry — Dr/Cr สมดุลเสมอ · รายการ auto-post จากเงินเดือน/ค่าเสื่อม โผล่ที่นี่"
      icon={<BookOpen className="h-6 w-6" />}
      actions={
        canWrite ? (
          <Button onClick={openAdd}>
            <Plus className="mr-1.5 h-4 w-4" /> เพิ่มรายการ
          </Button>
        ) : undefined
      }
    >
      {/* KPI */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<ListChecks className="h-4 w-4" />}
          label="รายการทั้งหมด"
          value={String(stats.total)}
          tone="neutral"
        />
        <StatCard
          icon={<FileEdit className="h-4 w-4" />}
          label="ฉบับร่าง"
          value={String(stats.draft)}
          tone="warning"
          valueColored
        />
        <StatCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="ลงบัญชีแล้ว"
          value={String(stats.posted)}
          tone="positive"
          valueColored
        />
        <StatCard
          icon={<Cpu className="h-4 w-4" />}
          label="สร้างอัตโนมัติ"
          value={String(stats.auto)}
          sub="เงินเดือน + ค่าเสื่อม"
          tone="info"
        />
      </div>

      {/* filter */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              className="pl-9"
              placeholder="ค้นหา เลขที่ / คำอธิบาย"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <CustomSelect value={statusF} onChange={setStatusF} options={STATUS_OPTIONS} />
          <CustomSelect value={sourceF} onChange={setSourceF} options={SOURCE_OPTIONS} />
        </div>
      </div>

      {/* table */}
      <Table className="shadow-sm">
        <TableHeader>
          <TableRow>
            <TableHead>เลขที่</TableHead>
            <TableHead>วันที่</TableHead>
            <TableHead>คำอธิบาย</TableHead>
            <TableHead align="center">ที่มา</TableHead>
            <TableHead align="center">สถานะ</TableHead>
            <TableHead align="right">เดบิต</TableHead>
            <TableHead align="right">เครดิต</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading.journalEntries ? (
            <TableLoading colSpan={7} />
          ) : filtered.length === 0 ? (
            <TableEmpty colSpan={7}>
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <div className="rounded-full bg-gray-100 p-4">
                  <BookOpen className="h-8 w-8 text-gray-400" />
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-900">ยังไม่มีรายการสมุดรายวัน</div>
                  <div className="mt-1 text-sm text-gray-500">
                    เริ่มลงบัญชีรายการแรก — Dr/Cr ต้องสมดุลก่อน post
                  </div>
                </div>
                {canWrite && (
                  <Button size="sm" onClick={openAdd}>
                    <Plus className="mr-1.5 h-4 w-4" /> เพิ่มรายการแรก
                  </Button>
                )}
              </div>
            </TableEmpty>
          ) : (
            filtered.map((j) => (
              <TableRow key={j.id} clickable onClick={() => void openEdit(j)}>
                <TableCell className="font-medium text-gray-900">{j.entry_number}</TableCell>
                <TableCell className="whitespace-nowrap text-gray-500">
                  {fmtDateTH(j.entry_date)}
                </TableCell>
                <TableCell className="max-w-[260px] truncate text-gray-700">
                  {j.description ?? "—"}
                </TableCell>
                <TableCell align="center">
                  <JournalSourceBadge source={j.source as AccJournalSource} />
                </TableCell>
                <TableCell align="center">
                  <JournalStatusBadge status={j.status} />
                </TableCell>
                <TableCell align="right" tabular className="text-gray-900">
                  {fmtMoney(j.total_debit, { currency: false })}
                </TableCell>
                <TableCell align="right" tabular className="text-gray-900">
                  {fmtMoney(j.total_credit, { currency: false })}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <JournalDialog open={dialogOpen} onOpenChange={setDialogOpen} entry={editing} />
    </AccountingShell>
  );
}
