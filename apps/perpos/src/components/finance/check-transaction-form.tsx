"use client";

import React, { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from '@/lib/toast';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createCheckTransactionAction } from "@/lib/finance/actions";
import { CustomSelect } from "@/components/ui/custom-select";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";

const schema = z.object({
  checkNumber:     z.string().min(1, "กรุณาระบุเลขที่เช็ค"),
  bankName:        z.string().optional(),
  checkDate:       z.string().min(1, "กรุณาระบุวันที่เช็ค"),
  dueDate:         z.string().optional(),
  amount:          z.coerce.number().positive("จำนวนเงินต้องมากกว่า 0"),
  contactId:       z.string().optional(),
  financeAccountId: z.string().optional(),
  notes:           z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

type Props = {
  organizationId: string;
  txnType: "deposit" | "payment";
  contacts: Array<{ id: string; label: string }>;
  financeAccounts: Array<{ id: string; label: string; category: string }>;
  onSuccess?: () => void;
};

export function CheckTransactionForm({ organizationId, txnType, contacts, financeAccounts, onSuccess }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const today = new Date().toISOString().slice(0, 10);

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { checkDate: today },
  });

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const result = await createCheckTransactionAction({
        organizationId,
        txnType,
        checkNumber:      values.checkNumber,
        bankName:         values.bankName         || null,
        checkDate:        values.checkDate,
        dueDate:          values.dueDate          || null,
        amount:           values.amount,
        contactId:        values.contactId        || null,
        financeAccountId: values.financeAccountId || null,
        notes:            values.notes            || null,
      });
      if (!result.ok) {
        toast.error(result.error ?? "เกิดข้อผิดพลาด");
        return;
      }
      toast.success("บันทึกสำเร็จ");
      onSuccess ? onSuccess() : router.refresh();
    });
  }

  const bankAccounts = financeAccounts.filter((a) => a.category === "bank");

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="checkNumber">เลขที่เช็ค *</Label>
          <Input id="checkNumber" {...register("checkNumber")} placeholder="เลขที่เช็ค" className="mt-1" />
          {errors.checkNumber && <p className="mt-1 text-xs text-red-600">{errors.checkNumber.message}</p>}
        </div>
        <div>
          <Label htmlFor="bankName">ธนาคารผู้ออกเช็ค</Label>
          <Input id="bankName" {...register("bankName")} placeholder="ชื่อธนาคาร" className="mt-1" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>วันที่เช็ค *</Label>
          <ThaiDatePicker
            value={watch("checkDate") ?? ""}
            onChange={(v) => setValue("checkDate", v, { shouldValidate: true })}
            hasError={!!errors.checkDate}
          />
          {errors.checkDate && <p className="mt-1 text-xs text-red-600">{errors.checkDate.message}</p>}
        </div>
        <div>
          <Label>วันที่ครบกำหนด</Label>
          <ThaiDatePicker
            value={watch("dueDate") ?? ""}
            onChange={(v) => setValue("dueDate", v)}
            placeholder="(ไม่ระบุ)"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="amount">จำนวนเงิน *</Label>
        <Input id="amount" {...register("amount")} type="number" step="0.01" placeholder="0.00" className="mt-1" />
        {errors.amount && <p className="mt-1 text-xs text-red-600">{errors.amount.message}</p>}
      </div>

      {contacts.length > 0 && (
        <div>
          <Label>{txnType === "deposit" ? "ผู้ออกเช็ค" : "ผู้รับเช็ค"}</Label>
          <div className="mt-1">
            <CustomSelect
              value={watch("contactId") ?? ""}
              onChange={(v) => setValue("contactId", v, { shouldDirty: true })}
              options={[
                { value: "", label: `เลือก${txnType === "deposit" ? "ผู้ออกเช็ค" : "ผู้รับเช็ค"}` },
                ...contacts.map((c) => ({ value: c.id, label: c.label })),
              ]}
            />
          </div>
        </div>
      )}

      {bankAccounts.length > 0 && (
        <div>
          <Label>บัญชีธนาคาร{txnType === "deposit" ? "ที่รับ" : "ที่จ่าย"}</Label>
          <div className="mt-1">
            <CustomSelect
              value={watch("financeAccountId") ?? ""}
              onChange={(v) => setValue("financeAccountId", v, { shouldDirty: true })}
              options={[
                { value: "", label: "เลือกบัญชีธนาคาร" },
                ...bankAccounts.map((a) => ({ value: a.id, label: a.label })),
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
