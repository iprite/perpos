"use client";

// entries/page.tsx — A2 รายรับ-รายจ่าย (PATTERN PAGE — ล็อกก่อนขยาย P4b)
// StatCard×4 + filter bar (ค้นหา/ประเภท/หมวด/ช่วงวัน) + tab (ทั้งหมด/รายรับ/รายจ่าย, overflow-x-auto)
// + Table (วันที่/รายการ/หมวด+ป้าย AI/ผู้ติดต่อ/ที่มา/WHT/จำนวนเงิน) row clickable → EntryDialog
// + empty/loading + เลนส์ role (canWrite) · interactive จริง (add/update/delete + filter recompute + AI mock)
//
// gate §4: entries — owner/accountant/staff (W) · viewer (V)

import { useMemo, useState } from "react";
import {
  ArrowLeftRight,
  Search,
  TrendingUp,
  TrendingDown,
  Scale,
  ListChecks,
  Plus,
  Bot,
} from "lucide-react";
import cn from "@core/utils/class-names";
import { Input } from "@/components/ui/input";
import { CustomSelect } from "@/components/ui/custom-select";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import { Button } from "@/components/ui/button";
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
} from "@/components/ui/table";
import {
  AccountingShell,
  useAccountingRole,
  useAccountingData,
  fmtMoney,
  fmtDateTH,
  sumIncome,
  sumExpense,
  EntrySourceBadge,
  EntryDialog,
  NoAccess,
} from "../_components";
import type { AccEntry } from "../_fixtures/types";

type KindTab = "all" | "income" | "expense";

const KIND_TABS: { key: KindTab; label: string }[] = [
  { key: "all", label: "ทั้งหมด" },
  { key: "income", label: "รายรับ" },
  { key: "expense", label: "รายจ่าย" },
];

