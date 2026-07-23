"use client";

// order-detail-dialog.tsx — รายละเอียดออเดอร์ 4 แท็บ + ปุ่ม "ขั้นถัดไป" (primary ปุ่มเดียว)
// §3.0.1/§3.7: ห้าม dropdown เลือกสถานะ · action นอกเส้น (พักงาน/ยกเลิก/ย้อนแก้ลาย/QC ไม่ผ่าน) = ปุ่มรอง
// §2.3: แท็บ "ต้นทุน & กำไร" = owner-only → role อื่นไม่เรนเดอร์แท็บเลย (ไม่ใช่ disable)

import { useState } from "react";
import { PauseCircle, PenLine, RotateCcw } from "lucide-react";
import cn from "@core/utils/class-names";
import { Button } from "@/components/ui/button";
import { Dropdown, type DropdownItem } from "@/components/ui/dropdown";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { notify } from "@/lib/toast";
import { ORDER_STATUS_LABEL } from "../_fixtures/labels";
import type { MattiiOrder, MattiiOrderItem } from "../_fixtures/types";
import {
  NEXT_ACTION,
  OrderStatusBadge,
  PriorityBadge,
  canAdvance,
  canFailQc,
  canHoldOrCancel,
  canSendBackToDesign,
  canUnhold,
  useMattiiData,
  useMattiiRole,
} from "../_components";
import { CostProfitTab, FinanceTab, ProgressTab, SummaryTab } from "./order-detail-tabs";
import { OrderItemDialog } from "./order-item-dialog";

type TabKey = "summary" | "progress" | "finance" | "cost";

