"use client";

// B1 journal/page.tsx — สมุดรายวัน (หลังบ้านนักบัญชี)
// list + filter(สถานะ/ที่มา/ค้นหา) + StatCard(ทั้งหมด/ร่าง/ลงบัญชีแล้ว/auto-post)
// + JournalDialog (double-entry + balance indicator + post/void)
// + ปุ่ม "จำลอง: เงินเดือนจ่ายแล้ว" (runPayrollBridge → journal 8 บรรทัด เด้ง)
// + AI-4 anomaly banner (rule/semantic mock)
//
// gate §4: journal — owner(V) · accountant(W) · staff(–) · viewer(V)

import { useMemo, useState } from "react";
import {
  BookOpen,
  Search,
  Plus,
  ListChecks,
  FileEdit,
  CheckCircle2,
  Cpu,
  Wallet,
  AlertTriangle,
  X,
} from "lucide-react";
import cn from "@core/utils/class-names";
import { Input } from "@/components/ui/input";
import { CustomSelect } from "@/components/ui/custom-select";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { Text } from "@/components/ui/typography";
import { StatusBadge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogBody,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
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
} from "../_components";
import { JournalDialog } from "../_components/journal-dialog";
import { JournalSourceBadge } from "../_components/backstage-badges";
import { anomalyMocks } from "../_fixtures";
import type { AccJournalEntry, AccJournalStatus, AccJournalSource } from "../_fixtures/types";
import type { PayrollBridgeRunResult } from "../_components/data-context";

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

  const { journal, runPayrollBridge } = useAccountingData();

  const [search, setSearch] = useState("");
  const [statusF, setStatusF] = useState("");
  const [sourceF, setSourceF] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AccJournalEntry | null>(null);
  const [anomalyOpen, setAnomalyOpen] = useState(true);

  // ผลสะพานเงินเดือน → dialog สรุป
  const [bridgeResult, setBridgeResult] = useState<PayrollBridgeRunResult | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...journal]
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
  }, [journal, search, statusF, sourceF]);

  const stats = useMemo(() => {
    const total = journal.length;
    const draft = journal.filter((j) => j.status === "draft").length;
    const posted = journal.filter((j) => j.status === "posted").length;
    const auto = journal.filter(
      (j) => j.source === "payroll" || j.source === "depreciation",
    ).length;
    return { total, draft, posted, auto };
  }, [journal]);

  function openAdd() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(j: AccJournalEntry) {
    setEditing(j);
    setDialogOpen(true);
  }

  function handlePayrollBridge() {
    const result = runPayrollBridge();
    setBridgeResult(result);
    if (result.skipped) {
      toast.success(`งวด ${result.run_number} บันทึกแล้ว — ข้าม (ป้องกันยอดซ้ำ)`);
    } else {
      toast.success(
        `บันทึกเงินเดือน ${result.run_number} → สร้าง ${result.journal_entry_number} (8 บรรทัด) + ภ.ง.ด.1 ร่าง`,
      );
    }
  }

  if (!canView)
    return (
      <NoAccess title="สมุดรายวัน" icon={<BookOpen className="h-6 w-6" />}>
        หน้าหลังบ้านนี้สำหรับนักบัญชี — ลองสลับเป็นเจ้าของ/นักบัญชี/ผู้ดูข้อมูล
      </NoAccess>
    );

  return (
    <AccountingShell
      title="สมุดรายวัน"
      description="ลงบัญชี double-entry — Dr/Cr สมดุลเสมอ · รายการ auto-post จากเงินเดือน/ค่าเสื่อม โผล่ที่นี่"
      icon={<BookOpen className="h-6 w-6" />}
      actions={
        canWrite ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={handlePayrollBridge}>
              <Wallet className="mr-1.5 h-4 w-4" /> จำลอง: เงินเดือนจ่ายแล้ว
            </Button>
            <Button onClick={openAdd}>
              <Plus className="mr-1.5 h-4 w-4" /> เพิ่มรายการ
            </Button>
          </div>
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

      {/* AI-4 anomaly banner */}
      {anomalyOpen && anomalyMocks.anomalies.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-medium text-amber-800">
              <AlertTriangle className="h-4 w-4" />
              AI ตรวจพบ {anomalyMocks.anomalies.length} รายการที่ควรตรวจสอบ (จาก{" "}
              {anomalyMocks.total_checked} รายการ)
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-amber-600 hover:text-amber-800"
              onClick={() => setAnomalyOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <ul className="mt-2 space-y-1.5">
            {anomalyMocks.anomalies.slice(0, 3).map((a) => (
              <li key={a.entry_id} className="flex items-start gap-2 text-xs text-amber-700">
                <StatusBadge tone={a.severity === "high" ? "danger" : "warning"}>
                  {a.severity === "high" ? "สูง" : a.severity === "medium" ? "กลาง" : "ต่ำ"}
                </StatusBadge>
                <span>
                  <span className="font-medium">{a.description}</span> — {a.issue}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

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
          {filtered.length === 0 ? (
            <TableEmpty colSpan={7}>
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <div className="rounded-full bg-gray-100 p-4">
                  <BookOpen className="h-8 w-8 text-gray-400" />
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-900">ยังไม่มีรายการสมุดรายวัน</div>
                  <div className="mt-1 text-sm text-gray-500">
                    เริ่มลงบัญชีรายการแรก หรือจำลองการบันทึกเงินเดือนเพื่อดู auto-post
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
              <TableRow key={j.id} clickable onClick={() => openEdit(j)}>
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
                  <JournalStatusBadge status={j.status as AccJournalStatus} />
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

      {/* สรุปผลสะพานเงินเดือน */}
      <Dialog open={bridgeResult !== null} onOpenChange={(v) => !v && setBridgeResult(null)}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>ผลการบันทึกเงินเดือน → บัญชี</DialogTitle>
          </DialogHeader>
          <DialogBody>
            {bridgeResult && bridgeResult.skipped ? (
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                งวด {bridgeResult.run_number} ถูกบันทึกเข้าบัญชีไปแล้ว — ระบบข้ามเพื่อป้องกันยอดซ้ำ
                (idempotent ต่อ run)
              </div>
            ) : bridgeResult ? (
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-green-700">
                  <CheckCircle2 className="h-4 w-4" /> บันทึกสำเร็จ — สร้าง 3
                  อย่างอัตโนมัติจากระบบเงินเดือน
                </div>
                <ul className="space-y-2">
                  <li className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
                    <span className="text-gray-600">รายจ่ายในสมุดเจ้าของ (cockpit)</span>
                    <span className="font-medium tabular-nums text-gray-900">
                      เงินเดือน {fmtMoney(58500)}
                    </span>
                  </li>
                  <li className="rounded-lg border border-gray-200 px-3 py-2">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">
                        สมุดรายวัน {bridgeResult.journal_entry_number} (8 บรรทัด)
                      </span>
                      <StatusBadge tone="success">สมดุล</StatusBadge>
                    </div>
                    <div className="mt-1 flex gap-4 text-xs text-gray-500">
                      <span>
                        เดบิต{" "}
                        <span className="font-medium tabular-nums text-gray-900">
                          {fmtMoney(bridgeResult.total_debit)}
                        </span>
                      </span>
                      <span>
                        เครดิต{" "}
                        <span className="font-medium tabular-nums text-gray-900">
                          {fmtMoney(bridgeResult.total_credit)}
                        </span>
                      </span>
                    </div>
                  </li>
                  <li className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
                    <span className="text-gray-600">
                      ภ.ง.ด.1 (ร่าง) ครบกำหนด {fmtDateTH(bridgeResult.pnd1_due_date)}
                    </span>
                    <span className="font-medium tabular-nums text-gray-900">
                      WHT {fmtMoney(bridgeResult.pnd1_wht_total)}
                    </span>
                  </li>
                </ul>
                <Text className="text-xs text-gray-400">
                  สมการสมดุล: เงินเดือน(gross) + SSO/PVD นายจ้าง = สุทธิ + WHT + SSO + PVD +
                  เงินหักอื่น
                </Text>
              </div>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button onClick={() => setBridgeResult(null)}>เข้าใจแล้ว</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AccountingShell>
  );
}
