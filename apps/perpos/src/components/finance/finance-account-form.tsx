"use client";

import React, { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import toast from "react-hot-toast";
import { Button } from "rizzui";
import { createFinanceAccountAction } from "@/lib/finance/actions";

const schema = z.object({
  name:            z.string().min(1, "กรุณาระบุชื่อบัญชี"),
  linkedAccountId: z.string().optional(),
  bankName:        z.string().optional(),
  accountNumber:   z.string().optional(),
  branch:          z.string().optional(),
  bankAccountType: z.enum(["current", "savings", "fixed"]).optional(),
  channelType:     z.enum(["cash", "bank_transfer", "qr_promptpay", "credit_card", "other"]).optional(),
  custodianName:   z.string().optional(),
  purpose:         z.string().optional(),
  initialBalance:  z.coerce.number().default(0),
  notes:           z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

type Props = {
  organizationId: string;
  accountCategory: "petty_cash" | "bank" | "payment_channel" | "reserve";
  chartAccounts: Array<{ id: string; label: string }>;
  onSuccess?: () => void;
};

const CATEGORY_LABELS: Record<Props["accountCategory"], string> = {
  petty_cash:       "เงินสดย่อย",
  bank:             "บัญชีธนาคาร",
  payment_channel:  "ช่องทางรับเงิน",
  reserve:          "บัญชีสำรอง",
};

const BANK_ACCOUNT_TYPE_LABELS = {
  current: "กระแสรายวัน",
  savings: "ออมทรัพย์",
  fixed:   "ประจำ",
};

const CHANNEL_TYPE_LABELS = {
  cash:          "เงินสด",
  bank_transfer: "โอนธนาคาร",
  qr_promptpay:  "QR/PromptPay",
  credit_card:   "บัตรเครดิต",
  other:         "อื่นๆ",
};

export function FinanceAccountForm({ organizationId, accountCategory, chartAccounts, onSuccess }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { initialBalance: 0 },
  });

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const result = await createFinanceAccountAction({
        organizationId,
        accountCategory,
        name:            values.name,
        linkedAccountId: values.linkedAccountId || null,
        bankName:        values.bankName        || null,
        accountNumber:   values.accountNumber   || null,
        branch:          values.branch          || null,
        bankAccountType: values.bankAccountType || null,
        channelType:     values.channelType     || null,
        custodianName:   values.custodianName   || null,
        purpose:         values.purpose         || null,
        initialBalance:  values.initialBalance  ?? 0,
        notes:           values.notes           || null,
      });
      if (!result.ok) {
        toast.error(result.error ?? "เกิดข้อผิดพลาด");
        return;
      }
      toast.success("เพิ่มบัญชีสำเร็จ");
      onSuccess ? onSuccess() : router.refresh();
    });
  }

  const inputCls = "w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none";
  const labelCls = "block text-sm font-medium text-slate-700 mb-1";

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label className={labelCls}>ชื่อ{CATEGORY_LABELS[accountCategory]} *</label>
        <input {...register("name")} className={inputCls} placeholder={`ระบุชื่อ${CATEGORY_LABELS[accountCategory]}`} />
        {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
      </div>

      <div>
        <label className={labelCls}>ยอดยกมา</label>
        <input {...register("initialBalance")} type="number" step="0.01" className={inputCls} placeholder="0.00" />
      </div>

      {accountCategory === "bank" && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>ชื่อธนาคาร</label>
              <input {...register("bankName")} className={inputCls} placeholder="เช่น ธนาคารกสิกรไทย" />
            </div>
            <div>
              <label className={labelCls}>เลขที่บัญชี</label>
              <input {...register("accountNumber")} className={inputCls} placeholder="xxx-x-xxxxx-x" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>สาขา</label>
              <input {...register("branch")} className={inputCls} placeholder="สาขา" />
            </div>
            <div>
              <label className={labelCls}>ประเภทบัญชี</label>
              <select {...register("bankAccountType")} className={inputCls}>
                <option value="">เลือกประเภท</option>
                {Object.entries(BANK_ACCOUNT_TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          </div>
        </>
      )}

      {accountCategory === "payment_channel" && (
        <div>
          <label className={labelCls}>ประเภทช่องทาง</label>
          <select {...register("channelType")} className={inputCls}>
            <option value="">เลือกประเภท</option>
            {Object.entries(CHANNEL_TYPE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
      )}

      {accountCategory === "petty_cash" && (
        <div>
          <label className={labelCls}>ชื่อผู้รับผิดชอบ</label>
          <input {...register("custodianName")} className={inputCls} placeholder="ชื่อผู้ดูแลเงินสดย่อย" />
        </div>
      )}

      {accountCategory === "reserve" && (
        <div>
          <label className={labelCls}>วัตถุประสงค์</label>
          <input {...register("purpose")} className={inputCls} placeholder="ระบุวัตถุประสงค์" />
        </div>
      )}

      {chartAccounts.length > 0 && (
        <div>
          <label className={labelCls}>เชื่อมบัญชีผังบัญชี</label>
          <select {...register("linkedAccountId")} className={inputCls}>
            <option value="">ไม่เชื่อม</option>
            {chartAccounts.map((a) => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className={labelCls}>หมายเหตุ</label>
        <textarea {...register("notes")} className={inputCls} rows={2} placeholder="หมายเหตุ (ถ้ามี)" />
      </div>

      <div className="flex justify-end">
        <Button type="submit" isLoading={isPending} className="bg-blue-600 text-white hover:bg-blue-700">
          บันทึก
        </Button>
      </div>
    </form>
  );
}