export default function EntriesPage() {
  const { can } = useAccountingRole();
  const canView = can("view", "entries");
  const canWrite = can("write", "entries");

  const { entries } = useAccountingData();

  // tab + filter
  const [tab, setTab] = useState<KindTab>("all");
  const [search, setSearch] = useState("");
  const [categoryF, setCategoryF] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AccEntry | null>(null);

  // ตัวเลือกหมวด (จากข้อมูลจริง)
  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    entries.forEach((e) => {
      if (e.category) set.add(e.category);
    });
    return [
      { value: "", label: "ทุกหมวด" },
      ...Array.from(set)
        .sort()
        .map((c) => ({ value: c, label: c })),
    ];
  }, [entries]);

  // filter ทำงานจริง
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries
      .filter((e) => {
        if (tab !== "all" && e.kind !== tab) return false;
        if (categoryF && e.category !== categoryF) return false;
        if (fromDate && e.entry_date < fromDate) return false;
        if (toDate && e.entry_date > toDate) return false;
        if (q) {
          const hay =
            `${e.description ?? ""} ${e.category ?? ""} ${e.contact_name ?? ""}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => b.entry_date.localeCompare(a.entry_date));
  }, [entries, tab, search, categoryF, fromDate, toDate]);

  // KPI — คำนวณจากรายการที่ filter อยู่ (สะท้อนสิ่งที่เห็น)
  const income = sumIncome(filtered);
  const expense = sumExpense(filtered);
  const net = income - expense;

  function openAdd() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(e: AccEntry) {
    setEditing(e);
    setDialogOpen(true);
  }

  if (!canView)
    return (
      <NoAccess title="รายรับ-รายจ่าย" icon={<ArrowLeftRight className="h-6 w-6" />}>
        บทบาทนี้ไม่สามารถดูรายรับ-รายจ่ายได้ — ลองสลับเป็นเจ้าของ/นักบัญชี
      </NoAccess>
    );

  const tabs = (
    <div className="flex gap-1.5 overflow-x-auto rounded-xl border border-gray-200 bg-white p-1.5 shadow-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {KIND_TABS.map((t) => (
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
      title="รายรับ-รายจ่าย"
      description="บันทึกเงินเข้า-ออกแบบง่าย ไม่ต้องรู้บัญชี — AI ช่วยแนะหมวดให้"
      icon={<ArrowLeftRight className="h-6 w-6" />}
      actions={
        canWrite ? (
          <Button onClick={openAdd}>
            <Plus className="mr-1.5 h-4 w-4" /> เพิ่มรายการ
          </Button>
        ) : undefined
      }
      tabs={tabs}
    >
      {/* KPI สรุป (ตามที่ filter อยู่) */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="รายรับ"
          value={fmtMoney(income)}
          tone="positive"
          valueColored
        />
        <StatCard
          icon={<TrendingDown className="h-4 w-4" />}
          label="รายจ่าย"
          value={fmtMoney(expense)}
          tone="negative"
          valueColored
        />
        <StatCard
          icon={<Scale className="h-4 w-4" />}
          label="คงเหลือ"
          value={net < 0 ? `−${fmtMoney(Math.abs(net), { currency: false })} ฿` : fmtMoney(net)}
          tone={net >= 0 ? "info" : "negative"}
          valueColored
        />
        <StatCard
          icon={<ListChecks className="h-4 w-4" />}
          label="จำนวนรายการ"
          value={String(filtered.length)}
          sub="ตามเงื่อนไขที่กรอง"
          tone="neutral"
        />
      </div>

      {/* filter bar */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              className="pl-9"
              placeholder="ค้นหา รายการ / หมวด / ผู้ติดต่อ"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <CustomSelect value={categoryF} onChange={setCategoryF} options={categoryOptions} />
          <ThaiDatePicker value={fromDate} onChange={setFromDate} placeholder="ตั้งแต่วันที่" />
          <ThaiDatePicker value={toDate} onChange={setToDate} placeholder="ถึงวันที่" />
        </div>
      </div>

      {/* table */}
      <Table className="shadow-sm">
        <TableHeader>
          <TableRow>
            <TableHead>วันที่</TableHead>
            <TableHead>รายการ</TableHead>
            <TableHead>หมวด</TableHead>
            <TableHead>ผู้ติดต่อ</TableHead>
            <TableHead align="center">ที่มา</TableHead>
            <TableHead align="right">หัก ณ ที่จ่าย</TableHead>
            <TableHead align="right">จำนวนเงิน</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 ? (
            <TableEmpty colSpan={7}>
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <div className="rounded-full bg-gray-100 p-4">
                  <ArrowLeftRight className="h-8 w-8 text-gray-400" />
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-900">ยังไม่มีรายการ</div>
                  <div className="mt-1 text-sm text-gray-500">
                    เริ่มบันทึกรายรับหรือรายจ่ายแรกของคุณ — ใช้เวลาไม่ถึงนาที
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
            filtered.map((e) => {
              const isIncome = e.kind === "income";
              return (
                <TableRow key={e.id} clickable onClick={() => openEdit(e)}>
                  <TableCell className="whitespace-nowrap text-gray-500">
                    {fmtDateTH(e.entry_date)}
                  </TableCell>
                  <TableCell className="text-gray-900">{e.description ?? "—"}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="text-gray-600">{e.category ?? "—"}</span>
                      {e.source === "ai" && (
                        <StatusBadge tone="info">
                          <Bot className="mr-1 h-3 w-3" /> AI
                        </StatusBadge>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="text-gray-500">{e.contact_name ?? "—"}</TableCell>
                  <TableCell align="center">
                    <EntrySourceBadge source={e.source} />
                  </TableCell>
                  {/* WHT cell = เลข%+ไทย "ไม่มี" → tabular-nums (ห้าม tabular = mono ทำไทยเพี้ยน) */}
                  <TableCell align="right" className="tabular-nums text-gray-500">
                    {e.wht_rate
                      ? `${e.wht_rate}% · ${fmtMoney(e.wht_amount ?? 0, { currency: false })}`
                      : "ไม่มี"}
                  </TableCell>
                  <TableCell
                    align="right"
                    tabular
                    className={isIncome ? "font-medium text-green-600" : "font-medium text-red-600"}
                  >
                    {isIncome
                      ? fmtMoney(e.amount)
                      : `−${fmtMoney(e.amount, { currency: false })} ฿`}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      <EntryDialog open={dialogOpen} onOpenChange={setDialogOpen} entry={editing} />
    </AccountingShell>
  );
}
