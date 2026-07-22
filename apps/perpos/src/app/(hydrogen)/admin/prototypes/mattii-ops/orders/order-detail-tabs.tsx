"use client";

// order-detail-tabs.tsx — เนื้อหา 4 แท็บของ detail dialog (สรุป · ความคืบหน้า · การเงิน · ต้นทุน&กำไร 🔒)
// แยกไฟล์จาก dialog shell เพื่อกันไฟล์ใหญ่ (บทเรียน 32k output cap)

import { Boxes, Palette, Pencil, Plus, Printer, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Text } from "@/components/ui/typography";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ACTIVITY_TYPE_LABEL,
  COST_CATEGORY_LABEL,
  EDGE_FINISH_LABEL,
  PAYMENT_METHOD_LABEL,
  SHIPMENT_CARRIER_LABEL,
} from "../_fixtures/labels";
import type { MattiiOrder, MattiiOrderItem } from "../_fixtures/types";
import {
  CfStatusBadge,
  ChannelBadge,
  DesignJobStatusBadge,
  DesignSourceBadge,
  PaymentStatusBadge,
  PaymentTypeBadge,
  PrintJobStatusBadge,
  ShipmentStatusBadge,
  fmtDateTH,
  fmtDateTimeTH,
  fmtDueHint,
  Field,
  fmtMoney,
  fmtNum,
  fmtPercent,
  profitOf,
  SectionHeading,
  useMattiiData,
} from "../_components";

// ─────────────────────────── แท็บ 1: สรุป ───────────────────────────

