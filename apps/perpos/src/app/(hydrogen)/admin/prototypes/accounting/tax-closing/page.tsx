"use client";

// B4 tax-closing/page.tsx — ภาษี & ปิดงวด (หลังบ้าน, accountant เครื่องมือเต็ม)
// Tab(overflow-x-auto): PP30(ถ้า VAT) / ภ.ง.ด. (pnd1/3/53) / ปิดงวด
// + TaxFilingDialog (recompute/mark-filed) + closePeriod/reopenPeriod
// เห็น enum/เลขดิบได้ (มืออาชีพ)
//
// gate §4: tax_closing — owner(V) · accountant(A ปิดงวด) · staff(–) · viewer(V)

import { useMemo, useState } from "react";
import { Landmark, Plus, Receipt, CalendarCheck, Lock, Unlock } from "lucide-react";
import cn from "@core/utils/class-names";
import { Button } from "@/components/ui/button";
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
import { toast } from "@/lib/toast";
import {
  AccountingShell,
  useAccountingRole,
  useAccountingData,
  fmtMoney,
  fmtDateTH,
  fmtMonthYearTH,
  NoAccess,
  TaxFilingDialog,
} from "../_components";
import {
  TaxStatusBadge,
  PeriodStatusBadge,
  TAX_KIND_LABEL,
  TAX_KIND_PLAIN,
} from "../_components/backstage-badges";
import type { AccTaxFiling } from "../_fixtures/types";

type TaxTab = "pp30" | "pnd" | "periods";