export function OrderDetailDialog({
  order,
  onOpenChange,
}: {
  /** null = ปิด */
  order: MattiiOrder | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { role, isOwner, can } = useMattiiRole();
  const { itemsOfOrder, advanceOrder, moveOrder, holdOrder, unholdOrder, cancelOrder, customerOf } =
    useMattiiData();

  const [tab, setTab] = useState<TabKey>("summary");
  const [itemDialog, setItemDialog] = useState<{ open: boolean; item: MattiiOrderItem | null }>({
    open: false,
    item: null,
  });
  const [reasonMode, setReasonMode] = useState<"hold" | "cancel" | null>(null);
  const [reason, setReason] = useState("");

  if (!order) return null;

  const items = itemsOfOrder(order.id);
  const customer = customerOf(order.customer_id);
  const next = NEXT_ACTION[order.status];
  const canEditItems =
    can("write", "orders") && !["shipped", "delivered", "cancelled"].includes(order.status);

  // สลับ role เป็นบทบาทอื่นขณะเปิดแท็บ 🔒 → ตกกลับแท็บสรุปทันที (ไม่มีแท็บว่าง/ข้อมูลหลุด)
  const activeTab: TabKey = tab === "cost" && !isOwner ? "summary" : tab;

  const TABS: { key: TabKey; label: string }[] = [
    { key: "summary", label: "สรุป" },
    { key: "progress", label: "ความคืบหน้า" },
    { key: "finance", label: "การเงิน" },
    ...(isOwner ? [{ key: "cost" as TabKey, label: "ต้นทุน & กำไร" }] : []),
  ];

  function handleAdvance() {
    if (!order) return;
    const msg = advanceOrder(order.id);
    if (msg) notify.success(msg);
    else notify.error("สถานะนี้ไม่มีขั้นถัดไป");
  }

  function handleSendBack() {
    if (!order) return;
    moveOrder(order.id, "designing", "ลูกค้าขอแก้ลาย — ส่งกลับให้ทีมแบบ");
    notify.success(`${order.order_no}: ส่งกลับไปแก้ลาย`);
  }

  function handleFailQc() {
    if (!order) return;
    moveOrder(order.id, "printing", "QC ไม่ผ่าน — ส่งพิมพ์ซ้ำ");
    notify.success(`${order.order_no}: QC ไม่ผ่าน → เข้าคิวพิมพ์ซ้ำ`);
  }

  function handleUnhold() {
    if (!order) return;
    unholdOrder(order.id);
    notify.success(`${order.order_no}: ปลดพักงานแล้ว`);
  }

  function confirmReason() {
    if (!order) return;
    if (!reason.trim()) {
      notify.error("กรุณาระบุเหตุผล");
      return;
    }
    if (reasonMode === "hold") {
      holdOrder(order.id, reason.trim());
      notify.success(`${order.order_no}: พักงานชั่วคราวแล้ว`);
    } else {
      cancelOrder(order.id, reason.trim());
      notify.success(`${order.order_no}: ยกเลิกออเดอร์แล้ว`);
    }
    setReason("");
    setReasonMode(null);
  }

  /** action นอกเส้นที่ไม่ใช่ "ยกเลิก" — ยุบเป็นเมนูเดียวใน footer */
  const secondaryActions: DropdownItem[] = [
    ...(canHoldOrCancel(order.status, role)
      ? [
          {
            key: "hold",
            label: "พักงานชั่วคราว",
            icon: <PauseCircle className="h-4 w-4" />,
            onClick: () => {
              setReason("");
              setReasonMode("hold");
            },
          },
        ]
      : []),
    ...(canSendBackToDesign(order.status, role)
      ? [
          {
            key: "redesign",
            label: "ลูกค้าขอแก้ลาย",
            icon: <PenLine className="h-4 w-4" />,
            onClick: handleSendBack,
          },
        ]
      : []),
    ...(canFailQc(order.status, role)
      ? [
          {
            key: "qc_fail",
            label: "QC ไม่ผ่าน",
            icon: <RotateCcw className="h-4 w-4" />,
            onClick: handleFailQc,
          },
        ]
      : []),
  ];

  return (
    <>
      <Dialog open={!!order} onOpenChange={onOpenChange}>
        <DialogContent size="3xl">
          <DialogHeader>
            <DialogTitle>
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-mono">{order.order_no}</span>
                <span className="text-gray-500">·</span>
                <span>{customer?.display_name ?? "ไม่ระบุลูกค้า"}</span>
                <OrderStatusBadge status={order.status} />
                <PriorityBadge priority={order.priority} />
              </span>
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-4">
              {/* แท็บ — row เดียว ล้นแล้วเลื่อน (DESIGN §4) */}
              <div className="flex gap-1.5 overflow-x-auto rounded-xl border border-gray-200 bg-white p-1.5 shadow-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {TABS.map((t) => (
                  <Button
                    key={t.key}
                    size="sm"
                    variant={activeTab === t.key ? "secondary" : "ghost"}
                    className={cn(
                      "shrink-0 whitespace-nowrap",
                      activeTab === t.key && "bg-gray-100 text-gray-900",
                    )}
                    onClick={() => setTab(t.key)}
                  >
                    {t.label}
                  </Button>
                ))}
              </div>

              {activeTab === "summary" && (
                <SummaryTab
                  order={order}
                  items={items}
                  canEditItems={canEditItems}
                  onAddItem={() => setItemDialog({ open: true, item: null })}
                  onEditItem={(it) => setItemDialog({ open: true, item: it })}
                />
              )}
              {activeTab === "progress" && <ProgressTab order={order} />}
              {activeTab === "finance" && <FinanceTab order={order} />}
              {activeTab === "cost" && isOwner && <CostProfitTab order={order} />}
            </div>
          </DialogBody>
          <DialogFooter>
            {/* action นอกเส้น: ยกเลิก (destructive) แยกซ้าย + ที่เหลือยุบเป็นเมนูเดียว
                กันปุ่ม 5 ตัวเบียดกันบนมือถือ และกันปุ่มแดงติดปุ่มหลัก */}
            {(canHoldOrCancel(order.status, role) ||
              canSendBackToDesign(order.status, role) ||
              canFailQc(order.status, role)) && (
              <div className="mr-auto flex flex-wrap items-center gap-2">
                {canHoldOrCancel(order.status, role) && (
                  <Button
                    variant="destructive"
                    onClick={() => {
                      setReason("");
                      setReasonMode("cancel");
                    }}
                  >
                    ยกเลิกออเดอร์
                  </Button>
                )}
                {secondaryActions.length > 0 && (
                  <Dropdown
                    label="การกระทำอื่น"
                    placement="top-start"
                    minWidth={200}
                    items={secondaryActions}
                  />
                )}
              </div>
            )}
            {canUnhold(order.status, role) && <Button onClick={handleUnhold}>ปลดพักงาน</Button>}
            {next &&
              (canAdvance(order.status, role) ? (
                <Button onClick={handleAdvance}>{next.label}</Button>
              ) : (
                <Button disabled title="บทบาทของคุณไม่มีสิทธิ์กดขั้นตอนนี้">
                  {next.label}
                </Button>
              ))}
            {!next && !canUnhold(order.status, role) && (
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                ปิด
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* เหตุผลของ พักงาน / ยกเลิก (contract บังคับ) */}
      <Dialog open={reasonMode !== null} onOpenChange={(v) => !v && setReasonMode(null)}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>
              {reasonMode === "hold" ? "พักงานชั่วคราว" : "ยกเลิกออเดอร์"} — {order.order_no}
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
            <Label htmlFor="mt-reason">
              เหตุผล * (
              {reasonMode === "hold" ? "จะกลับสถานะเดิมได้เมื่อปลดพักงาน" : "บันทึกถาวรในไทม์ไลน์"})
            </Label>
            <Textarea
              id="mt-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                reasonMode === "hold" ? "เช่น ลูกค้าขอเลื่อนรอโอนเงิน" : "เช่น ลูกค้าเปลี่ยนใจ"
              }
              className="mt-1"
            />
            {reasonMode === "cancel" && order.paid_amount > 0 && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                ออเดอร์นี้รับชำระมาแล้ว — อย่าลืมสร้างรายการคืนเงินในหน้าการเงิน
              </div>
            )}
            <div className="mt-3 text-xs text-gray-400">
              สถานะปัจจุบัน: {ORDER_STATUS_LABEL[order.status]}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReasonMode(null)}>
              ยกเลิก
            </Button>
            <Button
              variant={reasonMode === "cancel" ? "destructive" : "default"}
              onClick={confirmReason}
            >
              ยืนยัน
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {itemDialog.open && (
        <OrderItemDialog
          open={itemDialog.open}
          onOpenChange={(v) => setItemDialog({ open: v, item: v ? itemDialog.item : null })}
          orderId={order.id}
          item={itemDialog.item}
        />
      )}
    </>
  );
}
