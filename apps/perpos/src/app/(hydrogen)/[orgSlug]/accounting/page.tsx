"use client";

// page.tsx — A1 ภาพรวม (dashboard) — PATTERN PAGE (production)
//   StatCard×4 (รายรับ/รายจ่าย/กำไรเดือนนี้/เงินสดในมือ จากข้อมูลจริง)
//   + กราฟ cash flow 6 เดือน (div bar, palette token — ไม่ใช้ chart lib)
//   + การ์ด "ภาษีที่ต้องส่ง" (PND เสมอ + PP30 เฉพาะจด VAT) + Table รายการล่าสุด
//   ตัด AI ถาม-ตอบ ออก (B0 เลื่อนเฟส 2) · ทุกตัวเลขจาก provider (API จริง)
// gate §4: dashboard — ทุก role เห็น (view)

import { useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  LayoutDashboard,
  TrendingUp,
  TrendingDown,
  Scale,
  Wallet,
  ArrowRight,
  Receipt,
  ReceiptText,
  Clock,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import cn from "@core/utils/class-names";
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
  TableLoading,
} from "@/components/ui/table";
import {
  AccountingShell,
  useAccountingData,
  fmtMoney,
  fmtMoneyShort,
  fmtNegative,
  fmtDateTH,
  fmtMonthYearTH,
  sumIncome,
  sumExpense,
  EntryKindBadge,
  EntrySourceBadge,
} from "./_components";
import type { AccTaxKind } from "@/lib/accounting/types";
import { DOC_TYPE_LABEL } from "@/lib/accounting/types";
import { selectBillingDocuments, billingSign } from "@/lib/accounting/sales-journal";

// เงินสดยกมาต้นปี — production: ตั้ง 0 (ยังไม่มี opening-balance setting ในเฟสนี้ → เงินในมือ = สะสมในระบบ)
const OPENING_CASH = 0;

const TAX_LABEL: Record<AccTaxKind, string> = {
  pp30: "ภาษีมูลค่าเพิ่ม (ภ.พ.30)",
  pnd1: "ภาษีหัก ณ ที่จ่าย เงินเดือน (ภ.ง.ด.1)",
  pnd3: "ภาษีหัก ณ ที่จ่าย บุคคล (ภ.ง.ด.3)",
  pnd53: "ภาษีหัก ณ ที่จ่าย นิติบุคคล (ภ.ง.ด.53)",
};

const TH_MONTH_SHORT = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];

/** จำนวนวันถึงกำหนด + ป้ายวันที่ พ.ศ. */
function dueInfo(dueISO: string): { daysLeft: number; label: string } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueISO);
  const daysLeft = Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
  return { daysLeft, label: fmtDateTH(dueISO) };
}

