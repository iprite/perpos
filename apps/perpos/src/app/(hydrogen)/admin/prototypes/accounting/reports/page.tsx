"use client";

// B3 reports/page.tsx — รายงานการเงิน (หลังบ้าน)
// Tab (overflow-x-auto): งบทดลอง / งบกำไรขาดทุน / งบแสดงฐานะการเงิน / แยกประเภท (ledger)
// + period selector + TableFooter รวม (Dr=Cr) + ตัวบ่งชี้งบสมดุล + AI สรุป (mock)
//
// gate §4: reports — owner(V) · accountant(V) · staff(–) · viewer(V) — view only

import { useMemo, useState } from "react";
import { BarChart3, Scale, TrendingUp, Landmark, ListTree, Sparkles } from "lucide-react";
import cn from "@core/utils/class-names";
import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/custom-select";
import { Text } from "@/components/ui/typography";
import { StatusBadge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
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
  NoAccess,
} from "../_components";
import {
  computeAccountBalances,
  buildTrialBalance,
  buildIncomeStatement,
  buildBalanceSheet,
  buildLedger,
} from "../_components/reports";

type ReportTab = "trial" | "income" | "balance" | "ledger";

const TABS: { key: ReportTab; label: string; icon: React.ReactNode }[] = [
  { key: "trial", label: "งบทดลอง", icon: <Scale className="h-4 w-4" /> },
  { key: "income", label: "งบกำไรขาดทุน", icon: <TrendingUp className="h-4 w-4" /> },
  { key: "balance", label: "งบแสดงฐานะการเงิน", icon: <Landmark className="h-4 w-4" /> },
  { key: "ledger", label: "แยกประเภท", icon: <ListTree className="h-4 w-4" /> },
];

const PERIOD_OPTIONS = [
  { value: "2026-0", label: "ทั้งปี 2569" },
  { value: "2026-4", label: "ถึง เมษายน 2569" },
  { value: "2026-5", label: "ถึง พฤษภาคม 2569" },
  { value: "2026-6", label: "ถึง มิถุนายน 2569" },
];

