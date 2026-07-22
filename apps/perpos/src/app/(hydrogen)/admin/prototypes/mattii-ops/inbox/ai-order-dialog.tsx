"use client";

// inbox/ai-order-dialog.tsx — AI §5.1 (MUST-1) "สร้างออเดอร์จากแชท"
// ปุ่มเดียวจากห้องแชท → AI อ่านบทสนทนา (จำลอง latency) → พรีฟิลฟอร์มให้ Sale ตรวจก่อนบันทึกเสมอ
//
// binding (contract §5.1 / Review Log b7):
//  - ช่องที่ AI ไม่มั่นใจ = ทิ้งว่าง + ไฮไลต์ (ห้ามเดาใส่)
//  - ป้ายหลัก = "AI ร่างให้ — ต้องตรวจ N ช่อง" (ห้ามโชว์ % เป็นตัวเลขหลัก — % อยู่บรรทัดรอง)
//  - ทุกช่องที่ AI เติมมี evidence (ข้อความต้นฉบับ) + กด "ดูข้อความต้นฉบับ" เพื่อเลื่อนไปไฮไลต์ในแชท
//  - มีทางออก "เริ่มจากฟอร์มเปล่า" เสมอ

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Sparkles } from "lucide-react";
import cn from "@core/utils/class-names";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/custom-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/ui/segmented";
import { StatusBadge } from "@/components/ui/badge";
import { Text } from "@/components/ui/typography";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import { notify } from "@/lib/toast";
import {
  AI_DISCLAIMER,
  AI_MOCK_LATENCY_MS,
  AI_MOCK_MODEL_LABEL,
  aiChatDraftFor,
  reviewCountOf,
  type AiChatDraft,
  type AiDraftField,
} from "../_fixtures/ai-mocks";
import { DESIGN_SOURCE_LABEL } from "../_fixtures/labels";
import type {
  DesignSource,
  MattiiConversation,
  MattiiOrder,
  MattiiOrderItem,
} from "../_fixtures/types";
import { fmtMoney, fmtPercent, useMattiiData, type NewOrderItemInput } from "../_components";

interface FormState {
  customerId: string;
  productId: string;
  sizeId: string;
  qty: string;
  patternName: string;
  designSource: DesignSource;
  dueDate: string;
  note: string;
}

const EMPTY_FORM: FormState = {
  customerId: "",
  productId: "",
  sizeId: "",
  qty: "",
  patternName: "",
  designSource: "customer_file",
  dueDate: "",
  note: "",
};

const DESIGN_SOURCE_OPTIONS = (Object.keys(DESIGN_SOURCE_LABEL) as DesignSource[]).map((s) => ({
  value: s,
  label: DESIGN_SOURCE_LABEL[s],
}));

