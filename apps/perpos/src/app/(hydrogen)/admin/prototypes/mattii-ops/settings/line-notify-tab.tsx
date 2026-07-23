"use client";

// line-notify-tab.tsx — ตั้งค่าแจ้งเตือน LINE ต่อเหตุการณ์ (contract §6) + พรีวิวการ์ด Flex ที่จะส่ง
// ผู้ใช้เคาะ: ส่ง "หารายคน" เท่านั้น — ไม่มีตัวเลือกส่งเข้ากลุ่ม
// สวิตช์เปิด/ปิด + ผู้รับ + เกณฑ์ เก็บใน client state (mock) และมี toast ทุกครั้งที่เปลี่ยน

import { useMemo, useState } from "react";
import { Bell, Info } from "lucide-react";
import { CustomSelect } from "@/components/ui/custom-select";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented";
import { StatusBadge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Text } from "@/components/ui/typography";
import { notify } from "@/lib/toast";
import type { MattiiStaff } from "../_fixtures/types";
import { SectionHeading, fmtNum } from "../_components";
import {
  FLEX_CARDS,
  MattiiFlexPreview,
  type FlexAudience,
  type FlexCardKind,
} from "./flex-preview";

interface NotifyEvent {
  key: string;
  label: string;
  when: string;
  /** ค่าเกณฑ์ (null = เหตุการณ์นี้ไม่มีเกณฑ์) */
  threshold: number | null;
  thresholdUnit: string;
  enabled: boolean;
  recipient: string;
  /** true = ผู้รับคือลูกค้าปลายทาง (LINE OA) ไม่ใช่ทีมงาน */
  toCustomer?: boolean;
}

const AUTO_RECIPIENT = "auto";

const EVENTS: NotifyEvent[] = [
  {
    key: "new_order_from_chat",
    label: "ออเดอร์ใหม่จากแชท",
    when: "เมื่อสร้างออเดอร์จากห้องแชท",
    threshold: null,
    thresholdUnit: "",
    enabled: true,
    recipient: AUTO_RECIPIENT,
  },
  {
    key: "cf_approved",
    label: "ลูกค้ายืนยันลายแล้ว",
    when: "เมื่อ Sale บันทึกผลยืนยันลาย",
    threshold: null,
    thresholdUnit: "",
    enabled: true,
    recipient: "stf-prod-1",
  },
  {
    key: "cf_revision_requested",
    label: "ลูกค้าขอแก้ลาย",
    when: "เมื่อบันทึกผลว่าลูกค้าขอแก้",
    threshold: null,
    thresholdUnit: "",
    enabled: true,
    recipient: "stf-design-1",
  },
  {
    key: "qc_failed",
    label: "QC ไม่ผ่าน",
    when: "เมื่อบันทึกผลตรวจไม่ผ่าน",
    threshold: null,
    thresholdUnit: "",
    enabled: true,
    recipient: "stf-owner",
  },
  {
    key: "order_at_risk_overdue",
    label: "ออเดอร์เสี่ยงเลยกำหนดส่ง",
    when: "ก่อนถึงกำหนดส่งตามเกณฑ์ และยังไม่แพ็ค",
    threshold: 1,
    thresholdUnit: "วัน",
    enabled: true,
    recipient: "stf-owner",
  },
  {
    key: "awaiting_cf_stale",
    label: "ค้างรอลูกค้ายืนยันลายนานเกินไป",
    when: "เมื่อค้างรอเกินเกณฑ์ที่ตั้งไว้",
    threshold: 2,
    thresholdUnit: "วัน",
    enabled: true,
    recipient: "stf-sale-1",
  },
  {
    key: "material_low_stock",
    label: "วัสดุต่ำกว่าจุดสั่งซื้อ",
    when: "ตรวจสต๊อกอัตโนมัติทุกเช้า",
    threshold: null,
    thresholdUnit: "",
    enabled: true,
    recipient: "stf-owner",
  },
  {
    key: "payment_received",
    label: "ยืนยันรับชำระเงิน",
    when: "เมื่อบันทึกรับมัดจำ/ยอดคงเหลือ",
    threshold: null,
    thresholdUnit: "",
    enabled: true,
    recipient: AUTO_RECIPIENT,
    toCustomer: true,
  },
  {
    key: "tracking_sent",
    label: "แจ้งเลขพัสดุถึงลูกค้า",
    when: "เมื่อได้เลขพัสดุจากขนส่ง",
    threshold: null,
    thresholdUnit: "",
    enabled: true,
    recipient: AUTO_RECIPIENT,
    toCustomer: true,
  },
  {
    key: "daily_report",
    label: "สรุปสิ้นวันถึงเจ้าของ",
    when: "ทุกวันเวลา 20:00 น.",
    threshold: null,
    thresholdUnit: "",
    enabled: true,
    recipient: "stf-owner",
  },
  {
    key: "morning_queue",
    label: "สรุปคิวเช้าถึงทีมผลิต",
    when: "ทุกวันเวลา 08:00 น.",
    threshold: null,
    thresholdUnit: "",
    enabled: false,
    recipient: "stf-prod-1",
  },
];

