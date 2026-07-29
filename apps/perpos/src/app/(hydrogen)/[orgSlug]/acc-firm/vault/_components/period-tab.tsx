"use client";

// period-tab.tsx — รายการเอกสารที่ต้องมีของงวด (checklist) + เปิดงวด + เปลี่ยนสถานะ + อัปโหลด
// คำไทยของสถานะ/กลุ่ม มาจาก lib/acc-firm/vault/types.ts เท่านั้น

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarPlus, FolderPlus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/custom-select";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/typography";
import { StatusBadge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
  TableLoading,
} from "@/components/ui/table";
import { toast } from "@/lib/toast";
import {
  CHECKLIST_STATUS_LABELS,
  CHECKLIST_STATUS_TONE,
  GROUP_LABELS,
  type ChecklistRow,
  type ChecklistStatus,
  type VaultCategory,
  type VaultGroupCode,
  type VaultPeriod,
} from "@/lib/acc-firm/vault/types";
import { useVaultApi } from "./api";
import { UploadDocumentDialog } from "./upload-dialog";
import { THAI_MONTH_OPTIONS, fmtDate, fmtPeriodLabel, isOverdue } from "./format";

const STATUS_OPTIONS = (Object.keys(CHECKLIST_STATUS_LABELS) as ChecklistStatus[]).map((s) => ({
  value: s,
  label: CHECKLIST_STATUS_LABELS[s],
}));

