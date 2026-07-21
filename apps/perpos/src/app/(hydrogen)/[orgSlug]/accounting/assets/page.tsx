"use client";

// assets/page.tsx — B5 สินทรัพย์ & ค่าเสื่อม (หลังบ้าน)
//   list (ทุน/อายุ/ค่าเสื่อมสะสม/มูลค่าคงเหลือ) + AssetDialog + StatCard
//   + ปุ่ม "ตั้งค่าเสื่อมงวดนี้" → runDepreciation (เรียก API ต่อ asset) → dialog สรุป + toast
//   ข้อมูลจาก API จริง
// gate §4: assets — owner(V) · accountant(W) · staff(–) · viewer(V)

import { useMemo, useState } from "react";
import {
  Boxes,
  Plus,
  Banknote,
  TrendingDown,
  Wallet,
  CalendarClock,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { Text } from "@/components/ui/typography";
import { CustomSelect } from "@/components/ui/custom-select";
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
  TableLoading,
} from "@/components/ui/table";
import { toast } from "@/lib/toast";
import {
  AccountingShell,
  useAccountingRole,
  useAccountingData,
  fmtMoney,
  fmtDateTH,
  fmtMonthYearTH,
  NoAccess,
  AssetDialog,
} from "../_components";
import type { AccAsset } from "@/lib/accounting/types";
import type { DepreciationRunResult } from "../_components/data-provider";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** อายุที่ใช้มา (เดือน) จากวันได้มาถึงวันนี้ */
function monthsUsed(acquireISO: string): number {
  const a = new Date(acquireISO);
  const now = new Date();
  return Math.max(0, (now.getFullYear() - a.getFullYear()) * 12 + (now.getMonth() - a.getMonth()));
}

// ตัวเลือกงวดตั้งค่าเสื่อม (เดือนปัจจุบัน + ย้อนหลัง 2 เดือน)
function deprPeriodOptions(): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    out.push({ value: `${y}-${m}`, label: fmtMonthYearTH(y, m) });
  }
  return out;
}