export function SummaryTab({
  order,
  items,
  canEditItems,
  onAddItem,
  onEditItem,
}: {
  order: MattiiOrder;
  items: MattiiOrderItem[];
  canEditItems: boolean;
  onAddItem: () => void;
  onEditItem: (item: MattiiOrderItem) => void;
}) {
  const { customerOf } = useMattiiData();
  const customer = customerOf(order.customer_id);
  const unpaid = order.outstanding_amount > 0;

  return (
    <div className="space-y-5">
      {unpaid && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
          {order.paid_amount === 0
            ? "ยังไม่ได้รับชำระ — เดินงานต่อได้ตามปกติ (ระบบไม่บล็อก)"
            : `ค้างชำระ ${fmtMoney(order.outstanding_amount)} — เดินงานต่อได้ตามปกติ`}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Field label="ลูกค้า">{customer?.display_name ?? "—"}</Field>
        <Field label="ช่องทางที่มา">
          {order.source_channel ? <ChannelBadge channel={order.source_channel} /> : "—"}
        </Field>
        <Field label="แหล่งที่มาของลาย">
          <DesignSourceBadge source={order.design_source} />
        </Field>
        <Field label="กำหนดส่ง">
          <span className="tabular-nums">{fmtDateTH(order.due_date)}</span>
          <span className="ml-2 text-xs text-gray-500">{fmtDueHint(order.due_date)}</span>
        </Field>
        <Field label="วันที่สร้าง">
          <span className="tabular-nums">{fmtDateTH(order.created_at)}</span>
        </Field>
        <Field label="เก็บเงินปลายทาง">{order.is_cod ? "ใช่" : "ไม่ใช่"}</Field>
      </div>

      {order.hold_reason && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          เหตุผลที่พักงาน: {order.hold_reason}
        </div>
      )}
      {order.cancel_reason && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          เหตุผลที่ยกเลิก: {order.cancel_reason}
        </div>
      )}
      {order.note && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
          โน้ตภายใน: {order.note}
        </div>
      )}

      <div>
        <div className="mb-2.5 flex items-center justify-between px-1">
          <span className="text-sm font-semibold text-gray-900">รายการพรม</span>
          {canEditItems && (
            <Button size="sm" variant="outline" onClick={onAddItem}>
              <Plus className="mr-1 h-4 w-4" /> เพิ่มรายการ
            </Button>
          )}
        </div>
        <Table className="shadow-sm">
          <TableHeader>
            <TableRow>
              <TableHead>สินค้า / ลาย</TableHead>
              <TableHead>ขนาด</TableHead>
              <TableHead>เก็บขอบ</TableHead>
              <TableHead align="right">จำนวน (ผืน)</TableHead>
              <TableHead align="right">ราคา/ผืน</TableHead>
              <TableHead align="right">รวม</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableEmpty colSpan={6}>
                <div className="flex flex-col items-center gap-2">
                  <Boxes className="h-7 w-7 text-gray-300" />
                  <span>ยังไม่มีรายการพรมในออเดอร์นี้</span>
                  {canEditItems && (
                    <Button size="sm" onClick={onAddItem}>
                      <Plus className="mr-1 h-4 w-4" /> เพิ่มรายการแรก
                    </Button>
                  )}
                </div>
              </TableEmpty>
            ) : (
              items.map((it) => (
                <TableRow
                  key={it.id}
                  clickable={canEditItems}
                  onClick={canEditItems ? () => onEditItem(it) : undefined}
                >
                  <TableCell>
                    <div className="font-medium text-gray-900">{it.item_name}</div>
                    <div className="text-xs text-gray-500">
                      {it.pattern_name ?? "ยังไม่ระบุลาย"}
                    </div>
                  </TableCell>
                  <TableCell>{it.size_label}</TableCell>
                  <TableCell>{EDGE_FINISH_LABEL[it.edge_finish]}</TableCell>
                  <TableCell align="right" tabular>
                    {fmtNum(it.qty)}
                  </TableCell>
                  <TableCell align="right" tabular>
                    {fmtMoney(it.unit_price)}
                  </TableCell>
                  <TableCell align="right" tabular>
                    {fmtMoney(it.line_total)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
          {items.length > 0 && (
            <TableFooter>
              <TableRow>
                <TableCell colSpan={5}>รวมก่อนส่วนลด/ค่าส่ง</TableCell>
                <TableCell align="right" tabular>
                  {fmtMoney(order.subtotal)}
                </TableCell>
              </TableRow>
            </TableFooter>
          )}
        </Table>
        {canEditItems && items.length > 0 && (
          <Text className="mt-1.5 px-1 text-xs text-gray-400">
            <Pencil className="mr-1 inline h-3 w-3" />
            คลิกที่แถวเพื่อแก้ไข/ลบรายการ
          </Text>
        )}
      </div>
    </div>
  );
}

// ────────────────────── แท็บ 2: ความคืบหน้า ──────────────────────

export function ProgressTab({ order }: { order: MattiiOrder }) {
  const { designJobs, designVersions, printJobs, shipments, activitiesOfOrder, machines } =
    useMattiiData();

  const job = designJobs.find((d) => d.order_id === order.id);
  const versions = job ? designVersions.filter((v) => v.design_job_id === job.id) : [];
  const jobs = printJobs.filter((p) => p.order_id === order.id);
  const ships = shipments.filter((s) => s.order_id === order.id);
  const timeline = activitiesOfOrder(order.id);

  return (
    <div className="space-y-5">
      {/* งานแบบลาย */}
      <div>
        <SectionHeading>
          <span className="inline-flex items-center gap-1.5">
            <Palette className="h-4 w-4 text-gray-400" /> งานแบบลาย
          </span>
        </SectionHeading>
        {job ? (
          <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm text-gray-900">{job.job_no}</span>
              <DesignJobStatusBadge status={job.status} />
              <CfStatusBadge status={job.cf_status} />
              <StatusBadge tone="neutral">แก้ไขแล้ว {job.revision_count} รอบ</StatusBadge>
            </div>
            {job.brief && <Text className="text-xs text-gray-500">บรีฟ: {job.brief}</Text>}
            <ul className="space-y-1.5">
              {versions.map((v) => (
                <li
                  key={v.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg bg-gray-50 px-2.5 py-1.5 text-xs"
                >
                  <span className="font-medium text-gray-900">v{v.version_no}</span>
                  <span className="text-gray-500">{v.file_name}</span>
                  {v.dpi && <span className="tabular-nums text-gray-400">{v.dpi} dpi</span>}
                  {job.approved_version_id === v.id && (
                    <StatusBadge tone="success">เวอร์ชันที่ลูกค้ายืนยัน</StatusBadge>
                  )}
                </li>
              ))}
              {versions.length === 0 && (
                <li className="text-xs text-gray-400">ยังไม่มีไฟล์ลายในงานนี้</li>
              )}
            </ul>
          </div>
        ) : (
          <Text className="px-1 text-xs text-gray-400">ยังไม่มีงานแบบลายสำหรับออเดอร์นี้</Text>
        )}
      </div>

      {/* งานผลิต */}
      <div>
        <SectionHeading>
          <span className="inline-flex items-center gap-1.5">
            <Printer className="h-4 w-4 text-gray-400" /> รอบผลิต
          </span>
        </SectionHeading>
        <Table className="shadow-sm">
          <TableHeader>
            <TableRow>
              <TableHead>เลขที่งานพิมพ์</TableHead>
              <TableHead>เครื่อง</TableHead>
              <TableHead>สถานะ</TableHead>
              <TableHead align="right">จำนวนผืน</TableHead>
              <TableHead>เริ่ม / เสร็จ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.length === 0 ? (
              <TableEmpty colSpan={5}>ยังไม่เข้าคิวผลิต</TableEmpty>
            ) : (
              jobs.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <span className="font-mono">{p.job_no}</span>
                    {p.is_reprint && (
                      <StatusBadge tone="danger" className="ml-2">
                        พิมพ์ซ้ำ
                      </StatusBadge>
                    )}
                  </TableCell>
                  <TableCell>
                    {machines.find((m) => m.id === p.machine_id)?.name ?? "ยังไม่จ่ายเครื่อง"}
                  </TableCell>
                  <TableCell>
                    <PrintJobStatusBadge status={p.status} />
                  </TableCell>
                  <TableCell align="right" tabular>
                    {fmtNum(p.pieces)}
                  </TableCell>
                  <TableCell className="text-xs text-gray-500">
                    {fmtDateTimeTH(p.started_at)} / {fmtDateTimeTH(p.finished_at)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* จัดส่ง */}
      <div>
        <SectionHeading>
          <span className="inline-flex items-center gap-1.5">
            <Truck className="h-4 w-4 text-gray-400" /> การจัดส่ง
          </span>
        </SectionHeading>
        {ships.length === 0 ? (
          <Text className="px-1 text-xs text-gray-400">ยังไม่มีรายการจัดส่ง</Text>
        ) : (
          <div className="space-y-2">
            {ships.map((s) => (
              <div
                key={s.id}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white p-3 text-sm shadow-sm"
              >
                <span className="text-gray-900">{SHIPMENT_CARRIER_LABEL[s.carrier]}</span>
                <span className="font-mono text-xs text-gray-500">
                  {s.tracking_no ?? "ยังไม่มีเลขพัสดุ"}
                </span>
                <ShipmentStatusBadge status={s.status} />
                {s.cod_amount > 0 && (
                  <StatusBadge tone={s.cod_collected ? "success" : "warning"}>
                    COD {fmtMoney(s.cod_amount)}
                    {s.cod_collected ? " (เก็บแล้ว)" : " (ยังไม่เก็บ)"}
                  </StatusBadge>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ไทม์ไลน์ */}
      <div>
        <SectionHeading>ไทม์ไลน์</SectionHeading>
        {timeline.length === 0 ? (
          <Text className="px-1 text-xs text-gray-400">ยังไม่มีบันทึกกิจกรรม</Text>
        ) : (
          <ol className="space-y-2 border-l border-gray-200 pl-4">
            {timeline.map((a) => (
              <li key={a.id} className="relative">
                <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-gray-300" />
                <div className="text-sm text-gray-900">{a.message}</div>
                <div className="text-xs text-gray-400">
                  {ACTIVITY_TYPE_LABEL[a.activity_type]} · {a.actor_label} ·{" "}
                  <span className="tabular-nums">{fmtDateTimeTH(a.occurred_at)}</span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────── แท็บ 3: การเงิน ───────────────────────────

export function FinanceTab({ order }: { order: MattiiOrder }) {
  const { payments } = useMattiiData();
  const rows = payments.filter((p) => p.order_id === order.id);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Field label="ยอดรวม">
          <span className="font-mono tabular-nums">{fmtMoney(order.total_amount)}</span>
        </Field>
        <Field label="ชำระแล้ว">
          <span className="font-mono tabular-nums text-green-600">
            {fmtMoney(order.paid_amount)}
          </span>
        </Field>
        <Field label="คงค้าง">
          <span
            className={`font-mono tabular-nums ${
              order.outstanding_amount > 0 ? "text-red-600" : "text-gray-900"
            }`}
          >
            {fmtMoney(order.outstanding_amount)}
          </span>
        </Field>
        <Field label="ค่าส่ง / ค่าด่วน">
          <span className="font-mono tabular-nums">
            {fmtMoney(order.shipping_fee)} / {fmtMoney(order.rush_fee)}
          </span>
        </Field>
      </div>

      <div>
        <SectionHeading>รายการชำระเงิน</SectionHeading>
        <Table className="shadow-sm">
          <TableHeader>
            <TableRow>
              <TableHead>เลขที่</TableHead>
              <TableHead>ประเภท</TableHead>
              <TableHead>วิธีชำระ</TableHead>
              <TableHead>สถานะ</TableHead>
              <TableHead>วันที่</TableHead>
              <TableHead align="right">จำนวนเงิน</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableEmpty colSpan={6}>ยังไม่มีการชำระเงินในออเดอร์นี้</TableEmpty>
            ) : (
              rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono">{p.payment_no}</TableCell>
                  <TableCell>
                    <PaymentTypeBadge type={p.payment_type} />
                  </TableCell>
                  <TableCell>{PAYMENT_METHOD_LABEL[p.method]}</TableCell>
                  <TableCell>
                    <PaymentStatusBadge status={p.status} />
                  </TableCell>
                  <TableCell className="tabular-nums text-gray-500">
                    {fmtDateTH(p.paid_at)}
                  </TableCell>
                  <TableCell
                    align="right"
                    tabular
                    className={p.payment_type === "refund" ? "text-red-600" : undefined}
                  >
                    {fmtMoney(p.payment_type === "refund" ? -p.amount : p.amount)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ──────────────────── แท็บ 4: ต้นทุน & กำไร (🔒 owner-only) ────────────────────

export function CostProfitTab({ order }: { order: MattiiOrder }) {
  const { orderCosts } = useMattiiData();
  const rows = orderCosts.filter((c) => c.order_id === order.id);
  const totalCost = rows.reduce((s, c) => s + c.amount, 0) || order.total_cost;
  const { gross_profit, margin_percent } = profitOf(order);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Field label="ยอดขาย">
          <span className="font-mono tabular-nums">{fmtMoney(order.total_amount)}</span>
        </Field>
        <Field label="ต้นทุนรวม">
          <span className="font-mono tabular-nums">{fmtMoney(totalCost)}</span>
        </Field>
        <Field label="กำไรขั้นต้น">
          <span
            className={`font-mono tabular-nums ${gross_profit < 0 ? "text-red-600" : "text-green-600"}`}
          >
            {fmtMoney(gross_profit)}
          </span>
        </Field>
        <Field label="%กำไร">
          <span
            className={`font-mono tabular-nums ${margin_percent < 0 ? "text-red-600" : "text-green-600"}`}
          >
            {fmtPercent(margin_percent)}
          </span>
        </Field>
      </div>

      {gross_profit < 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
          ออเดอร์นี้ขาดทุน — ตรวจสอบต้นทุนพิมพ์ซ้ำ/ของเสียก่อนรับงานลักษณะนี้อีก
        </div>
      )}

      <div>
        <SectionHeading>รายการต้นทุน</SectionHeading>
        <Table className="shadow-sm">
          <TableHeader>
            <TableRow>
              <TableHead>หมวด</TableHead>
              <TableHead>รายการ</TableHead>
              <TableHead>ที่มา</TableHead>
              <TableHead align="right">จำนวนเงิน</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableEmpty colSpan={4}>
                ยังไม่มีต้นทุนบันทึกไว้ (ออเดอร์ยังไม่เข้าสายผลิต)
              </TableEmpty>
            ) : (
              rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{COST_CATEGORY_LABEL[c.cost_category]}</TableCell>
                  <TableCell>{c.label}</TableCell>
                  <TableCell className="text-xs text-gray-500">
                    {c.source === "manual" ? "กรอกมือ" : "ระบบบันทึกอัตโนมัติ"}
                  </TableCell>
                  <TableCell align="right" tabular>
                    {fmtMoney(c.amount)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
          {rows.length > 0 && (
            <TableFooter>
              <TableRow>
                <TableCell colSpan={3}>รวมต้นทุน</TableCell>
                <TableCell align="right" tabular>
                  {fmtMoney(totalCost)}
                </TableCell>
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>
    </div>
  );
}
