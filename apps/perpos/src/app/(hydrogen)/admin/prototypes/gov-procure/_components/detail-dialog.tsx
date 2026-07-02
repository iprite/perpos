"use client";

// detail-dialog.tsx — รายละเอียดงาน (shared, 4 tab — spec §5 #4 / P1-a)
// ตัวเลขสรุปเด่นบนสุด (net_receivable / gross_profit / net_profit_89) → 4 tab:
//   พื้นฐาน (A) · การเงิน (B+C+D sub-group ยอดขาย/ต้นทุน/กำไร, finance-lock lens)
//   ภายใน89+คอม (D-E + commission 5 field) · timeline+สถานะ (milestone checklist 4 หมุด + duration/aging)
// AI-2 Anomaly (spec §5b): order ใน detectAnomalyOrderIds → banner + ปุ่ม "อธิบายด้วย AI" → loading → เผยผล
// milestone checklist: 4 หมุด ติ๊ก+วันที่ · แนบสลิป/รูปเช็ค = mock (ชื่อไฟล์+สถานะ Done)
// ปุ่ม: เลื่อนสถานะ (stage-move-dialog) · แก้ (order-dialog) · ลบ (canWrite, destructive mr-auto, ยืนยัน)

import { useEffect, useMemo, useState } from "react";
import {
  Info,
  Wallet,
  Layers,
  GitBranch,
  Pencil,
  Trash2,
  ArrowRightLeft,
  Lock,
  Sparkles,
  Loader2,
  AlertTriangle,
  ShieldCheck,
  CheckCircle2,
  Circle,
  Paperclip,
  FileCheck2,
} from "lucide-react";
import cn from "@core/utils/class-names";
import { Button } from "@/components/ui/button";
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
import { toast } from "@/lib/toast";
import { useData } from "./data-context";
import { useRole } from "./role-context";
import { fmtMoney, fmtDateTH, TODAY_DATE } from "./format";
import { StageBadge, OverdueBadge, AgingBadge, CompanyBadge } from "./badges";
import {
  deriveDurationDays,
  deriveAgingDays,
  isOverdue,
  type GovProcureOrder,
} from "../_fixtures/types";
import { getAnomaly, detectAnomalyOrderIds } from "../_fixtures/ai-mocks";

type Tab = "basic" | "finance" | "internal" | "timeline";

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: "basic", label: "พื้นฐาน", icon: <Info className="h-4 w-4" /> },
  { key: "finance", label: "การเงิน", icon: <Wallet className="h-4 w-4" /> },
  { key: "internal", label: "ภายใน 89 + คอม", icon: <Layers className="h-4 w-4" /> },
  { key: "timeline", label: "ไทม์ไลน์ + สถานะ", icon: <GitBranch className="h-4 w-4" /> },
];