export default function AssetsPage() {
  const { can } = useAccountingRole();
  const canView = can("view", "assets");
  const canWrite = can("write", "assets");

  const { assets, loading, runDepreciation } = useAccountingData();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AccAsset | null>(null);
  const [deprResult, setDeprResult] = useState<DepreciationRunResult | null>(null);
  const [running, setRunning] = useState(false);

  const periodOpts = useMemo(() => deprPeriodOptions(), []);
  const [deprPeriod, setDeprPeriod] = useState(periodOpts[0]?.value ?? "");

  const activeAssets = useMemo(() => assets.filter((a) => a.status === "active"), [assets]);

  const stats = useMemo(() => {
    const totalCost = activeAssets.reduce((s, a) => s + a.cost, 0);
    const totalAccum = activeAssets.reduce((s, a) => s + a.accumulated_depreciation, 0);
    const totalBook = round2(totalCost - totalAccum);
    const totalMonthly = activeAssets.reduce((s, a) => s + (a.monthly_depreciation ?? 0), 0);
    return { totalCost, totalAccum, totalBook, totalMonthly: round2(totalMonthly) };
  }, [activeAssets]);

  function openAdd() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(a: AccAsset) {
    setEditing(a);
    setDialogOpen(true);
  }

  async function handleRunDepreciation() {
    const [y, m] = deprPeriod.split("-").map(Number);
    if (!y || !m) return;
    setRunning(true);
    const result = await runDepreciation(y, m);
    setRunning(false);
    setDeprResult(result);
    if (result.posted.length > 0) {
      toast.success(
        `ตั้งค่าเสื่อม ${result.posted.length} รายการ รวม ${fmtMoney(result.total_amount)} → post journal แล้ว`,
      );
    } else {
      toast.success("งวดนี้ตั้งค่าเสื่อมครบทุกสินทรัพย์แล้ว — ไม่มีรายการใหม่");
    }
  }

  if (!canView)
    return (
      <NoAccess title="สินทรัพย์ & ค่าเสื่อม" icon={<Boxes className="h-6 w-6" />}>
        หน้าหลังบ้านนี้สำหรับนักบัญชี — บทบาทของคุณไม่มีสิทธิ์ดูสินทรัพย์ & ค่าเสื่อม
      </NoAccess>
    );

  return (
    <AccountingShell
      title="สินทรัพย์ & ค่าเสื่อม"
      description="ทะเบียนสินทรัพย์ + ตั้งค่าเสื่อมเส้นตรงอัตโนมัติ — ไม่ต้องคำนวณมือ"
      icon={<Boxes className="h-6 w-6" />}
      actions={
        canWrite ? (
          <div className="flex flex-wrap items-center gap-2">
            <CustomSelect
              value={deprPeriod}
              onChange={setDeprPeriod}
              options={periodOpts}
              className="w-44"
            />
            <Button
              variant="outline"
              disabled={running}
              onClick={() => void handleRunDepreciation()}
            >
              <CalendarClock className="mr-1.5 h-4 w-4" />
              {running ? "กำลังตั้งค่าเสื่อม…" : "ตั้งค่าเสื่อมงวดนี้"}
            </Button>
            <Button onClick={openAdd}>
              <Plus className="mr-1.5 h-4 w-4" /> เพิ่มสินทรัพย์
            </Button>
          </div>
        ) : undefined
      }
    >
      {/* KPI */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Banknote className="h-4 w-4" />}
          label="ราคาทุนรวม"
          value={fmtMoney(stats.totalCost)}
          tone="neutral"
        />
        <StatCard
          icon={<TrendingDown className="h-4 w-4" />}
          label="ค่าเสื่อมสะสม"
          value={fmtMoney(stats.totalAccum)}
          tone="warning"
          valueColored
        />
        <StatCard
          icon={<Wallet className="h-4 w-4" />}
          label="มูลค่าคงเหลือ"
          value={fmtMoney(stats.totalBook)}
          tone="info"
          valueColored
        />
        <StatCard
          icon={<CalendarClock className="h-4 w-4" />}
          label="ค่าเสื่อม/เดือน"
          value={fmtMoney(stats.totalMonthly)}
          sub={`${activeAssets.length} รายการใช้งาน`}
          tone="neutral"
        />
      </div>

      {/* table */}
      <Table className="shadow-sm">
        <TableHeader>
          <TableRow>
            <TableHead>สินทรัพย์</TableHead>
            <TableHead>วันได้มา</TableHead>
            <TableHead align="center">สถานะ</TableHead>
            <TableHead align="right">ราคาทุน</TableHead>
            <TableHead align="right">อายุใช้มา</TableHead>
            <TableHead align="right">ค่าเสื่อมสะสม</TableHead>
            <TableHead align="right">มูลค่าคงเหลือ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading.assets ? (
            <TableLoading colSpan={7} />
          ) : assets.length === 0 ? (
            <TableEmpty colSpan={7}>
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <div className="rounded-full bg-gray-100 p-4">
                  <Boxes className="h-8 w-8 text-gray-400" />
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-900">ยังไม่มีสินทรัพย์</div>
                  <div className="mt-1 text-sm text-gray-500">
                    เพิ่มสินทรัพย์เพื่อให้ระบบคำนวณค่าเสื่อมให้อัตโนมัติ
                  </div>
                </div>
                {canWrite && (
                  <Button size="sm" onClick={openAdd}>
                    <Plus className="mr-1.5 h-4 w-4" /> เพิ่มสินทรัพย์แรก
                  </Button>
                )}
              </div>
            </TableEmpty>
          ) : (
            assets.map((a) => {
              const book = round2(a.cost - a.accumulated_depreciation);
              const used = monthsUsed(a.acquire_date);
              return (
                <TableRow key={a.id} clickable onClick={() => openEdit(a)}>
                  <TableCell>
                    <div className="max-w-[240px] truncate font-medium text-gray-900">{a.name}</div>
                    <div className="text-xs text-gray-400">{a.asset_account_name ?? "—"}</div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-gray-500">
                    {fmtDateTH(a.acquire_date)}
                  </TableCell>
                  <TableCell align="center">
                    {a.status === "active" ? (
                      <StatusBadge tone="success">ใช้งาน</StatusBadge>
                    ) : (
                      <StatusBadge tone="neutral">ปลดใช้งาน</StatusBadge>
                    )}
                  </TableCell>
                  <TableCell align="right" tabular className="text-gray-900">
                    {fmtMoney(a.cost, { currency: false })}
                  </TableCell>
                  {/* อายุ = เลข+คำไทย "เดือน" → tabular-nums (ไม่ใช่ tabular = mono) */}
                  <TableCell align="right" className="whitespace-nowrap tabular-nums text-gray-500">
                    {used}/{a.useful_life_months} เดือน
                  </TableCell>
                  <TableCell align="right" tabular className="text-amber-700">
                    {fmtMoney(a.accumulated_depreciation, { currency: false })}
                  </TableCell>
                  <TableCell align="right" tabular className="font-medium text-gray-900">
                    {fmtMoney(book, { currency: false })}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      <AssetDialog open={dialogOpen} onOpenChange={setDialogOpen} asset={editing} />

      {/* สรุปผลการตั้งค่าเสื่อม */}
      <Dialog open={deprResult !== null} onOpenChange={(v) => !v && setDeprResult(null)}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>
              ผลการตั้งค่าเสื่อมราคา ·{" "}
              {deprResult ? fmtMonthYearTH(deprResult.period_year, deprResult.period_month) : ""}
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
            {deprResult && (
              <div className="space-y-3 text-sm">
                {deprResult.posted.length > 0 ? (
                  <>
                    <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-green-700">
                      <CheckCircle2 className="h-4 w-4" /> ตั้งค่าเสื่อม {deprResult.posted.length}{" "}
                      รายการ → post สมุดรายวัน (Dr ค่าเสื่อม / Cr ค่าเสื่อมสะสม)
                    </div>
                    <div className="mb-1 px-1 text-sm font-semibold text-gray-900">
                      รายการที่ตั้งค่าเสื่อมงวดนี้
                    </div>
                    <Table className="shadow-sm">
                      <TableHeader>
                        <TableRow>
                          <TableHead>สินทรัพย์</TableHead>
                          <TableHead align="right">ค่าเสื่อมงวดนี้ (โดยประมาณ)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {deprResult.posted.map((p) => (
                          <TableRow key={p.asset_id}>
                            <TableCell className="text-gray-700">{p.asset_name}</TableCell>
                            <TableCell align="right" tabular className="text-gray-900">
                              {fmtMoney(p.amount)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                      <span className="text-gray-600">รวมค่าเสื่อมงวดนี้ (โดยประมาณ)</span>
                      <span className="font-semibold tabular-nums text-gray-900">
                        {fmtMoney(deprResult.total_amount)}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-gray-600">
                    งวดนี้ตั้งค่าเสื่อมครบทุกสินทรัพย์แล้ว — ไม่มีรายการใหม่ (idempotent
                    ป้องกันลงซ้ำ)
                  </div>
                )}
                {deprResult.skipped.length > 0 && (
                  <Text className="text-xs text-gray-400">
                    ข้าม {deprResult.skipped.length} รายการ (ตั้งค่าเสื่อมงวดนี้ไปแล้ว
                    หรือคิดครบ/งวดปิด)
                  </Text>
                )}
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button onClick={() => setDeprResult(null)}>เข้าใจแล้ว</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AccountingShell>
  );
}
