"use client";

// create-order-dialog.tsx — สร้างออเดอร์ใหม่ (สถานะ "ฉบับร่าง") แล้วไปเพิ่มรายการพรมต่อใน detail dialog
// prototype: mutation อยู่ใน client state เท่านั้น

import { useState } from "react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";
import { SegmentedControl } from "@/components/ui/segmented";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import { Text } from "@/components/ui/typography";
import { notify } from "@/lib/toast";
import { CHAT_CHANNEL_LABEL, DESIGN_SOURCE_LABEL, ORDER_PRIORITY_LABEL } from "../_fixtures/labels";
import type { ChatChannel, DesignSource, MattiiOrder, OrderPriority } from "../_fixtures/types";
import { useMattiiData } from "../_components";

const CHANNEL_OPTIONS = (Object.keys(CHAT_CHANNEL_LABEL) as ChatChannel[]).map((c) => ({
  value: c as string,
  label: CHAT_CHANNEL_LABEL[c],
}));

export function CreateOrderDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (order: MattiiOrder) => void;
}) {
  const { customers, addOrder } = useMattiiData();

  const [customerId, setCustomerId] = useState("");
  const [channel, setChannel] = useState<ChatChannel>("line");
  const [designSource, setDesignSource] = useState<DesignSource>("customer_file");
  const [priority, setPriority] = useState<OrderPriority>("normal");
  const [dueDate, setDueDate] = useState("");
  const [isCod, setIsCod] = useState<"yes" | "no">("no");
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);

  const customerOptions = [
    { value: "", label: "— เลือกลูกค้า —" },
    ...customers.map((c) => ({ value: c.id, label: `${c.display_name} (${c.code})` })),
  ];

  function handleSave() {
    setTouched(true);
    if (!customerId) {
      notify.error("กรุณาเลือกลูกค้า");
      return;
    }
    const order = addOrder({
      customer_id: customerId,
      source_channel: channel,
      design_source: designSource,
      priority,
      due_date: dueDate || null,
      is_cod: isCod === "yes",
      note: note || null,
    });
    notify.created(`สร้างออเดอร์ ${order.order_no} แล้ว — เพิ่มรายการพรมต่อได้เลย`);
    onOpenChange(false);
    onCreated(order);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>สร้างออเดอร์ใหม่</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            <div>
              <Label>ลูกค้า *</Label>
              <CustomSelect
                value={customerId}
                onChange={setCustomerId}
                options={customerOptions}
                className="mt-1"
              />
              {touched && !customerId && (
                <Text className="mt-1 text-xs text-red-600">กรุณาเลือกลูกค้า</Text>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>ช่องทางที่มา</Label>
                <CustomSelect
                  value={channel}
                  onChange={(v) => setChannel(v as ChatChannel)}
                  options={CHANNEL_OPTIONS}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>กำหนดส่ง</Label>
                <div className="mt-1">
                  <ThaiDatePicker
                    value={dueDate}
                    onChange={setDueDate}
                    placeholder="เลือกวันที่ (ไม่บังคับ)"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <Label>แหล่งที่มาของลาย</Label>
                <div className="mt-1">
                  <SegmentedControl
                    value={designSource}
                    onChange={setDesignSource}
                    size="sm"
                    fullWidth
                    options={(Object.keys(DESIGN_SOURCE_LABEL) as DesignSource[]).map((s) => ({
                      value: s,
                      label: DESIGN_SOURCE_LABEL[s],
                    }))}
                  />
                </div>
              </div>
              <div>
                <Label>ความเร่งด่วน</Label>
                <div className="mt-1">
                  <SegmentedControl
                    value={priority}
                    onChange={setPriority}
                    size="sm"
                    fullWidth
                    options={(Object.keys(ORDER_PRIORITY_LABEL) as OrderPriority[]).map((p) => ({
                      value: p,
                      label: ORDER_PRIORITY_LABEL[p],
                      activeClassName: p === "rush" ? "bg-red-600" : undefined,
                    }))}
                  />
                </div>
              </div>
              <div>
                <Label>เก็บเงินปลายทาง (COD)</Label>
                <div className="mt-1">
                  <SegmentedControl
                    value={isCod}
                    onChange={setIsCod}
                    size="sm"
                    fullWidth
                    options={[
                      { value: "no", label: "ไม่ใช่" },
                      { value: "yes", label: "ใช่" },
                    ]}
                  />
                </div>
              </div>
            </div>

            <div>
              <Label htmlFor="mt-order-note">โน้ตภายใน</Label>
              <Input
                id="mt-order-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="เช่น ลูกค้าประจำ ขอลายเดิมแต่เปลี่ยนสีพื้น"
                className="mt-1"
              />
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ยกเลิก
          </Button>
          <Button onClick={handleSave}>สร้างออเดอร์</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
