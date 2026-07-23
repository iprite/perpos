"use client";

// payments/page.tsx — การเงิน: รับชำระ/มัดจำ/COD/ยอดค้าง (Contract v3 §4 หน้า 10)
// binding v2: "มัดจำไม่บังคับ" — หน้านี้บันทึกเงินและแสดงยอดค้างเท่านั้น ห้ามมี gate/บล็อกสถานะใด ๆ
// COD ค้างเก็บดึงจาก _fixtures/metrics.ts (แหล่งเดียว) · ยอดที่ผูกกับรายการชำระสด ๆ คิดที่ ./summary.ts

import { useEffect, useMemo, useState } from "react";
import { Banknote, Plus, Search, Truck, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/custom-select";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented";
import { StatCard } from "@/components/ui/stat-card";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { notify } from "@/lib/toast";
import { codPendingAmount, codPendingCount } from "../_fixtures/metrics";
import { MOCK_ORG_ID } from "../_fixtures/helpers";
import {
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
  PAYMENT_TYPE_LABEL,
} from "../_fixtures/labels";
import type { MattiiPayment, PaymentMethod, PaymentStatus, PaymentType } from "../_fixtures/types";
import {
  FilterBar,
  MattiiShell,
  NoAccess,
  OrderStatusBadge,
  SectionHeading,
  fmtMoney,
  fmtNum,
  useMattiiData,
  useMattiiRole,
} from "../_components";
import { PaymentsTable } from "./payments-table";
import { PaymentDetailDialog } from "./payment-detail-dialog";
import { RecordPaymentDialog, type RecordPaymentInput } from "./record-payment-dialog";
import { outstandingOrders, paymentSummary } from "./summary";

const TYPE_OPTIONS = [
  { value: "", label: "ทุกประเภท" },
  ...(Object.keys(PAYMENT_TYPE_LABEL) as PaymentType[]).map((t) => ({
    value: t as string,
    label: PAYMENT_TYPE_LABEL[t],
  })),
];
const METHOD_OPTIONS = [
  { value: "", label: "ทุกวิธีชำระ" },
  ...(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((m) => ({
    value: m as string,
    label: PAYMENT_METHOD_LABEL[m],
  })),
];
const STATUS_OPTIONS = [
  { value: "", label: "ทุกสถานะ" },
  ...(Object.keys(PAYMENT_STATUS_LABEL) as PaymentStatus[]).map((s) => ({
    value: s as string,
    label: PAYMENT_STATUS_LABEL[s],
  })),
];

let paySeq = 1;

export default function MattiiPaymentsPage() {
  const { can } = useMattiiRole();
  const {
    payments: rows,
    shipments,
    orders,
    customerOf,
    updateOrder,
    addActivity,
    addPayment,
    patchPayment,
  } = useMattiiData();

  const [view, setView] = useState<"list" | "outstanding">("list");
  const [search, setSearch] = useState("");
  const [type, setType] = useState<PaymentType | "">("");
  const [method, setMethod] = useState<PaymentMethod | "">("");
  const [status, setStatus] = useState<PaymentStatus | "">("");
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [recordOpen, setRecordOpen] = useState(false);
  const [defaultOrderId, setDefaultOrderId] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setLoading(false), 400);
    return () => window.clearTimeout(timer);
  }, []);

  // ลิงก์จากหน้าภาพรวม: /payments?view=outstanding → เปิดแท็บออเดอร์ค้างชำระให้เลย
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("view") === "outstanding") setView("outstanding");
  }, []);

  const summary = useMemo(() => paymentSummary(rows, orders), [rows, orders]);
  const unpaidOrders = useMemo(() => outstandingOrders(orders), [orders]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((p) => {
        if (type && p.payment_type !== type) return false;
        if (method && p.method !== method) return false;
        if (status && p.status !== status) return false;
        if (q) {
          const order = orders.find((o) => o.id === p.order_id);
          const hay = [p.payment_no, order?.order_no ?? "", p.note ?? ""].join(" ").toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => (b.paid_at ?? b.created_at).localeCompare(a.paid_at ?? a.created_at));
  }, [rows, orders, search, type, method, status]);

  const selected = selectedId ? (rows.find((p) => p.id === selectedId) ?? null) : null;
  const hasFilter = !!(search || type || method || status);

  function clearFilters() {
    setSearch("");
    setType("");
    setMethod("");
    setStatus("");
  }

  function applyToOrder(orderId: string, delta: number) {
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;
    const paid = Math.round((order.paid_amount + delta) * 100) / 100;
    updateOrder(orderId, {
      paid_amount: paid,
      outstanding_amount: Math.round((order.total_amount - paid) * 100) / 100,
    });
  }

  function handleRecord(input: RecordPaymentInput) {
    const order = orders.find((o) => o.id === input.orderId);
    if (!order) return;
    const now = new Date().toISOString();
    const isRefund = input.paymentType === "refund";
    const row: MattiiPayment = {
      id: `pay-new-${Date.now()}-${paySeq++}`,
      org_id: MOCK_ORG_ID,
      order_id: input.orderId,
      payment_no: `PAY-${order.order_no.split("-").pop()}-${rows.filter((p) => p.order_id === input.orderId).length + 1}`,
      payment_type: input.paymentType,
      method: input.method,
      amount: input.amount,
      status: "paid",
      paid_at: input.paidOn ? new Date(input.paidOn).toISOString() : now,
      slip_url: null,
      received_by_id: null,
      note: input.note || null,
      created_at: now,
      updated_at: now,
    };
    addPayment(row);
    applyToOrder(input.orderId, isRefund ? -input.amount : input.amount);
    addActivity(
      input.orderId,
      "payment",
      isRefund
        ? `คืนเงินลูกค้า ${fmtMoney(input.amount)}`
        : `รับชำระ ${PAYMENT_TYPE_LABEL[input.paymentType]} ${fmtMoney(input.amount)} (${PAYMENT_METHOD_LABEL[input.method]})`,
    );
    notify.created(
      isRefund
        ? `บันทึกคืนเงิน ${fmtMoney(input.amount)} ของ ${order.order_no} แล้ว`
        : `บันทึกรับชำระ ${fmtMoney(input.amount)} ของ ${order.order_no} แล้ว`,
    );
  }

  function handleConfirmPaid(p: MattiiPayment) {
    patchPayment(p.id, { status: "paid", paid_at: new Date().toISOString() });
    applyToOrder(p.order_id, p.payment_type === "refund" ? -p.amount : p.amount);
    notify.updated(`ยืนยันรับเงินรายการ ${p.payment_no} แล้ว`);
    setSelectedId(null);
  }

  if (!can("view", "payments")) {
    return (
      <NoAccess title="การเงิน" icon={<Wallet className="h-6 w-6" />}>
        หน้าการเงินเปิดให้เจ้าของ/ผู้จัดการ และฝ่ายขาย — ลองสลับบทบาทเพื่อดูข้อมูล
      </NoAccess>
    );
  }

  const canWrite = can("write", "payments");

  return (
    <MattiiShell
      title="การเงิน"
      description="รับชำระ มัดจำ และเงินปลายทาง — เห็นยอดค้างของทุกออเดอร์ในที่เดียว"
      icon={<Wallet className="h-6 w-6" />}
      actions={
        canWrite ? (
          <Button
            onClick={() => {
              setDefaultOrderId(null);
              setRecordOpen(true);
            }}
          >
            <Plus className="mr-1.5 h-4 w-4" /> บันทึกรับชำระ
          </Button>
        ) : undefined
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Banknote className="h-4 w-4" />}
          label="รับแล้วเดือนนี้"
          value={fmtMoney(summary.receivedThisMonth)}
          sub="สุทธิหลังหักคืนเงิน"
          tone="positive"
          valueColored
        />
        <StatCard
          icon={<Wallet className="h-4 w-4" />}
          label="มัดจำที่รับแล้ว"
          value={fmtMoney(summary.depositReceived)}
          sub="มัดจำไม่บังคับ — เก็บเท่าที่ตกลงกับลูกค้า"
          tone="info"
        />
        <StatCard
          icon={<Truck className="h-4 w-4" />}
          label="COD ค้างเก็บ"
          value={fmtMoney(codPendingAmount(shipments))}
          sub={`${fmtNum(codPendingCount(shipments))} พัสดุที่ยังไม่ได้เงินปลายทาง`}
          tone="warning"
          valueColored
        />
        <StatCard
          icon={<Banknote className="h-4 w-4" />}
          label="ยอดค้างชำระรวม"
          value={fmtMoney(summary.outstandingTotal)}
          sub={`${fmtNum(unpaidOrders.length)} ออเดอร์ที่ยังเก็บเงินไม่ครบ`}
          tone={summary.outstandingTotal > 0 ? "negative" : "neutral"}
          valueColored
        />
      </div>

      <SegmentedControl
        value={view}
        onChange={setView}
        ariaLabel="สลับมุมมองการเงิน"
        options={[
          { value: "list", label: "รายการชำระ" },
          { value: "outstanding", label: "ออเดอร์ค้างชำระ" },
        ]}
      />

      {view === "list" ? (
        <div>
          <FilterBar
            onClear={hasFilter ? clearFilters : undefined}
            resultText={`พบ ${fmtNum(visible.length)} รายการ จากทั้งหมด ${fmtNum(rows.length)} รายการ`}
          >
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ค้นหาเลขที่รายการ / เลขที่ออเดอร์"
                className="pl-9"
              />
            </div>
            <CustomSelect
              value={type}
              onChange={(v) => setType(v as PaymentType | "")}
              options={TYPE_OPTIONS}
              className="w-40"
            />
            <CustomSelect
              value={method}
              onChange={(v) => setMethod(v as PaymentMethod | "")}
              options={METHOD_OPTIONS}
              className="w-44"
            />
            <CustomSelect
              value={status}
              onChange={(v) => setStatus(v as PaymentStatus | "")}
              options={STATUS_OPTIONS}
              className="w-40"
            />
          </FilterBar>

          <PaymentsTable
            payments={visible}
            orders={orders}
            loading={loading}
            filtered={hasFilter}
            canWrite={canWrite}
            onSelect={(p) => setSelectedId(p.id)}
            onClearFilters={clearFilters}
            onCreate={() => {
              setDefaultOrderId(null);
              setRecordOpen(true);
            }}
          />
        </div>
      ) : (
        <div>
          <SectionHeading>ออเดอร์ที่ยังเก็บเงินไม่ครบ</SectionHeading>
          <Table className="shadow-sm" stickyHeader maxHeight="60vh">
            <TableHeader sticky>
              <TableRow>
                <TableHead>เลขที่ออเดอร์</TableHead>
                <TableHead>ลูกค้า</TableHead>
                <TableHead>สถานะออเดอร์</TableHead>
                <TableHead align="right">ยอดรวม</TableHead>
                <TableHead align="right">ชำระแล้ว</TableHead>
                <TableHead align="right">คงค้าง</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {unpaidOrders.length === 0 ? (
                <TableEmpty colSpan={6}>
                  <div className="flex flex-col items-center gap-2 py-4">
                    <div className="rounded-full bg-gray-100 p-4">
                      <Banknote className="h-7 w-7 text-gray-400" />
                    </div>
                    <div className="text-sm font-medium text-gray-900">ไม่มีออเดอร์ค้างชำระ</div>
                    <div className="text-sm text-gray-500">
                      เก็บเงินครบทุกออเดอร์แล้ว — ดูรายการที่รับมาได้ในแท็บรายการชำระ
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-1"
                      onClick={() => setView("list")}
                    >
                      ดูรายการชำระ
                    </Button>
                  </div>
                </TableEmpty>
              ) : (
                unpaidOrders.map((o) => (
                  <TableRow
                    key={o.id}
                    clickable
                    onClick={() => {
                      if (!canWrite) return;
                      setDefaultOrderId(o.id);
                      setRecordOpen(true);
                    }}
                  >
                    <TableCell>
                      <span className="font-mono font-medium text-gray-900">{o.order_no}</span>
                    </TableCell>
                    <TableCell>{customerOf(o.customer_id)?.display_name ?? "—"}</TableCell>
                    <TableCell>
                      <OrderStatusBadge status={o.status} />
                    </TableCell>
                    <TableCell align="right" tabular>
                      {fmtMoney(o.total_amount)}
                    </TableCell>
                    <TableCell align="right" tabular>
                      {fmtMoney(o.paid_amount)}
                    </TableCell>
                    <TableCell align="right" tabular className="text-red-600">
                      {fmtMoney(o.outstanding_amount)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <PaymentDetailDialog
        payment={selected}
        canWrite={canWrite}
        onOpenChange={(v) => !v && setSelectedId(null)}
        onConfirmPaid={handleConfirmPaid}
      />

      <RecordPaymentDialog
        open={recordOpen}
        onOpenChange={setRecordOpen}
        defaultOrderId={defaultOrderId}
        onSubmit={handleRecord}
      />
    </MattiiShell>
  );
}
