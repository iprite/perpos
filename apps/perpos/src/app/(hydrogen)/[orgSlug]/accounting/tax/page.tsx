"use client";

// tax/page.tsx (production) — A5 ภาษีของฉัน (VIEW-ONLY mirror ของหลังบ้าน)
//   owner ไม่เห็น enum ดิบ — ใช้ TAX_GLOSSARY · แต่ละ filing = การ์ด (หัวข้อแปลแล้ว + subtitle
//   + "ยื่นภายใน X — อีก N วัน" + ยอดเด่นใหญ่ + ปุ่ม "ดูรายละเอียด")
//   ต่างจาก prototype: ตัด AI summary (B0 เลื่อนเฟส 2) · VAT = ป้ายสถานะอ่านอย่างเดียว
//     (เปลี่ยนที่หน้าตั้งค่า — owner) ไม่ใช่ปุ่ม toggle ที่ mutate · อ่าน taxFilings/orgSettings จริง
// ไม่มี action จัดการ (recompute/mark-filed อยู่ที่หลังบ้าน — accountant)
// gate §4: tax_my — ทุก role เห็น (view-only)

import { useMemo, useState, type ReactNode } from "react";
import { Receipt, CheckCircle2, Info, AlertTriangle, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Text } from "@/components/ui/typography";
import {
  Dialog,
  DialogContent,
  DialogBody,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AccountingShell,
  useAccountingRole,
  useAccountingData,
  fmtMoney,
  fmtMonthYearTH,
  NoAccess,
} from "../_components";
import type { AccTaxFiling, AccTaxKind, AccTaxStatus } from "@/lib/accounting/types";

const STATUS_META: Record<
  AccTaxStatus,
  { label: string; tone: "neutral" | "warning" | "success" }
> = {
  draft: { label: "ฉบับร่าง", tone: "neutral" },
  ready: { label: "พร้อมยื่น", tone: "warning" },
  filed: { label: "ยื่นแล้ว", tone: "success" },
};

/** Tax glossary (§5 U2) — enum → ป้ายไทยที่ owner เข้าใจ */
const TAX_GLOSSARY: Record<AccTaxKind, string> = {
  pp30: "ภาษีมูลค่าเพิ่ม (VAT)",
  pnd1: "ภาษีเงินเดือนพนักงาน",
  pnd3: "ภาษีหัก ค่าจ้างบุคคล",
  pnd53: "ภาษีหัก ค่าจ้างบริษัท",
};

// subtitle ภาษาคนต่อชนิดภาษี
const TAX_SUBTITLE: Record<AccTaxKind, string> = {
  pp30: "ภาษีจากยอดขาย − ภาษีจากยอดซื้อ (ยื่นให้สรรพากร)",
  pnd1: "ภาษีหัก ณ ที่จ่าย จากเงินเดือนพนักงาน",
  pnd3: "ภาษีหัก ณ ที่จ่าย จากค่าจ้างบุคคลธรรมดา/ฟรีแลนซ์",
  pnd53: "ภาษีหัก ณ ที่จ่าย จากค่าจ้างนิติบุคคล",
};