export default function AccountingOverviewPage() {
  const params = useParams();
  const orgSlug = String(params?.orgSlug ?? "");
  const base = `/${orgSlug}/accounting`;

  const { entries, documents, taxFilings, orgSettings, loading } = useAccountingData();

  const now = new Date();
  const CUR_YEAR = now.getFullYear();
  const CUR_MONTH = now.getMonth() + 1;
  const isVatRegistered = orgSettings?.is_vat_registered ?? false;

  const monthEntries = useMemo(
    () =>
      entries.filter((e) => {
        const d = new Date(e.entry_date);
        return d.getFullYear() === CUR_YEAR && d.getMonth() + 1 === CUR_MONTH;
      }),
    [entries, CUR_YEAR, CUR_MONTH],
  );

  const income = sumIncome(monthEntries);
  const expense = sumExpense(monthEntries);
  const net = income - expense; // กำไรเดือนนี้

  // เงินสดในมือ = เงินยกมา + รายรับสะสมทั้งหมด − รายจ่ายสะสมทั้งหมด
  const cashOnHand = useMemo(
    () => OPENING_CASH + sumIncome(entries) - sumExpense(entries),
    [entries],
  );

  // กราฟ cash flow 6 เดือนล่าสุด (จบที่เดือนปัจจุบัน)
  const cashFlow = useMemo(() => {
    const out: { ym: string; label: string; income: number; expense: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(CUR_YEAR, CUR_MONTH - 1 - i, 1);
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      const rows = entries.filter((e) => {
        const ed = new Date(e.entry_date);
        return ed.getFullYear() === y && ed.getMonth() + 1 === m;
      });
      out.push({
        ym: `${y}-${m}`,
        label: TH_MONTH_SHORT[m - 1],
        income: sumIncome(rows),
        expense: sumExpense(rows),
      });
    }
    return out;
  }, [entries, CUR_YEAR, CUR_MONTH]);
  const maxFlow = Math.max(1, ...cashFlow.map((c) => Math.max(c.income, c.expense)));

  // การ์ดภาษีที่ต้องส่ง — PND เสมอ + PP30 เฉพาะจด VAT
  const taxToFile = useMemo(() => {
    return taxFilings
      .filter((t) => t.status !== "filed")
      .filter((t) => (t.tax_kind === "pp30" ? isVatRegistered : true))
      .map((t) => ({ ...t, due: dueInfo(t.due_date) }))
      .sort((a, b) => a.due.daysLeft - b.due.daysLeft)
      .slice(0, 3);
  }, [taxFilings, isVatRegistered]);

  const overdueCount = useMemo(
    () => documents.filter((d) => d.status === "overdue").length,
    [documents],
  );

  // ── มุมเจ้าของกิจการ: "เงินที่ยังไม่เข้ากระเป๋า" (Phase 2) ────────────────────
  // KPI ด้านบนเป็นเงินสดจริง (entries) → ออกใบกำกับแล้วแต่ยังไม่เก็บเงิน ตัวเลขจะเป็น 0
  // เจ้าของกิจการจึงงงว่า "ขายได้แล้วเงินอยู่ไหน" · บล็อกนี้ตอบจากเอกสารขายแทน
  // ใช้ selectBillingDocuments = กฎเดียวกับ auto journal (ไม่นับซ้ำทั้งสายเอกสาร)
  const sales = useMemo(() => {
    const billing = selectBillingDocuments(documents, isVatRegistered);
    const amount = (arr: typeof billing) =>
      arr.reduce((s, d) => s + billingSign(d.doc_type) * d.total, 0);
    const thisMonth = billing.filter((d) => {
      const dt = new Date(d.issue_date);
      return dt.getFullYear() === CUR_YEAR && dt.getMonth() + 1 === CUR_MONTH;
    });
    const unpaid = billing.filter((d) => d.status !== "paid");
    const overdue = billing.filter((d) => d.status === "overdue");
    return {
      month: amount(thisMonth),
      monthCount: thisMonth.length,
      unpaid: amount(unpaid),
      unpaidCount: unpaid.length,
      overdue: amount(overdue),
      overdueCount: overdue.length,
    };
  }, [documents, isVatRegistered, CUR_YEAR, CUR_MONTH]);

  // งานที่ต้องตามต่อ — เรียงตามความเร่งด่วน (เกินกำหนดก่อน แล้วค่อยใกล้ครบกำหนด)
  // ตอบคำถามเดียวที่เจ้าของกิจการถามทุกเช้า: "วันนี้ต้องตามใคร"
  const todo = useMemo(() => {
    const rows = documents
      .filter((d) => d.status === "overdue" || d.status === "sent" || d.status === "accepted")
      .map((d) => {
        const info = d.due_date ? dueInfo(d.due_date) : null;
        return { doc: d, daysLeft: info?.daysLeft ?? 9999, dueLabel: info?.label ?? "—" };
      })
      .filter((r) => r.doc.status === "overdue" || r.daysLeft <= 7)
      .sort((a, b) => a.daysLeft - b.daysLeft);
    return rows.slice(0, 5);
  }, [documents]);

  const recent = useMemo(
    () => [...entries].sort((a, b) => b.entry_date.localeCompare(a.entry_date)).slice(0, 8),
    [entries],
  );

  return (
    <AccountingShell
      title="ภาพรวม"
      description={`สุขภาพธุรกิจของคุณ — ${fmtMonthYearTH(CUR_YEAR, CUR_MONTH)}`}
      icon={<LayoutDashboard className="h-6 w-6" />}
      actions={
        <Link href={`${base}/entries`}>
          <Button>
            บันทึกรายรับ-รายจ่าย <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        </Link>
      }
    >
      {/* ── เงินที่ยังไม่เข้ากระเป๋า + งานที่ต้องตามต่อ (มุมเจ้าของกิจการ) ───────── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-1">
          <StatCard
            icon={<ReceiptText className="h-4 w-4" />}
            label="ยอดขายเดือนนี้ (ตามเอกสาร)"
            value={fmtMoney(sales.month)}
            sub={`${sales.monthCount} ใบ — รวมที่ยังไม่เก็บเงิน`}
            tone="info"
            valueColored
          />
          <StatCard
            icon={<Clock className="h-4 w-4" />}
            label="รอเก็บเงิน"
            value={fmtMoney(sales.unpaid)}
            sub={sales.unpaidCount > 0 ? `${sales.unpaidCount} ใบ` : "เก็บครบแล้ว"}
            tone="warning"
            valueColored
          />
          <StatCard
            icon={<AlertTriangle className="h-4 w-4" />}
            label="เลยกำหนดชำระ"
            value={fmtMoney(sales.overdue)}
            sub={sales.overdueCount > 0 ? `${sales.overdueCount} ใบ — ควรโทรตาม` : "ไม่มี"}
            tone={sales.overdueCount > 0 ? "negative" : "positive"}
            valueColored
          />
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-gray-900">ต้องตามต่อ</div>
            <Link
              href={`${base}/documents`}
              className="text-xs text-gray-500 underline-offset-2 hover:underline"
            >
              ดูเอกสารขายทั้งหมด
            </Link>
          </div>

          {todo.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="mb-3 rounded-full bg-gray-100 p-3">
                <CheckCircle2 className="h-6 w-6 text-gray-400" />
              </div>
              <div className="text-sm font-medium text-gray-900">ไม่มีบิลที่ต้องตามใน 7 วันนี้</div>
              <div className="mt-1 text-sm text-gray-500">
                ออกใบเสนอราคาหรือใบกำกับใบใหม่ได้ที่หน้าเอกสารขาย
              </div>
              <Link href={`${base}/documents`} className="mt-4">
                <Button size="sm" variant="outline">
                  ไปหน้าเอกสารขาย
                </Button>
              </Link>
            </div>
          ) : (
            <ul className="mt-3 divide-y divide-gray-100">
              {todo.map(({ doc, daysLeft, dueLabel }) => (
                <li key={doc.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate text-sm text-gray-900">{doc.contact_name ?? "—"}</div>
                    <div className="text-xs text-gray-500">
                      {DOC_TYPE_LABEL[doc.doc_type]} {doc.doc_number} · ครบกำหนด {dueLabel}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="font-mono text-sm tabular-nums text-gray-900">
                      {fmtMoney(doc.total)}
                    </span>
                    {doc.status === "overdue" ? (
                      // ไม่มีวันครบกำหนด (ตั้งสถานะเอง) → บอกแค่ "เลยกำหนด" ห้ามโชว์ 9999 วัน
                      <StatusBadge tone="danger">
                        {doc.due_date ? `เลย ${Math.abs(daysLeft)} วัน` : "เลยกำหนด"}
                      </StatusBadge>
                    ) : (
                      <StatusBadge tone="warning">อีก {daysLeft} วัน</StatusBadge>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* KPI — รายรับ/รายจ่าย/กำไรเดือนนี้/เงินสด */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="รายรับเดือนนี้"
          value={fmtMoney(income)}
          tone="positive"
          valueColored
        />
        <StatCard
          icon={<TrendingDown className="h-4 w-4" />}
          label="รายจ่ายเดือนนี้"
          value={fmtMoney(expense)}
          tone="negative"
          valueColored
        />
        <StatCard
          icon={<Scale className="h-4 w-4" />}
          label="คงเหลือ (กำไรเดือนนี้)"
          value={net < 0 ? fmtNegative(net) : fmtMoney(net)}
          sub="รายรับ − รายจ่าย เดือนนี้"
          tone={net >= 0 ? "info" : "negative"}
          valueColored
        />
        <StatCard
          icon={<Wallet className="h-4 w-4" />}
          label="เงินสด (เงินในมือ)"
          value={fmtMoney(cashOnHand)}
          sub="ยอดสะสมในบัญชี/เงินสด"
          tone="primary"
          valueColored
        />
      </div>

      {/* กราฟ cash flow + การ์ดภาษี */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* cash flow 6 เดือน */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-gray-900">กระแสเงินสด 6 เดือนล่าสุด</div>
            <div className="flex items-center gap-3 text-[11px] text-gray-500">
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-sm bg-green-500" /> รายรับ
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-sm bg-red-400" /> รายจ่าย
              </span>
            </div>
          </div>
          <div className="mt-5 flex items-end justify-between gap-2 sm:gap-4">
            {cashFlow.map((c) => (
              <div key={c.ym} className="flex flex-1 flex-col items-center gap-2">
                <div className="flex h-40 w-full items-end justify-center gap-1">
                  <div
                    className="w-1/2 max-w-[18px] rounded-t bg-green-500 transition-all"
                    style={{ height: `${(c.income / maxFlow) * 100}%` }}
                    title={`รายรับ ${fmtMoney(c.income)}`}
                  />
                  <div
                    className="w-1/2 max-w-[18px] rounded-t bg-red-400 transition-all"
                    style={{ height: `${(c.expense / maxFlow) * 100}%` }}
                    title={`รายจ่าย ${fmtMoney(c.expense)}`}
                  />
                </div>
                <div className="text-[11px] text-gray-500">{c.label}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 text-[11px] text-gray-400">
            สูงสุดในแกน: {fmtMoneyShort(maxFlow)} — แท่งเทียบสัดส่วนต่อยอดสูงสุด
          </div>
        </div>

        {/* การ์ดภาษีที่ต้องส่ง */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <Receipt className="h-4 w-4 text-gray-400" /> ภาษีที่ต้องส่ง
          </div>
          {taxToFile.length === 0 ? (
            <div className="mt-4 text-sm text-gray-400">ไม่มีภาษีค้างยื่นในช่วงนี้</div>
          ) : (
            <div className="mt-3 space-y-2.5">
              {taxToFile.map((t) => {
                const urgent = t.due.daysLeft <= 7;
                return (
                  <div key={t.id} className="rounded-lg border border-gray-200 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium text-gray-900">
                        {TAX_LABEL[t.tax_kind]}
                      </div>
                      <StatusBadge tone={urgent ? "warning" : "neutral"}>
                        {t.due.daysLeft >= 0 ? `อีก ${t.due.daysLeft} วัน` : "เกินกำหนด"}
                      </StatusBadge>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs">
                      <span className="text-gray-500">ยื่นภายใน {t.due.label}</span>
                      <span className="font-mono font-semibold tabular-nums text-gray-900">
                        {fmtMoney(t.wht_total ?? t.net_payable ?? 0)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <Link
            href={`${base}/tax`}
            className={cn(
              "mt-3 flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 py-2",
              "text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900",
            )}
          >
            ดูภาษีของฉันทั้งหมด <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          {overdueCount > 0 && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              มีใบแจ้งหนี้เกินกำหนดชำระ {overdueCount} ใบ — ติดตามได้ที่หน้าเอกสารขาย
            </div>
          )}
        </div>
      </div>

      {/* รายการล่าสุด */}
      <div>
        <div className="mb-2.5 px-1 text-sm font-semibold text-gray-900">รายการล่าสุด</div>
        <Table className="shadow-sm">
          <TableHeader>
            <TableRow>
              <TableHead>วันที่</TableHead>
              <TableHead>รายการ</TableHead>
              <TableHead>หมวด</TableHead>
              <TableHead align="center">ประเภท</TableHead>
              <TableHead align="center">ที่มา</TableHead>
              <TableHead align="right">จำนวนเงิน</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading.entries ? (
              <TableLoading colSpan={6} />
            ) : recent.length === 0 ? (
              <TableEmpty colSpan={6}>
                ยังไม่มีรายการ — เริ่มบันทึกรายรับ-รายจ่ายแรกของคุณ
              </TableEmpty>
            ) : (
              recent.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="whitespace-nowrap text-gray-500">
                    {fmtDateTH(e.entry_date)}
                  </TableCell>
                  <TableCell className="text-gray-900">{e.description ?? "—"}</TableCell>
                  <TableCell className="text-gray-500">{e.category ?? "—"}</TableCell>
                  <TableCell align="center">
                    <EntryKindBadge kind={e.kind} />
                  </TableCell>
                  <TableCell align="center">
                    <EntrySourceBadge source={e.source} />
                  </TableCell>
                  <TableCell
                    align="right"
                    tabular
                    className={
                      e.kind === "income"
                        ? "font-medium text-green-600"
                        : "font-medium text-red-600"
                    }
                  >
                    {e.kind === "income" ? fmtMoney(e.amount) : fmtNegative(e.amount)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </AccountingShell>
  );
}
