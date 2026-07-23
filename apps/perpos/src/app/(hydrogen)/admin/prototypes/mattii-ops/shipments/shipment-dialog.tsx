"use client";

// shipment-dialog.tsx — รายละเอียด/แก้ไขรายการจัดส่ง + ไทม์ไลน์พัสดุ + การกระทำ (mock)
// 🔒 ช่อง "ค่าส่ง" เป็น owner-only (เข้าไปเป็นต้นทุนออเดอร์) — role อื่นตัดทั้งช่อง ไม่ใช่ disable

import { useState } from "react";
import { Banknote, Printer, Send, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/custom-select";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Text } from "@/components/ui/typography";
import { SHIPMENT_CARRIER_LABEL } from "../_fixtures/labels";
import type { ShipmentCarrier } from "../_fixtures/types";
import {
  Field,
  OrderStatusBadge,
  ShipmentStatusBadge,
  canAdvance,
  fmtDateTimeTH,
  fmtMoney,
  useMattiiRole,
} from "../_components";
import type { ShipmentFormInput, ShipmentRow } from "./use-shipments-state";

const CARRIER_OPTIONS = (Object.keys(SHIPMENT_CARRIER_LABEL) as ShipmentCarrier[]).map((k) => ({
  value: k,
  label: SHIPMENT_CARRIER_LABEL[k],
}));

export function ShipmentDialog({
  row,
  onOpenChange,
  onSave,
  onAdvanceTracking,
  onMarkCod,
  onShipOrder,
  onPrintLabel,
}: {
  row: ShipmentRow;
  onOpenChange: (open: boolean) => void;
  onSave: (input: ShipmentFormInput) => void;
  onAdvanceTracking: () => void;
  onMarkCod: () => void;
  onShipOrder: () => void;
  onPrintLabel: () => void;
}) {
  const { isOwner, role } = useMattiiRole();
  const s = row.shipment;
  const [carrier, setCarrier] = useState<ShipmentCarrier>(s.carrier);
  const [recipientName, setRecipientName] = useState(s.recipient_name);
  const [recipientPhone, setRecipientPhone] = useState(s.recipient_phone);
  const [address, setAddress] = useState(s.address_snapshot);
  const [shippingCost, setShippingCost] = useState(String(s.shipping_cost || ""));
  const [codAmount, setCodAmount] = useState(String(s.cod_amount || ""));

  const invalid =
    recipientName.trim().length < 2 ||
    recipientPhone.trim().length < 6 ||
    address.trim().length < 10;

  const canShipOrder =
    row.order?.status === "ready_to_ship" && !!s.tracking_no && canAdvance("ready_to_ship", role);
  const canTrack = !row.isDraft && s.status !== "delivered";

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent size="2xl">
        <DialogHeader>
          <DialogTitle>จัดส่ง · ออเดอร์ {row.order?.order_no ?? "—"}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-1.5">
              <ShipmentStatusBadge status={s.status} />
              {row.order && <OrderStatusBadge status={row.order.status} />}
              {row.isDraft && <StatusBadge tone="warning">ยังไม่ได้สร้างรายการส่ง</StatusBadge>}
              {s.cod_amount > 0 && (
                <StatusBadge tone={s.cod_collected ? "success" : "danger"}>
                  {s.cod_collected ? "เก็บเงินปลายทางแล้ว" : "ค้างเก็บเงินปลายทาง"}
                </StatusBadge>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="ลูกค้า">{row.customer?.display_name ?? "—"}</Field>
              <Field label="เลขพัสดุ">
                <span className="font-mono text-xs">{s.tracking_no ?? "ยังไม่มี"}</span>
              </Field>
              <Field label="อ้างอิง Shipnity">
                <span className="font-mono text-xs">{s.shipnity_order_ref ?? "—"}</span>
              </Field>
              <Field label="ซิงก์ล่าสุด">
                <span className="tabular-nums">{fmtDateTimeTH(s.last_synced_at)}</span>
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label>ขนส่ง *</Label>
                <CustomSelect
                  value={carrier}
                  onChange={(v) => setCarrier(v as ShipmentCarrier)}
                  options={CARRIER_OPTIONS}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="shp-name">ชื่อผู้รับ *</Label>
                <Input
                  id="shp-name"
                  className="mt-1"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  placeholder="ชื่อ-นามสกุลผู้รับ"
                />
              </div>
              <div>
                <Label htmlFor="shp-phone">เบอร์โทรผู้รับ *</Label>
                <Input
                  id="shp-phone"
                  className="mt-1"
                  value={recipientPhone}
                  onChange={(e) => setRecipientPhone(e.target.value)}
                  placeholder="เช่น 081-234-5678"
                />
              </div>
              <div>
                <Label htmlFor="shp-cod">ยอดเก็บเงินปลายทาง (฿)</Label>
                <Input
                  id="shp-cod"
                  type="number"
                  min={0}
                  className="mt-1"
                  value={codAmount}
                  onChange={(e) => setCodAmount(e.target.value)}
                  placeholder="0 = ไม่เก็บเงินปลายทาง"
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="shp-address">ที่อยู่จัดส่ง *</Label>
                <Textarea
                  id="shp-address"
                  rows={2}
                  className="mt-1"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="บ้านเลขที่ ถนน แขวง/ตำบล เขต/อำเภอ จังหวัด รหัสไปรษณีย์"
                />
              </div>
              {isOwner && (
                <div>
                  <Label htmlFor="shp-cost">ค่าส่ง (฿)</Label>
                  <Input
                    id="shp-cost"
                    type="number"
                    min={0}
                    className="mt-1"
                    value={shippingCost}
                    onChange={(e) => setShippingCost(e.target.value)}
                  />
                  <Text className="mt-1 text-xs text-gray-500">
                    บันทึกเป็นต้นทุนค่าขนส่งของออเดอร์นี้อัตโนมัติ
                  </Text>
                </div>
              )}
            </div>

            {invalid && (
              <Text className="text-xs text-red-600">
                กรอกชื่อผู้รับ เบอร์โทร และที่อยู่ให้ครบก่อนบันทึก (ที่อยู่อย่างน้อย 10 ตัวอักษร)
              </Text>
            )}

            <div>
              <div className="mb-2 px-1 text-sm font-semibold text-gray-900">การกระทำ</div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!canTrack}
                  onClick={onAdvanceTracking}
                >
                  <Truck className="mr-1.5 h-4 w-4" /> อัปเดตสถานะพัสดุขั้นถัดไป
                </Button>
                <Button variant="outline" size="sm" disabled={row.isDraft} onClick={onPrintLabel}>
                  <Printer className="mr-1.5 h-4 w-4" /> ออกใบปะหน้าพัสดุ
                </Button>
                {s.cod_amount > 0 && !s.cod_collected && (
                  <Button variant="outline" size="sm" disabled={row.isDraft} onClick={onMarkCod}>
                    <Banknote className="mr-1.5 h-4 w-4" /> บันทึกเก็บเงินปลายทาง{" "}
                    {fmtMoney(s.cod_amount)}
                  </Button>
                )}
                {canShipOrder && (
                  <Button size="sm" onClick={onShipOrder}>
                    <Send className="mr-1.5 h-4 w-4" /> ส่งของแล้ว (อัปเดตออเดอร์)
                  </Button>
                )}
              </div>
              {row.order?.status === "ready_to_ship" && !s.tracking_no && (
                <Text className="mt-2 text-xs text-amber-700">
                  ต้องมีเลขพัสดุก่อนถึงจะบันทึกว่าส่งของแล้วได้ — กด “ซิงก์เลขพัสดุจาก Shipnity”
                  ที่หน้ารายการ
                </Text>
              )}
            </div>

            <div>
              <div className="mb-2 px-1 text-sm font-semibold text-gray-900">ไทม์ไลน์พัสดุ</div>
              {s.tracking_events.length === 0 ? (
                <Text className="rounded-xl border border-gray-200 bg-white p-3 text-sm text-gray-500">
                  ยังไม่มีความเคลื่อนไหวของพัสดุ
                </Text>
              ) : (
                <ol className="space-y-2">
                  {[...s.tracking_events].reverse().map((ev, idx) => (
                    <li
                      key={`${ev.at}-${idx}`}
                      className="flex items-start gap-2 rounded-xl border border-gray-200 bg-white p-3"
                    >
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-gray-300" />
                      <div className="min-w-0">
                        <div className="text-sm text-gray-900">{ev.description}</div>
                        <div className="text-xs tabular-nums text-gray-500">
                          {fmtDateTimeTH(ev.at)}
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ปิด
          </Button>
          <Button
            disabled={invalid}
            onClick={() =>
              onSave({
                carrier,
                recipientName: recipientName.trim(),
                recipientPhone: recipientPhone.trim(),
                addressSnapshot: address.trim(),
                shippingCost: Number(shippingCost) > 0 ? Number(shippingCost) : s.shipping_cost,
                codAmount: Number(codAmount) > 0 ? Number(codAmount) : 0,
              })
            }
          >
            {row.isDraft ? "สร้างรายการส่ง" : "บันทึกการแก้ไข"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