export default function ReportsPage() {
  const { can } = useAccountingRole();
  const canView = can("view", "reports");

  const { accounts, journal } = useAccountingData();

  const [tab, setTab] = useState<ReportTab>("trial");
  const [period, setPeriod] = useState("2026-0");
  const [ledgerAcc, setLedgerAcc] = useState("");

  const [year, monthRaw] = period.split("-").map(Number);
  const month = monthRaw === 0 ? null : monthRaw;

  const balances = useMemo(
    () => computeAccountBalances(accounts, journal, year, month),
    [accounts, journal, year, month],
  );
  const trial = useMemo(() => buildTrialBalance(balances), [balances]);
  const income = useMemo(() => buildIncomeStatement(balances), [balances]);
  const balanceSheet = useMemo(
    () => buildBalanceSheet(balances, income.netProfit),
    [balances, income.netProfit],
  );
  const ledger = useMemo(
    () => (ledgerAcc ? buildLedger(ledgerAcc, accounts, journal, year, month) : null),
    [ledgerAcc, accounts, journal, year, month],
  );

  // บัญชีที่มี movement ในงวด (สำหรับ ledger selector)
  const accountsWithMovement = useMemo(() => {
    const ids = new Set(balances.map((b) => b.account_id));
    return [
      { value: "", label: "— เลือกบัญชี —" },
      ...accounts
        .filter((a) => ids.has(a.id))
        .sort((a, b) => a.code.localeCompare(b.code))
        .map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` })),
    ];
  }, [accounts, balances]);

  const aiSummary = useMemo(() => {
    if (tab === "income") {
      return `งวดนี้รายได้รวม ${fmtMoney(income.totalIncome)} ค่าใช้จ่ายรวม ${fmtMoney(
        income.totalExpense,
      )} → ${income.netProfit >= 0 ? "กำไรสุทธิ" : "ขาดทุนสุทธิ"} ${fmtMoney(Math.abs(income.netProfit))}. หมวดค่าใช้จ่ายสูงสุดคือเงินเดือนและค่าจ้าง — ควรเฝ้าระวังสัดส่วนต้นทุนแรงงานต่อรายได้`;
    }
    if (tab === "balance") {
      return `สินทรัพย์รวม ${fmtMoney(balanceSheet.totalAssets)} = หนี้สิน ${fmtMoney(
        balanceSheet.totalLiabilities,
      )} + ส่วนของเจ้าของ ${fmtMoney(balanceSheet.totalEquity + balanceSheet.netProfit)}. ${
        balanceSheet.balanced
          ? "งบสมดุล (สมการบัญชีถูกต้อง)"
          : "งบไม่สมดุล — ตรวจสอบรายการที่ยังไม่ post"
      }`;
    }
    return `งบทดลองรวมเดบิต ${fmtMoney(trial.totalDebit)} เครดิต ${fmtMoney(trial.totalCredit)} — ${
      trial.balanced ? "ยอดสมดุล พร้อมปิดงบ" : "ยอดไม่สมดุล ตรวจสอบ journal"
    }`;
  }, [tab, income, balanceSheet, trial]);

  if (!canView)
    return (
      <NoAccess title="รายงานการเงิน" icon={<BarChart3 className="h-6 w-6" />}>
        หน้าหลังบ้านนี้สำหรับนักบัญชี — ลองสลับเป็นเจ้าของ/นักบัญชี/ผู้ดูข้อมูล
      </NoAccess>
    );

  const tabs = (
    <div className="flex gap-1.5 overflow-x-auto rounded-xl border border-gray-200 bg-white p-1.5 shadow-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {TABS.map((t) => (
        <Button
          key={t.key}
          size="sm"
          variant={tab === t.key ? "secondary" : "ghost"}
          className={cn("shrink-0 whitespace-nowrap", tab === t.key && "bg-gray-100 text-gray-900")}
          onClick={() => setTab(t.key)}
        >
          <span className="mr-1.5">{t.icon}</span>
          {t.label}
        </Button>
      ))}
    </div>
  );

  return (
    <AccountingShell
      title="รายงานการเงิน"
      description="ปิดงบ/ส่งผู้สอบบัญชีได้ — งบทดลอง กำไรขาดทุน ฐานะการเงิน และบัญชีแยกประเภท"
      icon={<BarChart3 className="h-6 w-6" />}
      actions={
        <CustomSelect
          value={period}
          onChange={setPeriod}
          options={PERIOD_OPTIONS}
          className="w-48"
        />
      }
      tabs={tabs}
    >
      {/* AI สรุปงบ (mock) */}
      <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-4 shadow-sm">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Sparkles className="h-4 w-4" />
          </span>
          <div>
            <div className="text-sm font-medium text-primary">AI สรุปงบการเงิน</div>
            <Text className="mt-0.5 text-sm text-gray-600">{aiSummary}</Text>
          </div>
        </div>
      </div>

      {/* งบทดลอง */}
      {tab === "trial" && (
        <div>
          <div className="mb-2.5 flex items-center justify-between px-1">
            <span className="text-sm font-semibold text-gray-900">งบทดลอง (Trial Balance)</span>
            <StatusBadge tone={trial.balanced ? "success" : "danger"}>
              {trial.balanced ? "สมดุล" : "ไม่สมดุล"}
            </StatusBadge>
          </div>
          <Table className="shadow-sm">
            <TableHeader>
              <TableRow>
                <TableHead>เลขที่</TableHead>
                <TableHead>ชื่อบัญชี</TableHead>
                <TableHead align="right">เดบิต</TableHead>
                <TableHead align="right">เครดิต</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trial.rows.length === 0 ? (
                <TableEmpty colSpan={4}>ไม่มีรายการในงวดนี้</TableEmpty>
              ) : (
                trial.rows.map((r) => (
                  <TableRow key={r.code}>
                    <TableCell className="font-mono text-xs tabular-nums text-gray-400">
                      {r.code}
                    </TableCell>
                    <TableCell className="text-gray-700">{r.name}</TableCell>
                    <TableCell align="right" tabular className="text-gray-900">
                      {r.debit ? fmtMoney(r.debit, { currency: false }) : "—"}
                    </TableCell>
                    <TableCell align="right" tabular className="text-gray-900">
                      {r.credit ? fmtMoney(r.credit, { currency: false }) : "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
            {trial.rows.length > 0 && (
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={2}>รวม</TableCell>
                  <TableCell align="right" tabular>
                    {fmtMoney(trial.totalDebit, { currency: false })}
                  </TableCell>
                  <TableCell align="right" tabular>
                    {fmtMoney(trial.totalCredit, { currency: false })}
                  </TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </div>
      )}

      {/* งบกำไรขาดทุน */}
      {tab === "income" && (
        <div>
          <div className="mb-2.5 px-1 text-sm font-semibold text-gray-900">
            งบกำไรขาดทุน (Income Statement)
          </div>
          <Table className="shadow-sm">
            <TableHeader>
              <TableRow>
                <TableHead>รายการ</TableHead>
                <TableHead align="right">จำนวนเงิน</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-semibold text-gray-900">รายได้</TableCell>
                <TableCell />
              </TableRow>
              {income.incomeRows.map((r) => (
                <TableRow key={r.account_id}>
                  <TableCell className="pl-8 text-gray-600">
                    {r.code} · {r.name}
                  </TableCell>
                  <TableCell align="right" tabular className="text-green-600">
                    {fmtMoney(r.balance, { currency: false })}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell className="pl-4 font-medium text-gray-700">รวมรายได้</TableCell>
                <TableCell align="right" tabular className="font-medium text-green-600">
                  {fmtMoney(income.totalIncome, { currency: false })}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-semibold text-gray-900">ค่าใช้จ่าย</TableCell>
                <TableCell />
              </TableRow>
              {income.expenseRows.map((r) => (
                <TableRow key={r.account_id}>
                  <TableCell className="pl-8 text-gray-600">
                    {r.code} · {r.name}
                  </TableCell>
                  <TableCell align="right" tabular className="text-red-600">
                    {fmtMoney(r.balance, { currency: false })}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell className="pl-4 font-medium text-gray-700">รวมค่าใช้จ่าย</TableCell>
                <TableCell align="right" tabular className="font-medium text-red-600">
                  {fmtMoney(income.totalExpense, { currency: false })}
                </TableCell>
              </TableRow>
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>{income.netProfit >= 0 ? "กำไรสุทธิ" : "ขาดทุนสุทธิ"}</TableCell>
                <TableCell
                  align="right"
                  tabular
                  className={income.netProfit >= 0 ? "text-green-600" : "text-red-600"}
                >
                  {income.netProfit >= 0
                    ? fmtMoney(income.netProfit, { currency: false })
                    : `−${fmtMoney(Math.abs(income.netProfit), { currency: false })}`}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}

      {/* งบแสดงฐานะการเงิน */}
      {tab === "balance" && (
        <div>
          <div className="mb-2.5 flex items-center justify-between px-1">
            <span className="text-sm font-semibold text-gray-900">
              งบแสดงฐานะการเงิน (Balance Sheet)
            </span>
            <StatusBadge tone={balanceSheet.balanced ? "success" : "danger"}>
              {balanceSheet.balanced ? "สมดุล" : "ไม่สมดุล"}
            </StatusBadge>
          </div>
          <Table className="shadow-sm">
            <TableHeader>
              <TableRow>
                <TableHead>รายการ</TableHead>
                <TableHead align="right">จำนวนเงิน</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-semibold text-gray-900">สินทรัพย์</TableCell>
                <TableCell />
              </TableRow>
              {balanceSheet.assetRows.map((r) => (
                <TableRow key={r.account_id}>
                  <TableCell className="pl-8 text-gray-600">
                    {r.code} · {r.name}
                  </TableCell>
                  <TableCell align="right" tabular className="text-gray-900">
                    {fmtMoney(r.balance, { currency: false })}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell className="pl-4 font-medium text-gray-700">รวมสินทรัพย์</TableCell>
                <TableCell align="right" tabular className="font-medium text-gray-900">
                  {fmtMoney(balanceSheet.totalAssets, { currency: false })}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-semibold text-gray-900">หนี้สิน</TableCell>
                <TableCell />
              </TableRow>
              {balanceSheet.liabilityRows.map((r) => (
                <TableRow key={r.account_id}>
                  <TableCell className="pl-8 text-gray-600">
                    {r.code} · {r.name}
                  </TableCell>
                  <TableCell align="right" tabular className="text-gray-900">
                    {fmtMoney(r.balance, { currency: false })}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell className="font-semibold text-gray-900">ส่วนของเจ้าของ</TableCell>
                <TableCell />
              </TableRow>
              {balanceSheet.equityRows.map((r) => (
                <TableRow key={r.account_id}>
                  <TableCell className="pl-8 text-gray-600">
                    {r.code} · {r.name}
                  </TableCell>
                  <TableCell align="right" tabular className="text-gray-900">
                    {fmtMoney(r.balance, { currency: false })}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell className="pl-8 text-gray-600">กำไร(ขาดทุน)สะสมงวดนี้</TableCell>
                <TableCell
                  align="right"
                  tabular
                  className={balanceSheet.netProfit >= 0 ? "text-green-600" : "text-red-600"}
                >
                  {balanceSheet.netProfit >= 0
                    ? fmtMoney(balanceSheet.netProfit, { currency: false })
                    : `−${fmtMoney(Math.abs(balanceSheet.netProfit), { currency: false })}`}
                </TableCell>
              </TableRow>
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>รวมหนี้สิน + ส่วนของเจ้าของ</TableCell>
                <TableCell align="right" tabular>
                  {fmtMoney(balanceSheet.totalLiabEquity, { currency: false })}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}

      {/* แยกประเภท (ledger) */}
      {tab === "ledger" && (
        <div className="space-y-3">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <CustomSelect
              value={ledgerAcc}
              onChange={setLedgerAcc}
              options={accountsWithMovement}
              className="w-full sm:w-96"
            />
          </div>
          {!ledgerAcc ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white py-16 text-center shadow-sm">
              <div className="mb-4 rounded-full bg-gray-100 p-4">
                <ListTree className="h-8 w-8 text-gray-400" />
              </div>
              <Text className="text-sm font-medium text-gray-900">
                เลือกบัญชีเพื่อดูบัญชีแยกประเภท
              </Text>
              <Text className="mt-1 text-sm text-gray-500">
                แสดงเดบิต-เครดิตและยอดยกมาของบัญชีที่เลือก
              </Text>
            </div>
          ) : (
            <div>
              <div className="mb-2.5 px-1 text-sm font-semibold text-gray-900">
                {ledger?.account?.code} · {ledger?.account?.name}
              </div>
              <Table className="shadow-sm">
                <TableHeader>
                  <TableRow>
                    <TableHead>วันที่</TableHead>
                    <TableHead>เลขที่</TableHead>
                    <TableHead>คำอธิบาย</TableHead>
                    <TableHead align="right">เดบิต</TableHead>
                    <TableHead align="right">เครดิต</TableHead>
                    <TableHead align="right">คงเหลือ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!ledger || ledger.rows.length === 0 ? (
                    <TableEmpty colSpan={6}>ไม่มีรายการเคลื่อนไหวในงวดนี้</TableEmpty>
                  ) : (
                    ledger.rows.map((r, i) => (
                      <TableRow key={`${r.entry_number}-${i}`}>
                        <TableCell className="whitespace-nowrap text-gray-500">
                          {fmtDateTH(r.date)}
                        </TableCell>
                        <TableCell className="font-medium text-gray-900">
                          {r.entry_number}
                        </TableCell>
                        <TableCell className="max-w-[240px] truncate text-gray-600">
                          {r.description}
                        </TableCell>
                        <TableCell align="right" tabular className="text-gray-900">
                          {r.debit ? fmtMoney(r.debit, { currency: false }) : "—"}
                        </TableCell>
                        <TableCell align="right" tabular className="text-gray-900">
                          {r.credit ? fmtMoney(r.credit, { currency: false }) : "—"}
                        </TableCell>
                        <TableCell align="right" tabular className="font-medium text-gray-900">
                          {fmtMoney(r.running, { currency: false })}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
                {ledger && ledger.rows.length > 0 && (
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={3}>รวม / ยอดคงเหลือ</TableCell>
                      <TableCell align="right" tabular>
                        {fmtMoney(ledger.totalDebit, { currency: false })}
                      </TableCell>
                      <TableCell align="right" tabular>
                        {fmtMoney(ledger.totalCredit, { currency: false })}
                      </TableCell>
                      <TableCell align="right" tabular>
                        {fmtMoney(ledger.closing, { currency: false })}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            </div>
          )}
        </div>
      )}
    </AccountingShell>
  );
}