export function DetailDialog({
  order,
  open,
  onOpenChange,
  onEdit,
  onMoveStage,
}: {
  order: GovProcureOrder | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** เปิด order-dialog (แก้) */
  onEdit: (o: GovProcureOrder) => void;
  /** เปิด stage-move-dialog */
  onMoveStage: (o: GovProcureOrder) => void;
}) {
  const { orders, settings, deleteOrder } = useData();
  const { canWrite, canEditFinance } = useRole();

  const [tab, setTab] = useState<Tab>("basic");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (open) {
      setTab("basic");
      setConfirmDelete(false);
    }
  }, [open, order?.id]);

  // live order จาก store (เผื่อ mutation จากที่อื่นระหว่างเปิด)
  const live = useMemo(
    () => (order ? orders.find((o) => o.id === order.id) ?? order : null),
    [orders, order],
  );

  const anomalyIds = useMemo(() => detectAnomalyOrderIds(orders), [orders]);

  if (!live) return null;

  const isAnomaly = anomalyIds.includes(live.id);
  const overdue = isOverdue(live, settings.sla_threshold, TODAY_DATE);
  const aging = deriveAgingDays(live, TODAY_DATE);

  function handleDelete() {
    if (!live) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    deleteOrder(live.id);
    toast.success(`ลบงาน ${live.qt_reference ?? live.product_description ?? ""} แล้ว`);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="2xl">
        <DialogHeader>
          <DialogTitle>
            <span className="flex flex-wrap items-center gap-2">
              {live.qt_reference ?? `งาน #${live.seq_no ?? "—"}`}
              <StageBadge stage={live.stage} />
              {overdue && aging != null && <OverdueBadge days={aging} />}
              {!overdue && aging != null && <AgingBadge days={aging} />}
            </span>
          </DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            {/* ── ตัวเลขสรุปเด่นบนสุด (spec §5 #4) ── */}
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <SummaryFigure
                label="ยอดสุทธิรับจากภาครัฐ"
                value={fmtMoney(live.net_receivable)}
                tone="info"
              />
              <SummaryFigure
                label="กำไรขั้นต้น"
                value={fmtMoney(live.gross_profit)}
                tone="neutral"
              />
              <SummaryFigure
                label="กำไรสุทธิ 89"
                value={fmtMoney(live.net_profit_89)}
                tone={
                  live.net_profit_89 != null && live.net_profit_89 <= 0 ? "danger" : "positive"
                }
              />
            </div>

            {/* ── AI-2 Anomaly banner (ถ้า flagged) ── */}
            {isAnomaly && <AnomalyBox order={live} />}

            {/* ── tab bar (row เดียว, overflow-x, ไม่ wrap — §4) ── */}
            <div className="flex gap-1.5 overflow-x-auto rounded-xl border border-gray-200 bg-white p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {TABS.map((t) => {
                const active = tab === t.key;
                return (
                  <Button
                    key={t.key}
                    size="sm"
                    variant={active ? "secondary" : "ghost"}
                    className={cn(
                      "shrink-0 whitespace-nowrap",
                      active && "bg-gray-100 text-gray-900",
                    )}
                    onClick={() => setTab(t.key)}
                  >
                    <span className={cn("mr-1.5", active ? "text-primary" : "text-gray-400")}>
                      {t.icon}
                    </span>
                    {t.label}
                  </Button>
                );
              })}
            </div>

            {/* ── tab content ── */}
            {tab === "basic" && <BasicTab order={live} />}
            {tab === "finance" && (
              <FinanceTab order={live} canEditFinance={canEditFinance} />
            )}
            {tab === "internal" && (
              <InternalTab order={live} canEditFinance={canEditFinance} />
            )}
            {tab === "timeline" && <TimelineTab order={live} />}
          </div>
        </DialogBody>
        <DialogFooter>
          {canWrite && (
            <Button
              variant="destructive"
              className="mr-auto"
              onClick={handleDelete}
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              {confirmDelete ? "ยืนยันลบ?" : "ลบ"}
            </Button>
          )}
          {canWrite && (
            <>
              {/* งานปิดแล้ว = stage สุดท้าย → ซ่อนปุ่มเลื่อนสถานะ (consistent กับ pipeline card เมื่อ isLast) */}
              {live.stage !== "closed" && (
                <Button variant="outline" onClick={() => onMoveStage(live)}>
                  <ArrowRightLeft className="mr-1.5 h-4 w-4" /> เลื่อนสถานะ
                </Button>
              )}
              <Button variant="outline" onClick={() => onEdit(live)}>
                <Pencil className="mr-1.5 h-4 w-4" /> แก้ไข
              </Button>
            </>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            ปิด
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ════════════════════════════════════════════════════════════════════
// ตัวเลขสรุปเด่น
// ════════════════════════════════════════════════════════════════════
function SummaryFigure({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "info" | "neutral" | "positive" | "danger";
}) {
  const valueColor =
    tone === "positive"
      ? "text-green-700"
      : tone === "danger"
        ? "text-red-700"
        : tone === "info"
          ? "text-blue-700"
          : "text-gray-900";
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2.5">
      <Text className="text-xs text-gray-500">{label}</Text>
      <div className={cn("mt-0.5 tabular-nums text-lg font-semibold", valueColor)}>{value}</div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// AI-2 Anomaly box
// ════════════════════════════════════════════════════════════════════
function AnomalyBox({ order }: { order: GovProcureOrder }) {
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  // curated (rich) ถ้ามี ไม่งั้น rule-derived จาก field จริง → ไม่ null เมื่อ flagged
  const anomaly = getAnomaly(order);

  useEffect(() => {
    if (state !== "loading") return;
    const t = window.setTimeout(() => setState("done"), 1100);
    return () => window.clearTimeout(t);
  }, [state]);

  const sevTone =
    anomaly.severity === "high" ? "danger" : anomaly.severity === "medium" ? "warning" : "info";
  const sevLabel =
    anomaly.severity === "high" ? "สูง" : anomaly.severity === "medium" ? "ปานกลาง" : "ต่ำ";
  const confPct = Math.round(anomaly.confidence * 100);

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div>
            <Text className="text-sm font-semibold text-amber-900">
              งานนี้มีตัวเลขกำไรผิดปกติ — ควรตรวจสอบ
            </Text>
            <Text className="text-xs text-amber-700">
              ระบบตรวจพบจากกฎ (margin ต่ำ/ต้นทุนสูงเกิน) — ให้ AI อธิบายเหตุผลได้
            </Text>
          </div>
        </div>
        {state === "idle" && (
          <Button size="sm" variant="outline" onClick={() => setState("loading")}>
            <Sparkles className="mr-1.5 h-4 w-4" /> อธิบายด้วย AI
          </Button>
        )}
      </div>

      {state === "loading" && (
        <div className="mt-2.5 flex items-center gap-2 text-sm text-amber-800">
          <Loader2 className="h-4 w-4 animate-spin" /> กำลังวิเคราะห์และเรียบเรียง…
        </div>
      )}

      {state === "done" && (
        <div className="mt-2.5 space-y-2 rounded-lg border border-amber-200 bg-white p-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={sevTone}>ความรุนแรง: {sevLabel}</StatusBadge>
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">
              <ShieldCheck className="h-3 w-3" /> ความเชื่อมั่น {confPct}%
            </span>
          </div>
          <Text className="text-sm leading-relaxed text-gray-700">{anomaly.reason}</Text>
          <ul className="space-y-1">
            {anomaly.checks.map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-gray-600">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-500" />
                {c}
              </li>
            ))}
          </ul>
          <Text className="text-[11px] text-gray-400">
            * AI เรียบเรียงจากตัวเลขจริง — โปรดตรวจสอบใบสั่งซื้อ/ราคาทุนก่อนตัดสินใจ
          </Text>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// Tab: พื้นฐาน (group A)
// ════════════════════════════════════════════════════════════════════
function BasicTab({ order }: { order: GovProcureOrder }) {
  const empty =
    !order.department && !order.company && !order.qt_reference && !order.product_description;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="หน่วยงานภาครัฐ" value={order.customer_name} />
      <Field label="กอง/หน่วยงาน" value={order.department ?? "—"} />
      <div>
        <Text className="text-xs text-gray-400">บริษัทตัวกลาง</Text>
        <div className="mt-0.5">
          <CompanyBadge company={order.company} />
        </div>
      </div>
      <Field label="เลขที่ QT" value={order.qt_reference ?? "—"} />
      <Field label="รายการครุภัณฑ์/พัสดุ" value={order.product_description ?? "—"} />
      <Field label="วันที่เริ่มงาน / วัน QT" value={fmtDateTH(order.start_date)} />
      {order.notes && <Field label="หมายเหตุ" value={order.notes} />}
      {empty && (
        <Text className="text-xs text-gray-400 sm:col-span-2">
          ยังไม่มีข้อมูลเพิ่มเติม — กด “แก้ไข” เพื่อกรอก
        </Text>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// Tab: การเงิน (group B/C — sub-group ยอดขาย/ต้นทุน/กำไร, finance-lock lens)
// ════════════════════════════════════════════════════════════════════
function FinanceTab({
  order,
  canEditFinance,
}: {
  order: GovProcureOrder;
  canEditFinance: boolean;
}) {
  return (
    <div className="space-y-4">
      {!canEditFinance && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <Text className="text-xs text-amber-800">
            ข้อมูลการเงิน — ดูอย่างเดียว (สิทธิ์ผู้จัดการ/เจ้าของ)
          </Text>
        </div>
      )}
      <SubGroup title="ยอดขาย">
        <MoneyRow label="ยอดเสนอราคา (รวม VAT)" value={order.price_incl_vat} />
        <MoneyRow label="ยอดก่อน VAT" value={order.price_excl_vat} />
        <MoneyRow label="หัก ณ ที่จ่าย 1%" value={order.withholding_tax} negativeHint />
        <MoneyRow label="ยอดสุทธิรับจากภาครัฐ" value={order.net_receivable} strong />
      </SubGroup>
      <SubGroup title="ต้นทุน">
        <MoneyRow label="ราคาทุน (ต้นทุนซื้อของ)" value={order.cost_price} />
        <MoneyRow label="เงินประกันสัญญา" value={order.security_deposit} />
      </SubGroup>
      <SubGroup title="กำไร">
        <MoneyRow label="กำไรขั้นต้น (เสนอ − ทุน)" value={order.gross_profit} strong />
      </SubGroup>
      <SubGroup title="ทุนหมุนเวียน (เงินโอนซื้อของ)">
        <DateRow label="วันโอนเงินซื้อของ" value={order.transfer_date} />
        <DateRow label="โอนรอบที่ 1" value={order.transfer_round1} />
        <DateRow label="โอนรอบที่ 2" value={order.transfer_round2} />
      </SubGroup>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// Tab: ภายใน 89 + คอมมิชชั่น (group D-E)
// ════════════════════════════════════════════════════════════════════
function InternalTab({
  order,
  canEditFinance,
}: {
  order: GovProcureOrder;
  canEditFinance: boolean;
}) {
  return (
    <div className="space-y-4">
      {!canEditFinance && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <Text className="text-xs text-amber-800">
            ข้อมูลการเงิน — ดูอย่างเดียว (สิทธิ์ผู้จัดการ/เจ้าของ)
          </Text>
        </div>
      )}
      <SubGroup title="ทอน / petty / ขนส่ง / ดำเนินการ">
        <MoneyRow label="ทอนลูกค้า" value={order.customer_change} slip={order.customer_change_slip} />
        <MoneyRow label="petty cash" value={order.petty_cash} slip={order.petty_cash_slip} />
        <MoneyRow label="ค่าขนส่ง (ซื้อ)" value={order.transport_buy} />
        <MoneyRow label="ค่าขนส่ง (ขาย)" value={order.transport_sell} />
        <MoneyRow label="ค่าขนส่ง (อื่นๆ)" value={order.transport_other} />
        <MoneyRow label="ค่าดำเนินการ 89" value={order.operate_89} />
        <MoneyRow label="ทุนรวม 89" value={order.total_cost_89} strong />
        <MoneyRow label="กำไรสุทธิ 89" value={order.net_profit_89} strong />
        <Row
          label="% กำไร"
          value={order.profit_pct != null ? `${order.profit_pct.toFixed(2)}%` : "—"}
        />
      </SubGroup>
      <SubGroup title="คอมมิชชั่นทีมขาย">
        <MoneyRow label="กำไรฐานคำนวณคอม" value={order.commission_base_profit} />
        <MoneyRow label="คอมมิชชั่นทีม" value={order.commission_amount} />
        <MoneyRow label="หัก ณ ที่จ่าย 3% (คอม)" value={order.commission_wht} negativeHint />
        <MoneyRow
          label="ยอดโอนคอมคงเหลือ"
          value={order.commission_net_payable}
          slip={order.commission_slip}
          strong
        />
      </SubGroup>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// Tab: ไทม์ไลน์ + สถานะ (milestone checklist 4 หมุด + duration/aging + attachment mock)
// ════════════════════════════════════════════════════════════════════
const MILESTONES: {
  field: keyof GovProcureOrder;
  label: string;
}[] = [
  { field: "contract_date", label: "เซ็นสัญญา" },
  { field: "payment_order_date", label: "สั่งซื้อ/ชำระซัพพลายเออร์" },
  { field: "delivery_date", label: "ส่งมอบสินค้า" },
  { field: "receipt_date", label: "รับเช็ค/รับเงิน" },
];

function TimelineTab({ order }: { order: GovProcureOrder }) {
  const duration = deriveDurationDays(order);
  const aging = deriveAgingDays(order, TODAY_DATE);

  return (
    <div className="space-y-4">
      {/* สถานะปัจจุบัน + duration/aging */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2.5">
          <Text className="text-xs text-gray-500">สถานะปัจจุบัน</Text>
          <div className="mt-1">
            <StageBadge stage={order.stage} />
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2.5">
          <Text className="text-xs text-gray-500">ระยะเวลา สัญญา → รับเงิน</Text>
          <div className="mt-0.5 text-sm font-semibold text-gray-900">
            {duration != null ? (
              <>
                <span className="tabular-nums">{duration}</span> วัน
              </>
            ) : (
              "—"
            )}
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2.5">
          <Text className="text-xs text-gray-500">ค้างรับ (ตั้งแต่ส่งมอบ)</Text>
          <div className="mt-0.5 text-sm font-semibold text-gray-900">
            {aging != null ? (
              <>
                <span className="tabular-nums">{aging}</span> วัน
              </>
            ) : (
              "—"
            )}
          </div>
        </div>
      </div>

      {/* milestone checklist 4 หมุด */}
      <div>
        <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          หมุดงาน (Milestone)
        </Text>
        <ol className="space-y-2">
          {MILESTONES.map((m) => {
            const date = order[m.field] as string | null;
            const done = Boolean(date);
            return (
              <li
                key={m.field}
                className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2.5"
              >
                {done ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
                ) : (
                  <Circle className="h-5 w-5 shrink-0 text-gray-300" />
                )}
                <div className="min-w-0 flex-1">
                  <Text
                    className={cn(
                      "text-sm font-medium",
                      done ? "text-gray-900" : "text-gray-400",
                    )}
                  >
                    {m.label}
                  </Text>
                </div>
                <Text className="shrink-0 tabular-nums text-xs text-gray-500">
                  {done ? fmtDateTH(date) : "ยังไม่ถึงหมุด"}
                </Text>
              </li>
            );
          })}
        </ol>
      </div>

      {/* แนบสลิป/รูปเช็ค (mock) */}
      <div>
        <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          หลักฐานแนบ (สลิป/รูปเช็ค)
        </Text>
        <AttachmentMock order={order} />
      </div>
    </div>
  );
}

/** แนบไฟล์ mock — แสดงชื่อไฟล์+สถานะ Done (ไม่ upload จริง, spec §3.2 prototype) */
function AttachmentMock({ order }: { order: GovProcureOrder }) {
  const [files, setFiles] = useState<string[]>(() =>
    order.attachments.map((a) => a.file_name ?? a.file_path),
  );
  const { canWrite } = useRole();

  function mockAttach() {
    const name = `สลิป-${order.qt_reference ?? order.id}-${files.length + 1}.jpg`;
    setFiles((prev) => [...prev, name]);
    toast.success(`แนบไฟล์ ${name} แล้ว (จำลอง)`);
  }

  return (
    <div className="space-y-2">
      {files.length === 0 ? (
        <Text className="text-xs text-gray-400">ยังไม่มีไฟล์แนบ</Text>
      ) : (
        <ul className="space-y-1.5">
          {files.map((f, i) => (
            <li
              key={i}
              className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2"
            >
              <FileCheck2 className="h-4 w-4 shrink-0 text-green-600" />
              <span className="min-w-0 flex-1 truncate text-sm text-gray-700">{f}</span>
              <StatusBadge tone="success">แนบแล้ว</StatusBadge>
            </li>
          ))}
        </ul>
      )}
      {canWrite && (
        <Button variant="outline" size="sm" onClick={mockAttach}>
          <Paperclip className="mr-1.5 h-4 w-4" /> แนบสลิป/รูปเช็ค (จำลอง)
        </Button>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// helpers
// ════════════════════════════════════════════════════════════════════
function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <Text className="text-xs text-gray-400">{label}</Text>
      <Text className="mt-0.5 text-sm font-medium text-gray-900">{value}</Text>
    </div>
  );
}

function SubGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3.5">
      <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
        {title}
      </Text>
      <div className="divide-y divide-gray-100">{children}</div>
    </div>
  );
}

/** แถวเงิน — right-align + tabular (เงินล้วน) · slip = ป้ายสถานะสลิปควบ */
function MoneyRow({
  label,
  value,
  strong,
  negativeHint,
  slip,
}: {
  label: string;
  value: number | null;
  strong?: boolean;
  negativeHint?: boolean;
  slip?: "Done" | "-" | null;
}) {
  const display =
    value != null && negativeHint && value > 0 ? `−${fmtMoney(value, { currency: false })} ฿` : fmtMoney(value);
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="flex items-center gap-2 text-sm text-gray-500">
        {label}
        {slip === "Done" && <StatusBadge tone="success">สลิป Done</StatusBadge>}
      </span>
      <span
        className={cn(
          "tabular-nums text-sm",
          strong ? "font-semibold text-gray-900" : "text-gray-700",
          negativeHint && value != null && value > 0 && "text-red-600",
        )}
      >
        {display}
      </span>
    </div>
  );
}

function DateRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="tabular-nums text-sm text-gray-700">{fmtDateTH(value)}</span>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="tabular-nums text-sm text-gray-700">{value}</span>
    </div>
  );
}
