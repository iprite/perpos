"use client";

import React, { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createFinanceAccountAction } from "@/lib/finance/actions";
import { CustomSelect } from "@/components/ui/custom-select";

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

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormValues>({
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

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <Label htmlFor="name">ชื่อ{CATEGORY_LABELS[accountCategory]} *</Label>
        <Input
          id="name"
          {...register("name")}
          placeholder={`ระบุชื่อ${CATEGORY_LABELS[accountCategory]}`}
          className="mt-1"
        />
        {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
      </div>

      <div>
        <Label htmlFor="initialBalance">ยอดยกมา (฿)</Label>
        <Input
          id="initialBalance"
          {...register("initialBalance")}
          type="number"
          step="0.01"
          placeholder="0.00"
          className="mt-1"
        />
      </div>

      {accountCategory === "bank" && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="bankName">ชื่อธนาคาร</Label>
              <Input id="bankName" {...register("bankName")} placeholder="เช่น ธนาคารกสิกรไทย" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="accountNumber">เลขที่บัญชี</Label>
              <Input id="accountNumber" {...register("accountNumber")} placeholder="xxx-x-xxxxx-x" className="mt-1" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="branch">สาขา</Label>
              <Input id="branch" {...register("branch")} placeholder="สาขา" className="mt-1" />
            </div>
            <div>
              <Label>ประเภทบัญชี</Label>
              <div className="mt-1">
                <CustomSelect
                  value={watch("bankAccountType") ?? ""}
                  onChange={(v) => setValue("bankAccountType", v as any, { shouldDirty: true })}
                  options={[
                    { value: "", label: "เลือกประเภท" },
                    ...Object.entries(BANK_ACCOUNT_TYPE_LABELS).map(([v, l]) => ({ value: v, label: l })),
                  ]}
                />
              </div>
            </div>
          </div>
        </>
      )}

      {accountCategory === "payment_channel" && (
        <div>
          <Label>ประเภทช่องทาง</Label>
          <div className="mt-1">
            <CustomSelect
              value={watch("channelType") ?? ""}
              onChange={(v) => setValue("channelType", v as any, { shouldDirty: true })}
              options={[
                { value: "", label: "เลือกประเภท" },
                ...Object.entries(CHANNEL_TYPE_LABELS).map(([v, l]) => ({ value: v, label: l })),
              ]}
            />
          </div>
        </div>
      )}

      {accountCategory === "petty_cash" && (
        <div>
          <Label htmlFor="custodianName">ชื่อผู้รับผิดชอบ</Label>
          <Input
            id="custodianName"
            {...register("custodianName")}
            placeholder="ชื่อผู้ดูแลเงินสดย่อย"
            className="mt-1"
          />
        </div>
      )}

      {accountCategory === "reserve" && (
        <div>
          <Label htmlFor="purpose">วัตถุประสงค์</Label>
          <Input id="purpose" {...register("purpose")} placeholder="ระบุวัตถุประสงค์" className="mt-1" />
        </div>
      )}

      {chartAccounts.length > 0 && (
        <div>
          <Label>เชื่อมบัญชีผังบัญชี</Label>
          <div className="mt-1">
            <CustomSelect
              value={watch("linkedAccountId") ?? ""}
              onChange={(v) => setValue("linkedAccountId", v, { shouldDirty: true })}
              options={[
                { value: "", label: "ไม่เชื่อม" },
                ...chartAccounts.map((a) => ({ value: a.id, label: a.label })),
              ]}
            />
          </div>
        </div>
      )}

      <div>
        <Label htmlFor="notes">หมายเหตุ</Label>
        <textarea
          id="notes"
          {...register("notes")}
          rows={2}
          placeholder="หมายเหตุ (ถ้ามี)"
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending}>
          {isPending ? "กำลังบันทึก…" : "บันทึก"}
        </Button>
      </div>
    </form>
  );
}