const CARD_OPTIONS = FLEX_CARDS.map((c) => ({ value: c.key as string, label: c.label }));

export function LineNotifyTab({ staff }: { staff: MattiiStaff[] }) {
  const [events, setEvents] = useState<NotifyEvent[]>(EVENTS);
  const [card, setCard] = useState<FlexCardKind>("cf_approved");
  const [audience, setAudience] = useState<FlexAudience>("owner");

  const recipientOptions = useMemo(
    () => [
      { value: AUTO_RECIPIENT, label: "ผู้รับผิดชอบงานนั้น (อัตโนมัติ)" },
      ...staff
        .filter((s) => s.line_user_id && s.is_active)
        .map((s) => ({ value: s.id, label: s.display_name })),
    ],
    [staff],
  );

  const enabledCount = events.filter((e) => e.enabled).length;
  const noLineStaff = staff.filter((s) => s.is_active && !s.line_user_id).length;
  const selectedCard = FLEX_CARDS.find((c) => c.key === card);

  function patch(key: string, next: Partial<NotifyEvent>, toastMsg?: string) {
    setEvents((prev) => prev.map((e) => (e.key === key ? { ...e, ...next } : e)));
    if (toastMsg) notify.success(toastMsg);
  }

  return (
    <div className="space-y-5">
      <div>
        <SectionHeading>เหตุการณ์ที่ส่งแจ้งเตือนเข้า LINE</SectionHeading>
        <Table className="shadow-sm">
          <TableHeader>
            <TableRow>
              <TableHead>เหตุการณ์</TableHead>
              <TableHead>ส่งเมื่อไร</TableHead>
              <TableHead>ผู้รับ (ส่งหารายคน)</TableHead>
              <TableHead>เกณฑ์</TableHead>
              <TableHead align="center">สถานะ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.length === 0 ? (
              <TableEmpty colSpan={5}>ยังไม่มีเหตุการณ์ให้ตั้งค่า</TableEmpty>
            ) : (
              events.map((e) => (
                <TableRow key={e.key}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">{e.label}</span>
                      {e.toCustomer && <StatusBadge tone="info">ถึงลูกค้า</StatusBadge>}
                    </div>
                  </TableCell>
                  <TableCell wrap className="max-w-[18rem] text-gray-500">
                    {e.when}
                  </TableCell>
                  <TableCell>
                    {e.toCustomer ? (
                      <span className="text-gray-500">ลูกค้าเจ้าของออเดอร์ (LINE OA)</span>
                    ) : (
                      <CustomSelect
                        value={e.recipient}
                        onChange={(v) =>
                          patch(
                            e.key,
                            { recipient: v },
                            `${e.label}: เปลี่ยนผู้รับเป็น ${
                              recipientOptions.find((o) => o.value === v)?.label ?? "—"
                            }`,
                          )
                        }
                        options={recipientOptions}
                        className="w-56"
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    {e.threshold === null ? (
                      <span className="text-gray-400">—</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          value={String(e.threshold)}
                          onChange={(ev) =>
                            patch(e.key, { threshold: Number(ev.target.value) || 0 })
                          }
                          className="w-20"
                        />
                        <span className="text-sm text-gray-500">{e.thresholdUnit}</span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell align="center">
                    <SegmentedControl
                      value={e.enabled ? "on" : "off"}
                      onChange={(v) =>
                        patch(
                          e.key,
                          { enabled: v === "on" },
                          `${e.label}: ${v === "on" ? "เปิดแจ้งเตือนแล้ว" : "ปิดแจ้งเตือนแล้ว"}`,
                        )
                      }
                      size="sm"
                      ariaLabel={`เปิด-ปิดแจ้งเตือน ${e.label}`}
                      options={[
                        { value: "on", label: "เปิด", activeClassName: "bg-green-600" },
                        { value: "off", label: "ปิด" },
                      ]}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <div className="mt-2 flex flex-wrap items-center gap-3 px-1">
          <Text className="text-xs text-gray-500">
            เปิดอยู่ {fmtNum(enabledCount)} จาก {fmtNum(events.length)} เหตุการณ์
          </Text>
          {noLineStaff > 0 && (
            <Text className="text-xs text-amber-600">
              มีทีมงาน {fmtNum(noLineStaff)} คนที่ยังไม่ได้ผูก LINE — จะไม่ได้รับแจ้งเตือน
            </Text>
          )}
        </div>
      </div>

      <div>
        <SectionHeading>ตัวอย่างการ์ดที่ลูกค้า/ทีมจะเห็นใน LINE</SectionHeading>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <CustomSelect
              value={card}
              onChange={(v) => setCard(v as FlexCardKind)}
              options={CARD_OPTIONS}
              className="w-64"
            />
            <SegmentedControl
              value={audience}
              onChange={setAudience}
              size="sm"
              ariaLabel="ผู้รับการ์ด"
              options={[
                { value: "owner", label: "การ์ดถึงเจ้าของ" },
                { value: "team", label: "การ์ดถึงทีม" },
              ]}
            />
          </div>

          {selectedCard && (
            <Text className="mt-2 text-xs text-gray-500">
              ผู้รับ: {selectedCard.recipients}
              {selectedCard.audienceAware
                ? " · การ์ดใบนี้มีตัวเลขเงิน — สลับเป็น “การ์ดถึงทีม” เพื่อดูว่าตัวเลขต้นทุนหายจริง"
                : " · การ์ดใบนี้ไม่มีตัวเลขต้นทุนอยู่แล้ว"}
            </Text>
          )}

          <div className="mt-4 flex flex-col items-start gap-3 rounded-xl bg-gray-50 p-4 sm:flex-row sm:items-start">
            <MattiiFlexPreview kind={card} audience={audience} />
            <div className="flex items-start gap-2 sm:max-w-sm">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
              <Text className="text-xs text-gray-500">
                ภาพจำลองการ์ด LINE จริง (header โทนถ่าน พื้นเรียบตามมาตรฐานการ์ดของ PERPOS) —
                ตัวอย่างนี้ยังไม่ส่งออกจริง ระบบจะส่งให้ผู้รับ “ทีละคน” ตามที่ตั้งไว้ด้านบน
                ไม่ส่งเข้ากลุ่ม LINE
              </Text>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5">
        <Bell className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
        <Text className="text-xs text-gray-500">
          กฎความปลอดภัยของข้อมูล: การ์ดที่มีต้นทุน กำไร หรือมูลค่าของเสีย
          ระบบจะส่งถึงเจ้าของเท่านั้น ทีมงานได้การ์ดเนื้อหาเดียวกันแต่ตัดตัวเลขเงินออกทั้งหมด
        </Text>
      </div>
    </div>
  );
}