export function PeriodTab({
  orgId,
  clientId,
  canWrite,
  periods: initialPeriods,
  initialPeriodId,
  initialChecklist,
  categories,
}: {
  orgId: string;
  clientId: string;
  canWrite: boolean;
  periods: VaultPeriod[];
  initialPeriodId: string | null;
  initialChecklist: ChecklistRow[];
  categories: VaultCategory[];
}) {
  const api = useVaultApi(orgId);
  const now = new Date();

  const [periods, setPeriods] = useState(initialPeriods);
  const [year, setYear] = useState(() => {
    const p = initialPeriods.find((x) => x.id === initialPeriodId);
    return p ? Number(p.periodStart.slice(0, 4)) : now.getFullYear();
  });
  const [month, setMonth] = useState(() => {
    const p = initialPeriods.find((x) => x.id === initialPeriodId);
    return p && p.kind === "month" ? Number(p.periodStart.slice(5, 7)) : now.getMonth() + 1;
  });
  const [rows, setRows] = useState<ChecklistRow[]>(initialChecklist);
  const [loading, setLoading] = useState(false);
  const [opening, setOpening] = useState(false);
  const [uploadFor, setUploadFor] = useState<ChecklistRow | null>(null);
  const [waiveFor, setWaiveFor] = useState<ChecklistRow | null>(null);
  const [waiveReason, setWaiveReason] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  const period = useMemo(
    () =>
      periods.find(
        (p) =>
          p.kind === "month" &&
          Number(p.periodStart.slice(0, 4)) === year &&
          Number(p.periodStart.slice(5, 7)) === month,
      ) ?? null,
    [periods, year, month],
  );

  const loadChecklist = useCallback(
    async (periodId: string) => {
      setLoading(true);
      try {
        const res = await api.fetchChecklist(periodId);
        setRows(res.items as ChecklistRow[]);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "โหลดรายการไม่สำเร็จ");
      } finally {
        setLoading(false);
      }
    },
    [api],
  );

  useEffect(() => {
    if (!period) {
      setRows([]);
      return;
    }
    if (period.id === initialPeriodId) return; // งวดเริ่มต้นมาจาก SSR แล้ว
    void loadChecklist(period.id);
  }, [period, initialPeriodId, loadChecklist]);

  async function openPeriod() {
    setOpening(true);
    try {
      const res = await api.openPeriod({ clientId, kind: "month", year, month });
      setPeriods((prev) => [
        {
          id: res.periodId,
          clientId,
          kind: "month",
          periodStart: `${year}-${String(month).padStart(2, "0")}-01`,
          periodEnd: new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10),
          fiscalYear: year,
          closedAt: null,
        },
        ...prev,
      ]);
      // ไม่ต้องเรียก loadChecklist เอง — effect ที่เฝ้า `period` จะโหลดให้เมื่องวดใหม่ถูกเลือก
      toast.success(`เปิดงวดแล้ว — มีรายการที่ต้องเก็บ ${res.checklistCount} รายการ`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "เปิดงวดไม่สำเร็จ");
    } finally {
      setOpening(false);
    }
  }

  async function changeStatus(row: ChecklistRow, status: ChecklistStatus, reason?: string) {
    setSavingId(row.id);
    try {
      await api.setChecklistStatus({ checklistId: row.id, status, waivedReason: reason });
      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id
            ? { ...r, status, waivedReason: status === "na" ? (reason ?? null) : null }
            : r,
        ),
      );
      toast.success("อัปเดตสถานะแล้ว");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "อัปเดตไม่สำเร็จ");
    } finally {
      setSavingId(null);
    }
  }

  const grouped = useMemo(() => {
    const map = new Map<VaultGroupCode, ChecklistRow[]>();
    for (const r of rows) {
      const list = map.get(r.groupCode) ?? [];
      list.push(r);
      map.set(r.groupCode, list);
    }
    return Array.from(map.entries());
  }, [rows]);

  const yearOptions = Array.from({ length: 6 }, (_, i) => now.getFullYear() - 3 + i).map((y) => ({
    value: String(y),
    label: `พ.ศ. ${y + 543}`,
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
        <div>
          <Label>ปี</Label>
          <CustomSelect
            value={String(year)}
            onChange={(v) => setYear(Number(v))}
            options={yearOptions}
            className="mt-1 w-36"
          />
        </div>
        <div>
          <Label>เดือน</Label>
          <CustomSelect
            value={String(month)}
            onChange={(v) => setMonth(Number(v))}
            options={THAI_MONTH_OPTIONS}
            className="mt-1 w-40"
          />
        </div>
        {period && (
          <Text className="pb-2 text-xs text-gray-500">
            งวด {fmtPeriodLabel("month", period.periodStart, period.periodEnd)} · สิ้นงวด{" "}
            {fmtDate(period.periodEnd)}
          </Text>
        )}
        {period && canWrite && (
          <Button
            size="sm"
            variant="outline"
            className="ms-auto"
            onClick={() => setUploadFor(rows[0] ?? null)}
            disabled={rows.length === 0}
          >
            <Upload className="mr-1 h-4 w-4" /> อัปโหลดเอกสารเข้างวดนี้
          </Button>
        )}
      </div>

      {!period ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white py-16 text-center shadow-sm">
          <div className="mb-4 rounded-full bg-gray-100 p-4">
            <CalendarPlus className="h-8 w-8 text-gray-400" />
          </div>
          <Text className="text-sm font-medium text-gray-900">ยังไม่ได้เปิดงวดนี้</Text>
          <Text className="mt-1 text-sm text-gray-500">
            เปิดงวดเพื่อกางรายการเอกสารที่ต้องเก็บจากแม่แบบของสำนักงาน
          </Text>
          {canWrite ? (
            <Button className="mt-4" size="sm" onClick={openPeriod} disabled={opening}>
              {opening ? (
                "กำลังเปิดงวด…"
              ) : (
                <>
                  <FolderPlus className="mr-1 h-4 w-4" /> เปิดงวดนี้
                </>
              )}
            </Button>
          ) : (
            <Text className="mt-3 text-xs text-gray-400">
              บัญชีของคุณเป็นสิทธิ์อ่านอย่างเดียว จึงเปิดงวดไม่ได้
            </Text>
          )}
        </div>
      ) : loading ? (
        <Table className="shadow-sm">
          <TableHeader>
            <TableRow>
              <TableHead>รายการเอกสาร</TableHead>
              <TableHead align="center">สถานะ</TableHead>
              <TableHead>ครบกำหนด</TableHead>
              <TableHead align="right">ไฟล์</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableLoading colSpan={5} />
          </TableBody>
        </Table>
      ) : rows.length === 0 ? (
        <Table className="shadow-sm">
          <TableHeader>
            <TableRow>
              <TableHead>รายการเอกสาร</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableEmpty colSpan={1}>งวดนี้ยังไม่มีรายการเอกสารในแม่แบบ</TableEmpty>
          </TableBody>
        </Table>
      ) : (
        grouped.map(([group, list]) => (
          <div key={group}>
            <div className="mb-2.5 px-1 text-sm font-semibold text-gray-900">
              {GROUP_LABELS[group]}
              <span className="ml-2 text-xs font-normal text-gray-500">
                {list.filter((r) => r.status === "missing").length > 0
                  ? `ยังขาด ${list.filter((r) => r.status === "missing").length} รายการ`
                  : "ครบแล้ว"}
              </span>
            </div>
            <Table className="shadow-sm">
              <TableHeader>
                <TableRow>
                  <TableHead>รายการเอกสาร</TableHead>
                  <TableHead align="center">สถานะ</TableHead>
                  <TableHead>ครบกำหนด</TableHead>
                  <TableHead align="right">ไฟล์</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-gray-800">
                      <span className="flex items-center gap-2">
                        <span className="font-mono text-xs text-gray-400">{r.categoryCode}</span>
                        {r.categoryName}
                        {r.isRequired && <StatusBadge tone="info">บังคับ</StatusBadge>}
                        {r.isSensitive && <StatusBadge tone="warning">ข้อมูลส่วนบุคคล</StatusBadge>}
                      </span>
                      {r.status === "na" && r.waivedReason && (
                        <Text className="mt-0.5 text-xs text-gray-500">
                          เหตุผล: {r.waivedReason}
                        </Text>
                      )}
                    </TableCell>
                    <TableCell align="center">
                      <StatusBadge tone={CHECKLIST_STATUS_TONE[r.status]}>
                        {CHECKLIST_STATUS_LABELS[r.status]}
                      </StatusBadge>
                    </TableCell>
                    <TableCell
                      className={
                        isOverdue(r.dueDate) && r.status === "missing"
                          ? "text-red-600"
                          : "text-gray-600"
                      }
                    >
                      {fmtDate(r.dueDate)}
                      {isOverdue(r.dueDate) && r.status === "missing" && " · เลยกำหนด"}
                    </TableCell>
                    <TableCell align="right" tabular className="text-gray-700">
                      {r.documentCount}
                    </TableCell>
                    <TableCell align="right">
                      {canWrite && (
                        <span className="flex items-center justify-end gap-2">
                          <CustomSelect
                            value={r.status}
                            onChange={(v) => {
                              const status = v as ChecklistStatus;
                              if (status === "na") {
                                setWaiveReason(r.waivedReason ?? "");
                                setWaiveFor(r);
                                return;
                              }
                              void changeStatus(r, status);
                            }}
                            options={STATUS_OPTIONS}
                            className="w-36"
                            disabled={savingId === r.id}
                          />
                          <Button size="sm" variant="outline" onClick={() => setUploadFor(r)}>
                            <Upload className="mr-1 h-4 w-4" /> อัปโหลด
                          </Button>
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ))
      )}

      <UploadDocumentDialog
        open={!!uploadFor}
        onOpenChange={(v) => !v && setUploadFor(null)}
        orgId={orgId}
        clientId={clientId}
        fiscalYear={period?.fiscalYear ?? year}
        periodId={period?.id ?? null}
        categories={categories}
        defaultCategoryId={uploadFor?.categoryId}
        onUploaded={() => {
          setUploadFor(null);
          if (period) void loadChecklist(period.id);
        }}
      />

      <Dialog open={!!waiveFor} onOpenChange={(v) => !v && setWaiveFor(null)}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>ระบุเหตุผลที่ไม่เกี่ยวข้อง</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <Text className="mb-2 text-sm text-gray-600">
              รายการ &ldquo;{waiveFor?.categoryName}&rdquo;
              จะถูกทำเครื่องหมายว่าไม่เกี่ยวข้องกับงวดนี้ —
              เหตุผลจะถูกบันทึกไว้ให้ตรวจสอบย้อนหลังได้
            </Text>
            <Label htmlFor="vault-waive-reason">เหตุผล *</Label>
            <Textarea
              id="vault-waive-reason"
              className="mt-1"
              rows={3}
              value={waiveReason}
              onChange={(e) => setWaiveReason(e.target.value)}
              placeholder="เช่น ลูกค้าไม่ได้จดทะเบียน VAT จึงไม่มีแบบ ภ.พ.30"
            />
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWaiveFor(null)}>
              ยกเลิก
            </Button>
            <Button
              disabled={!waiveReason.trim()}
              onClick={async () => {
                const row = waiveFor;
                if (!row) return;
                setWaiveFor(null);
                await changeStatus(row, "na", waiveReason.trim());
              }}
            >
              บันทึก
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
