"use client";

// page.tsx — A1 ภาพรวม (dashboard) — ฉบับเต็ม P4b
// StatCard×4 (รายรับ/รายจ่าย/คงเหลือ=กำไรเดือนนี้/เงินสด=เงินในมือ)
// + กราฟ cash flow 6 เดือน (div bar, palette token — ไม่ใช้ chart lib)
// + การ์ด "ภาษีที่ต้องส่ง" (TAX_GLOSSARY ภาษาคน — VAT on/มี PND)
// + Table รายการล่าสุด (heading เหนือ + shadow-sm)
// + AI-5 ถาม-ตอบ (Popover "ถาม AI" → getAskMock canned + loading จำลอง)
// gate §4: dashboard — ทุก role เห็น (view)

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  LayoutDashboard,
  TrendingUp,
  TrendingDown,
  Scale,
  Wallet,
  ArrowRight,
  Receipt,
  Sparkles,
  Loader2,
  Send,
} from "lucide-react";
import cn from "@core/utils/class-names";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/badge";
import { Popover } from "@/components/ui/popover";
import { Text } from "@/components/ui/typography";
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
  useAccountingData,
  fmtMoney,
  fmtMoneyShort,
  fmtDateTH,
  fmtMonthYearTH,
  sumIncome,
  sumExpense,
  EntryKindBadge,
  EntrySourceBadge,
} from "./_components";
import { TAX_GLOSSARY, dueDateLabel, getAskMock } from "./_fixtures";
import type { AskMockResult } from "./_fixtures/ai-mocks";

const CUR_YEAR = 2026;
const CUR_MONTH = 6;
// เงินสดยกมาต้นปี (mock — เงินในมือก่อนรายการในระบบ)
const OPENING_CASH = 850000;

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

// ── AI-5 ถาม-ตอบ (Popover panel) ────────────────────────────────────────────
function AskAiPanel() {
  const [question, setQuestion] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const [result, setResult] = useState<AskMockResult | null>(null);

  const samples = ["กำไรเดือนนี้เท่าไหร่", "ใบแจ้งหนี้ค้างชำระมีกี่ใบ", "ต้องยื่นภาษีอะไรเดือนนี้"];

  function ask(q: string) {
    const query = q.trim();
    if (!query) return;
    setQuestion(query);
    setState("loading");
    window.setTimeout(() => {
      setResult(getAskMock(query));
      setState("done");
    }, 900);
  }

  const pct = result ? Math.round(result.confidence * 100) : 0;

  return (
    <div className="w-[min(92vw,22rem)] p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-primary">
        <Sparkles className="h-4 w-4" /> ถาม AI เรื่องบัญชีของคุณ
      </div>
      <Text className="mt-1 text-xs text-gray-500">ถามภาษาคน — AI ตอบจากข้อมูลธุรกิจของคุณ</Text>

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
      >
        <Input
          placeholder="เช่น กำไรเดือนนี้เท่าไหร่"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <Button type="submit" size="icon" disabled={!question.trim() || state === "loading"}>
          <Send className="h-4 w-4" />
        </Button>
      </form>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {samples.map((s) => (
          <Button
            key={s}
            type="button"
            variant="outline"
            onClick={() => ask(s)}
            className="h-auto rounded-full border-gray-200 px-2 py-0.5 text-[11px] font-normal text-gray-600 hover:border-primary/40 hover:text-primary"
          >
            {s}
          </Button>
        ))}
      </div>

      {state === "loading" && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/[0.03] px-3 py-2.5 text-xs text-primary">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> AI กำลังค้นข้อมูลและประมวลผล…
        </div>
      )}

      {state === "done" && result && (
        <div className="mt-3 space-y-2 rounded-lg border border-primary/20 bg-primary/[0.03] px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs font-medium text-primary">
              <Sparkles className="h-3.5 w-3.5" /> คำตอบ
            </span>
            {pct > 0 && (
              <StatusBadge tone={pct >= 90 ? "success" : pct >= 75 ? "info" : "warning"}>
                ความเชื่อมั่น {pct}%
              </StatusBadge>
            )}
          </div>
          <Text className="text-sm leading-relaxed text-gray-700">{result.answer}</Text>
          {result.references.length > 0 && (
            <Text className="text-[11px] text-gray-400">
              อ้างอิง: {result.references.join(" · ")}
            </Text>
          )}
        </div>
      )}
    </div>
  );
}