const TH_MONTHS_SHORT = [
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

/** วันที่ครบกำหนด (พ.ศ.) + จำนวนวันที่เหลือ (อ้างวันนี้) */
function dueDateLabel(dueDateISO: string): { label: string; daysLeft: number } {
  const due = new Date(dueDateISO);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffMs = due.getTime() - today.getTime();
  const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  const label = `${due.getDate()} ${TH_MONTHS_SHORT[due.getMonth()]} ${due.getFullYear() + 543}`;
  return { label, daysLeft };
}

export default function TaxMyPage() {
  const { can } = useAccountingRole();
  const canView = can("view", "tax_my");

  const { taxFilings, orgSettings, loading } = useAccountingData();
  const vatOn = orgSettings?.is_vat_registered ?? false;

  const [detail, setDetail] = useState<AccTaxFiling | null>(null);

  // การ์ดที่ owner เห็น: PND เสมอ · PP30 เฉพาะจด VAT · เรียงตามเร่งด่วน (ยังไม่ยื่นก่อน)
  const cards = useMemo(() => {
    return taxFilings
      .filter((t) => (t.tax_kind === "pp30" ? vatOn : true))
      .map((t) => ({ ...t, due: dueDateLabel(t.due_date) }))
      .sort((a, b) => {
        const af = a.status === "filed" ? 1 : 0;
        const bf = b.status === "filed" ? 1 : 0;
        if (af !== bf) return af - bf;
        return a.due.daysLeft - b.due.daysLeft;
      });
  }, [taxFilings, vatOn]);

  if (!canView)
    return (
      <NoAccess title="ภาษีของฉัน" icon={<Receipt className="h-6 w-6" />}>
        บทบาทนี้ไม่สามารถดูข้อมูลภาษีได้
      </NoAccess>
    );

  return (
    <AccountingShell
      title="ภาษีของฉัน"
      description="ดูว่าต้องส่งภาษีอะไร เมื่อไหร่ เท่าไหร่ — ภาษาคน ไม่ต้องเข้าใจแบบฟอร์ม"
      icon={<Receipt className="h-6 w-6" />}
      actions={
        vatOn ? (
          <StatusBadge tone="success">ธุรกิจจด VAT แล้ว</StatusBadge>
        ) : (
          <StatusBadge tone="neutral">ยังไม่จด VAT</StatusBadge>
        )
      }
    >
      {/* การ์ดภาษี (view-only) */}
      {loading.taxFilings ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="h-44 animate-pulse rounded-xl border border-gray-200 bg-gray-50 shadow-sm"
            />
          ))}
        </div>
      ) : cards.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white py-16 text-center shadow-sm">
          <div className="mb-4 rounded-full bg-gray-100 p-4">
            <CheckCircle2 className="h-8 w-8 text-gray-400" />
          </div>
          <div className="text-sm font-medium text-gray-900">ยังไม่มีภาษีที่ต้องส่ง</div>
          <Text className="mt-1 text-sm text-gray-500">
            เมื่อมีเงินเดือน/ยอดขายที่ต้องยื่นภาษี ระบบจะแสดงให้ที่นี่
          </Text>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {cards.map((t) => {
            const m = STATUS_META[t.status];
            const urgent = t.status !== "filed" && t.due.daysLeft <= 7;
            const amount = t.wht_total ?? t.net_payable ?? 0;
            return (
              <div
                key={t.id}
                className="flex flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-base font-semibold text-gray-900">
                      {TAX_GLOSSARY[t.tax_kind]}
                    </div>
                    <Text className="mt-0.5 text-xs text-gray-500">{TAX_SUBTITLE[t.tax_kind]}</Text>
                  </div>
                  <StatusBadge tone={m.tone}>{m.label}</StatusBadge>
                </div>

                <div className="mt-3 text-xs text-gray-500">
                  งวด {fmtMonthYearTH(t.period_year, t.period_month)}
                </div>

                <div className="mt-1 flex items-baseline gap-2">
                  <span className="font-mono text-2xl font-semibold tabular-nums tracking-tight text-gray-900">
                    {fmtMoney(amount)}
                  </span>
                </div>

                <div
                  className={
                    urgent
                      ? "mt-3 flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700"
                      : t.status === "filed"
                        ? "mt-3 flex items-center gap-1.5 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700"
                        : "mt-3 flex items-center gap-1.5 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600"
                  }
                >
                  {t.status === "filed" ? (
                    <>
                      <CheckCircle2 className="h-4 w-4" /> ยื่นเรียบร้อยแล้ว
                    </>
                  ) : (
                    <>
                      {urgent && <AlertTriangle className="h-4 w-4" />}
                      ยื่นภายใน {t.due.label}
                      {t.due.daysLeft >= 0 ? ` — อีก ${t.due.daysLeft} วัน` : ` — เลยกำหนดแล้ว`}
                    </>
                  )}
                </div>

                <Button
                  variant="outline"
                  className="mt-4 justify-between"
                  onClick={() => setDetail(t)}
                >
                  ดูรายละเอียด
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {!loading.orgSettings && !vatOn && (
        <div className="flex items-start gap-2 rounded-xl border border-gray-200 bg-gray-50 p-4">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
          <Text className="text-xs text-gray-500">
            ธุรกิจของคุณยังไม่ได้จด VAT จึงไม่มีภาษีมูลค่าเพิ่ม (ภ.พ.30) — ถ้ายอดขายเกิน 1.8
            ล้านบาท/ปี ควรจด VAT (เปิดสถานะจด VAT ได้ที่หน้า &quot;ตั้งค่า&quot;)
          </Text>
        </div>
      )}

      {/* detail dialog — view-only */}
      <Dialog open={detail !== null} onOpenChange={(v) => !v && setDetail(null)}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>{detail ? TAX_GLOSSARY[detail.tax_kind] : "รายละเอียดภาษี"}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            {detail && (
              <div className="space-y-3">
                <DetailRow label="ประเภทภาษี" value={TAX_GLOSSARY[detail.tax_kind]} />
                <DetailRow
                  label="งวด"
                  value={fmtMonthYearTH(detail.period_year, detail.period_month)}
                />
                <DetailRow
                  label="สถานะ"
                  value={
                    <StatusBadge tone={STATUS_META[detail.status].tone}>
                      {STATUS_META[detail.status].label}
                    </StatusBadge>
                  }
                />
                <DetailRow label="กำหนดยื่น" value={dueDateLabel(detail.due_date).label} />
                <DetailRow
                  label="ยอดที่ต้องชำระ"
                  value={
                    <span className="font-mono font-semibold tabular-nums text-gray-900">
                      {fmtMoney(detail.wht_total ?? detail.net_payable ?? 0)}
                    </span>
                  }
                />
                <Text className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
                  หน้านี้เป็นมุมมองสำหรับเจ้าของธุรกิจ (ดูอย่างเดียว) — การยื่น/แก้ไขแบบภาษี
                  ทำโดยนักบัญชีที่หน้า &quot;ภาษี &amp; ปิดงวด&quot;
                </Text>
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetail(null)}>
              ปิด
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AccountingShell>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm text-gray-900">{value}</span>
    </div>
  );
}