export function AiOrderDialog({
  open,
  onOpenChange,
  conversation,
  onEvidence,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  conversation: MattiiConversation;
  /** กดดูข้อความต้นฉบับ → ปิด dialog แล้วเลื่อนไปไฮไลต์ในแชท (ค่าที่กรอกไว้ยังอยู่) */
  onEvidence: (messageId: string) => void;
  onCreated: (order: MattiiOrder) => void;
}) {
  const { customers, products, productSizes, orders, addOrder, addOrderItem } = useMattiiData();

  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<AiChatDraft | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [touched, setTouched] = useState(false);
  const [pending, setPending] = useState<{ orderId: string; input: NewOrderItemInput } | null>(
    null,
  );
  const runFor = useRef<string | null>(null);

  // เรียก AI (จำลอง) ครั้งเดียวต่อห้องแชท — เปิดซ้ำหลังไปดู evidence ค่าที่กรอกไว้ต้องยังอยู่
  useEffect(() => {
    if (!open || runFor.current === conversation.id) return;
    runFor.current = conversation.id;
    setDraft(null);
    setTouched(false);
    setForm(EMPTY_FORM);
    setLoading(true);
    const timer = window.setTimeout(() => {
      const d = aiChatDraftFor(conversation.id, conversation.channel);
      setDraft(d);
      setForm({
        customerId: conversation.customer_id ?? "",
        productId: d.suggested.product_id ?? "",
        sizeId: d.suggested.product_size_id ?? "",
        qty: d.suggested.qty === null ? "" : String(d.suggested.qty),
        patternName: d.suggested.pattern_name ?? "",
        designSource: d.suggested.design_source ?? "customer_file",
        dueDate: d.suggested.due_date ?? "",
        note: `สร้างจากแชท ${conversation.external_thread_id} — ${d.summary}`,
      });
      setLoading(false);
    }, AI_MOCK_LATENCY_MS);
    return () => window.clearTimeout(timer);
  }, [open, conversation]);

  // เพิ่มรายการพรมหลังออเดอร์เข้า state แล้ว (ยอดรวมจึงคำนวณถูก)
  useEffect(() => {
    if (!pending) return;
    if (!orders.some((o) => o.id === pending.orderId)) return;
    addOrderItem(pending.orderId, pending.input);
    setPending(null);
  }, [pending, orders, addOrderItem]);

  const sizes = productSizes
    .filter((s) => s.product_id === form.productId && s.is_active && s.size_kind === "standard")
    .sort((a, b) => a.sort_order - b.sort_order);
  const selectedSize = productSizes.find((s) => s.id === form.sizeId);
  const selectedProduct = products.find((p) => p.id === form.productId);
  const qtyNum = Number(form.qty);
  const lineTotal =
    selectedSize && Number.isFinite(qtyNum) && qtyNum > 0 ? selectedSize.unit_price * qtyNum : 0;

  const fieldOf = (key: AiDraftField["key"]): AiDraftField | undefined =>
    draft?.fields.find((f) => f.key === key);
  const needsReview = (key: AiDraftField["key"]) => !!fieldOf(key)?.needsReview;
  const reviewCount = draft ? reviewCountOf(draft) : 0;

  function setF<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function startBlank() {
    setDraft(null);
    setTouched(false);
    setForm({ ...EMPTY_FORM, customerId: conversation.customer_id ?? "" });
    notify.info("ล้างร่างของ AI แล้ว — กรอกเองได้เลย");
  }

  function handleSubmit() {
    setTouched(true);
    if (!form.customerId) {
      notify.error("เลือกลูกค้าก่อนบันทึก");
      return;
    }
    if (!form.productId || !form.sizeId) {
      notify.error("เลือกแบบพรมและขนาดก่อนบันทึก");
      return;
    }
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      notify.error("กรอกจำนวนผืนให้ถูกต้อง");
      return;
    }
    const size = productSizes.find((s) => s.id === form.sizeId);
    const product = products.find((p) => p.id === form.productId);
    if (!size || !product) return;

    const order = addOrder({
      customer_id: form.customerId,
      source_channel: conversation.channel,
      design_source: form.designSource,
      priority: "normal",
      due_date: form.dueDate || null,
      is_cod: false,
      note: form.note || null,
    });

    const edgeFinish: MattiiOrderItem["edge_finish"] = product.edge_finish;
    setPending({
      orderId: order.id,
      input: {
        product_id: product.id,
        product_size_id: size.id,
        item_name: product.name,
        size_label: size.size_label,
        width_cm: size.width_cm,
        length_cm: size.length_cm,
        fabric_type: product.fabric_type,
        edge_finish: edgeFinish,
        pattern_name: form.patternName || null,
        qty: qtyNum,
        unit_price: size.unit_price,
        unit_cost: size.base_cost,
        fabric_usage_sqm: size.fabric_usage_sqm,
        spec_note: null,
      },
    });

    notify.created(`สร้างออเดอร์ ${order.order_no} (ฉบับร่าง) จากแชทแล้ว`);
    runFor.current = null;
    onOpenChange(false);
    onCreated(order);
  }

  const customerOptions = [
    { value: "", label: "— เลือกลูกค้า —" },
    ...customers.map((c) => ({ value: c.id, label: `${c.display_name} (${c.code})` })),
  ];
  const productOptions = [
    { value: "", label: "— เลือกแบบพรม —" },
    ...products.filter((p) => p.is_active).map((p) => ({ value: p.id, label: p.name })),
  ];
  const sizeOptions = [
    { value: "", label: form.productId ? "— เลือกขนาด —" : "เลือกแบบพรมก่อน" },
    ...sizes.map((s) => ({ value: s.id, label: `${s.size_label} · ${fmtMoney(s.unit_price)}` })),
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="2xl">
        <DialogHeader>
          <DialogTitle>สร้างออเดอร์จากแชท</DialogTitle>
        </DialogHeader>
        <DialogBody>
          {loading ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Sparkles className="h-4 w-4 text-primary" />
                AI กำลังอ่านบทสนทนาเพื่อร่างออเดอร์ให้…
              </div>
              <div className="animate-pulse space-y-3">
                <div className="h-4 w-2/3 rounded bg-gray-100" />
                <div className="h-10 w-full rounded bg-gray-100" />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="h-10 rounded bg-gray-100" />
                  <div className="h-10 rounded bg-gray-100" />
                  <div className="h-10 rounded bg-gray-100" />
                  <div className="h-10 rounded bg-gray-100" />
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {draft && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone="warning">
                      {reviewCount > 0
                        ? `AI ร่างให้ — ต้องตรวจ ${reviewCount} ช่อง`
                        : "AI ร่างให้ — ตรวจก่อนบันทึก"}
                    </StatusBadge>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-amber-700"
                      onClick={startBlank}
                    >
                      เริ่มจากฟอร์มเปล่า
                    </Button>
                  </div>
                  <Text className="mt-2 text-sm text-gray-700">{draft.summary}</Text>
                  <Text className="mt-1 text-xs text-gray-500">
                    {AI_MOCK_MODEL_LABEL} · {AI_DISCLAIMER}
                  </Text>
                </div>
              )}

              <div>
                <Label>ลูกค้า *</Label>
                <CustomSelect
                  value={form.customerId}
                  onChange={(v) => setF("customerId", v)}
                  options={customerOptions}
                  className="mt-1"
                />
                {!conversation.customer_id && (
                  <Text className="mt-1 text-xs text-gray-500">
                    ห้องแชทนี้ยังไม่ผูกกับลูกค้าในระบบ — เลือกลูกค้าที่ตรงกันก่อนบันทึก
                  </Text>
                )}
                {touched && !form.customerId && (
                  <Text className="mt-1 text-xs text-red-600">กรุณาเลือกลูกค้า</Text>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <AiField field={fieldOf("product")} onEvidence={onEvidence}>
                  <Label>แบบพรม *</Label>
                  <CustomSelect
                    value={form.productId}
                    onChange={(v) => setForm((p) => ({ ...p, productId: v, sizeId: "" }))}
                    options={productOptions}
                    className={cn(
                      "mt-1",
                      needsReview("product") && "rounded-lg ring-2 ring-amber-200",
                    )}
                  />
                </AiField>
                <AiField field={fieldOf("size")} onEvidence={onEvidence}>
                  <Label>ขนาด *</Label>
                  <CustomSelect
                    value={form.sizeId}
                    onChange={(v) => setF("sizeId", v)}
                    options={sizeOptions}
                    className={cn(
                      "mt-1",
                      needsReview("size") && "rounded-lg ring-2 ring-amber-200",
                    )}
                  />
                </AiField>
                <AiField field={fieldOf("qty")} onEvidence={onEvidence}>
                  <Label htmlFor="mt-ai-qty">จำนวน (ผืน) *</Label>
                  <Input
                    id="mt-ai-qty"
                    type="number"
                    min={1}
                    value={form.qty}
                    onChange={(e) => setF("qty", e.target.value)}
                    placeholder="เช่น 2"
                    className={cn("mt-1", needsReview("qty") && "ring-2 ring-amber-200")}
                  />
                </AiField>
                <AiField field={fieldOf("pattern_name")} onEvidence={onEvidence}>
                  <Label htmlFor="mt-ai-pattern">ชื่อลาย</Label>
                  <Input
                    id="mt-ai-pattern"
                    value={form.patternName}
                    onChange={(e) => setF("patternName", e.target.value)}
                    placeholder="เช่น ลายแมวส้มพื้นครีม"
                    className={cn("mt-1", needsReview("pattern_name") && "ring-2 ring-amber-200")}
                  />
                </AiField>
                <AiField field={fieldOf("design_source")} onEvidence={onEvidence}>
                  <Label>แหล่งที่มาของลาย</Label>
                  <div className="mt-1">
                    <SegmentedControl
                      value={form.designSource}
                      onChange={(v) => setF("designSource", v)}
                      size="sm"
                      fullWidth
                      options={DESIGN_SOURCE_OPTIONS}
                    />
                  </div>
                </AiField>
                <AiField field={fieldOf("due_date")} onEvidence={onEvidence}>
                  <Label>กำหนดส่ง</Label>
                  <div className="mt-1">
                    <ThaiDatePicker
                      value={form.dueDate}
                      onChange={(iso) => setF("dueDate", iso)}
                      placeholder="เลือกวันที่ (ไม่บังคับ)"
                    />
                  </div>
                </AiField>
              </div>

              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <Text className="text-xs text-gray-500">ราคาที่จะบันทึก (คิดจากแบบพรม × ขนาด)</Text>
                <Text className="mt-0.5 text-sm text-gray-900">
                  {selectedSize && selectedProduct ? (
                    <>
                      {selectedProduct.name} · {selectedSize.size_label} ·{" "}
                      <span className="tabular-nums">{fmtMoney(selectedSize.unit_price)}</span>/ผืน
                      {lineTotal > 0 && (
                        <>
                          {" "}
                          → รวม{" "}
                          <span className="font-medium tabular-nums">{fmtMoney(lineTotal)}</span>
                        </>
                      )}
                    </>
                  ) : (
                    "เลือกแบบพรมและขนาดเพื่อให้ราคาเด้งอัตโนมัติ"
                  )}
                </Text>
              </div>

              <div>
                <Label htmlFor="mt-ai-note">โน้ตภายใน</Label>
                <Input
                  id="mt-ai-note"
                  value={form.note}
                  onChange={(e) => setF("note", e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ยกเลิก
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            ยืนยันและสร้างออเดอร์
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** ห่อช่องฟอร์ม 1 ช่อง + แสดงที่มาของค่าที่ AI เติม (evidence) */
function AiField({
  field,
  onEvidence,
  children,
}: {
  field?: AiDraftField;
  onEvidence: (messageId: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      {children}
      {field && (
        <div className="mt-1 space-y-0.5">
          <Text className="line-clamp-2 text-xs text-gray-500">
            {field.needsReview ? "AI ไม่มั่นใจ — กรอกเอง: " : "ที่มา: "}
            <span className="text-gray-600">“{field.evidenceQuote}”</span>
          </Text>
          <div className="flex items-center gap-2">
            <Text className="text-[11px] text-gray-400">
              ความมั่นใจของ AI {fmtPercent(field.confidence * 100, 0)}
            </Text>
            {field.evidenceMessageId && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[11px] text-gray-500"
                onClick={() => onEvidence(field.evidenceMessageId)}
              >
                ดูข้อความต้นฉบับ
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