export default function AccountingOverviewPage() {
  const { entries, documents, taxFilings, orgSettings } = useAccountingData();

  const monthEntries = useMemo(
    () =>
      entries.filter((e) => {
        const d = new Date(e.entry_date);
        return d.getFullYear() === CUR_YEAR && d.getMonth() + 1 === CUR_MONTH;
      }),
    [entries],
  );

  const income = sumIncome(monthEntries);
  const expense = sumExpense(monthEntries);
  const net = income - expense; // กำไรเดือนนี้

  // เงินสดในมือ = เงินยกมา + รายรับสะสมทั้งหมด − รายจ่ายสะสมทั้งหมด (mock)
  const cashOnHand = useMemo(
    () => OPENING_CASH + sumIncome(entries) - sumExpense(entries),
    [entries],
  );

  // กราฟ cash flow 6 เดือนล่าสุด (ม.ค.–มิ.ย. 2569)
  const cashFlow = useMemo(() => {
    const months = [1, 2, 3, 4, 5, 6];
    return months.map((m) => {
      const rows = entries.filter((e) => {
        const d = new Date(e.entry_date);
        return d.getFullYear() === CUR_YEAR && d.getMonth() + 1 === m;
      });
      return { month: m, income: sumIncome(rows), expense: sumExpense(rows) };
    });
  }, [entries]);
  const maxFlow = Math.max(1, ...cashFlow.map((c) => Math.max(c.income, c.expense)));

  // การ์ดภาษีที่ต้องส่ง — PND (เสมอ) + PP30 เฉพาะจด VAT
  const taxToFile = useMemo(() => {
    return taxFilings
      .filter((t) => t.status !== "filed")
      .filter((t) => (t.tax_kind === "pp30" ? orgSettings.is_vat_registered : true))
      .map((t) => ({ ...t, due: dueDateLabel(t.due_date) }))
      .sort((a, b) => a.due.daysLeft - b.due.daysLeft)
      .slice(0, 3);
  }, [taxFilings, orgSettings.is_vat_registered]);

  const overdueCount = useMemo(
    () => documents.filter((d) => d.status === "overdue").length,
    [documents],
  );

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
        <div className="flex gap-2">
          <Popover
            placement="bottom-end"
            trigger={
              <Button variant="outline">
                <Sparkles className="mr-1.5 h-4 w-4" /> ถาม AI
              </Button>
            }
          >
            <AskAiPanel />
          </Popover>
          <Link href="/admin/prototypes/accounting/entries">
            <Button>
              บันทึกรายรับ-รายจ่าย <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          </Link>
        </div>
      }
    >
      {/* KPI — รายรับ/รายจ่าย/คงเหลือ(กำไรเดือนนี้)/เงินสด(เงินในมือ) */}
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
          value={net < 0 ? `−${fmtMoney(Math.abs(net), { currency: false })} ฿` : fmtMoney(net)}
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
              <div key={c.month} className="flex flex-1 flex-col items-center gap-2">
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
                <div className="text-[11px] text-gray-500">{TH_MONTH_SHORT[c.month - 1]}</div>
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
                        {TAX_GLOSSARY[t.tax_kind]}
                      </div>
                      <StatusBadge tone={urgent ? "warning" : "neutral"}>
                        อีก {t.due.daysLeft} วัน
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
            href="/admin/prototypes/accounting/tax"
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
            {recent.length === 0 ? (
              <TableEmpty colSpan={6}>ยังไม่มีรายการ</TableEmpty>
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
                    {e.kind === "income"
                      ? fmtMoney(e.amount)
                      : `−${fmtMoney(e.amount, { currency: false })} ฿`}
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