export default function TaxClosingPage() {
  const { can } = useAccountingRole();
  const canView = can("view", "tax_closing");
  const canWrite = can("write", "tax_closing");
  const canClose = can("approve", "tax_closing");

  const { taxFilings, periods, orgSettings, closePeriod, reopenPeriod } = useAccountingData();
  const vatRegistered = orgSettings.is_vat_registered;

  const [tab, setTab] = useState<TaxTab>(vatRegistered ? "pp30" : "pnd");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AccTaxFiling | null>(null);

  const TABS: { key: TaxTab; label: string; icon: React.ReactNode; show: boolean }[] = [
    {
      key: "pp30",
      label: "ภ.พ.30 (VAT)",
      icon: <Receipt className="h-4 w-4" />,
      show: vatRegistered,
    },
    {
      key: "pnd",
      label: "ภ.ง.ด. (หัก ณ ที่จ่าย)",
      icon: <Receipt className="h-4 w-4" />,
      show: true,
    },
    {
      key: "periods",
      label: "ปิดงวดบัญชี",
      icon: <CalendarCheck className="h-4 w-4" />,
      show: true,
    },
  ];

  const pp30Filings = useMemo(
    () =>
      taxFilings
        .filter((t) => t.tax_kind === "pp30")
        .sort((a, b) => b.due_date.localeCompare(a.due_date)),
    [taxFilings],
  );
  const pndFilings = useMemo(
    () =>
      taxFilings
        .filter((t) => t.tax_kind !== "pp30")
        .sort((a, b) => b.due_date.localeCompare(a.due_date)),
    [taxFilings],
  );
  const sortedPeriods = useMemo(
    () => [...periods].sort((a, b) => b.year - a.year || b.month - a.month),
    [periods],
  );

  function openAdd() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(f: AccTaxFiling) {
    setEditing(f);
    setDialogOpen(true);
  }

  function handleClose(id: string, label: string) {
    closePeriod(id);
    toast.success(`ปิดงวด ${label} แล้ว — ห้าม post journal เข้างวดนี้`);
  }
  function handleReopen(id: string, label: string) {
    reopenPeriod(id);
    toast.success(`เปิดงวด ${label} อีกครั้ง`);
  }

  if (!canView)
    return (
      <NoAccess title="ภาษี & ปิดงวด" icon={<Landmark className="h-6 w-6" />}>
        หน้าหลังบ้านนี้สำหรับนักบัญชี — ลองสลับเป็นเจ้าของ/นักบัญชี/ผู้ดูข้อมูล
      </NoAccess>
    );

  const tabs = (
    <div className="flex gap-1.5 overflow-x-auto rounded-xl border border-gray-200 bg-white p-1.5 shadow-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {TABS.filter((t) => t.show).map((t) => (
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

  const filingRows = (rows: AccTaxFiling[], emptyText: string) => (
    <Table className="shadow-sm">
      <TableHeader>
        <TableRow>
          <TableHead>แบบภาษี</TableHead>
          <TableHead>งวด</TableHead>
          <TableHead align="center">สถานะ</TableHead>
          <TableHead align="right">ยอดต้องชำระ</TableHead>
          <TableHead>กำหนดยื่น</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableEmpty colSpan={5}>
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <div className="rounded-full bg-gray-100 p-4">
                <Receipt className="h-8 w-8 text-gray-400" />
              </div>
              <div>
                <div className="text-sm font-medium text-gray-900">{emptyText}</div>
                <div className="mt-1 text-sm text-gray-500">
                  เพิ่มแบบภาษีใหม่ หรือบันทึกเงินเดือนเพื่อสร้าง ภ.ง.ด.1 อัตโนมัติ
                </div>
              </div>
              {canWrite && (
                <Button size="sm" onClick={openAdd}>
                  <Plus className="mr-1.5 h-4 w-4" /> เพิ่มแบบภาษี
                </Button>
              )}
            </div>
          </TableEmpty>
        ) : (
          rows.map((f) => (
            <TableRow key={f.id} clickable onClick={() => openEdit(f)}>
              <TableCell>
                <div className="font-medium text-gray-900">{TAX_KIND_LABEL[f.tax_kind]}</div>
                <div className="text-xs text-gray-400">{TAX_KIND_PLAIN[f.tax_kind]}</div>
              </TableCell>
              <TableCell className="whitespace-nowrap text-gray-600">
                {fmtMonthYearTH(f.period_year, f.period_month)}
              </TableCell>
              <TableCell align="center">
                <TaxStatusBadge status={f.status} />
              </TableCell>
              <TableCell align="right" tabular className="font-medium text-gray-900">
                {fmtMoney(f.net_payable ?? 0)}
              </TableCell>
              <TableCell className="whitespace-nowrap text-gray-500">
                {fmtDateTH(f.due_date)}
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );

  return (
    <AccountingShell
      title="ภาษี & ปิดงวด"
      description="ยื่นภาษี + ปิดบัญชีครบวงจร — เครื่องมือนักบัญชี (เห็นรหัสแบบ/ตัวเลขดิบ)"
      icon={<Landmark className="h-6 w-6" />}
      actions={
        canWrite && tab !== "periods" ? (
          <Button onClick={openAdd}>
            <Plus className="mr-1.5 h-4 w-4" /> เพิ่มแบบภาษี
          </Button>
        ) : undefined
      }
      tabs={tabs}
    >
      {tab === "pp30" && vatRegistered && filingRows(pp30Filings, "ยังไม่มีแบบ ภ.พ.30")}

      {tab === "pnd" && filingRows(pndFilings, "ยังไม่มีแบบ ภ.ง.ด.")}

      {tab === "periods" && (
        <div>
          <div className="mb-2.5 px-1 text-sm font-semibold text-gray-900">งวดบัญชี</div>
          <Table className="shadow-sm">
            <TableHeader>
              <TableRow>
                <TableHead>งวด</TableHead>
                <TableHead align="center">สถานะ</TableHead>
                <TableHead>ปิดเมื่อ</TableHead>
                <TableHead align="right">การจัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedPeriods.length === 0 ? (
                <TableEmpty colSpan={4}>ยังไม่มีงวดบัญชี</TableEmpty>
              ) : (
                sortedPeriods.map((p) => {
                  const label = fmtMonthYearTH(p.year, p.month);
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium text-gray-900">{label}</TableCell>
                      <TableCell align="center">
                        <PeriodStatusBadge status={p.status} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-gray-500">
                        {p.closed_at ? fmtDateTH(p.closed_at.slice(0, 10)) : "—"}
                      </TableCell>
                      <TableCell align="right">
                        {canClose ? (
                          p.status === "open" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleClose(p.id, label)}
                            >
                              <Lock className="mr-1.5 h-3.5 w-3.5" /> ปิดงวด
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleReopen(p.id, label)}
                            >
                              <Unlock className="mr-1.5 h-3.5 w-3.5" /> เปิดงวด
                            </Button>
                          )
                        ) : (
                          <Text className="text-xs text-gray-400">เฉพาะนักบัญชี</Text>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
          <Text className="mt-2 px-1 text-xs text-gray-400">
            งวดที่ปิดแล้วจะ post รายการสมุดรายวันใหม่เข้าไปไม่ได้ — เปิดงวดอีกครั้งได้หากต้องแก้
          </Text>
        </div>
      )}

      <TaxFilingDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        filing={editing}
        vatRegistered={vatRegistered}
      />
    </AccountingShell>
  );
}
