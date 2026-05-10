"use client";

import React, { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import toast from "react-hot-toast";
import { Button } from "rizzui";
import { createCheckTransactionAction } from "@/lib/finance/actions";
import { CustomSelect } from "@/components/ui/custom-select";

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

  const inputCls = "w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none";
  const labelCls = "block text-sm font-medium text-slate-700 mb-1";

  const bankAccounts = financeAccounts.filter((a) => a.category === "bank");

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>เลขที่เช็ค *</label>
          <input {...register("checkNumber")} className={inputCls} placeholder="เลขที่เช็ค" />
          {errors.checkNumber && <p className="mt-1 text-xs text-red-600">{errors.checkNumber.message}</p>}
        </div>
        <div>
          <label className={labelCls}>ธนาคารผู้ออกเช็ค</label>
          <input {...register("bankName")} className={inputCls} placeholder="ชื่อธนาคาร" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>วันที่เช็ค *</label>
          <input {...register("checkDate")} type="date" className={inputCls} />
          {errors.checkDate && <p className="mt-1 text-xs text-red-600">{errors.checkDate.message}</p>}
        </div>
        <div>
          <label className={labelCls}>วันที่ครบกำหนด</label>
          <input {...register("dueDate")} type="date" className={inputCls} />
        </div>
      </div>

      <div>
        <label className={labelCls}>จำนวนเงิน *</label>
        <input {...register("amount")} type="number" step="0.01" className={inputCls} placeholder="0.00" />
        {errors.amount && <p className="mt-1 text-xs text-red-600">{errors.amount.message}</p>}
      </div>

      {contacts.length > 0 && (
        <div>
          <label className={labelCls}>{txnType === "deposit" ? "ผู้ออกเช็ค" : "ผู้รับเช็ค"}</label>
          <CustomSelect
            value={watch("contactId") ?? ""}
            onChange={(v) => setValue("contactId", v, { shouldDirty: true })}
            options={[
              { value: "", label: `เลือก${txnType === "deposit" ? "ผู้ออกเช็ค" : "ผู้รับเช็ค"}` },
              ...contacts.map((c) => ({ value: c.id, label: c.label })),
            ]}
          />
        </div>
      )}

      {bankAccounts.length > 0 && (
        <div>
          <label className={labelCls}>บัญชีธนาคาร{txnType === "deposit" ? "ที่รับ" : "ที่จ่าย"}</label>
          <CustomSelect
            value={watch("financeAccountId") ?? ""}
            onChange={(v) => setValue("financeAccountId", v, { shouldDirty: true })}
            options={[
              { value: "", label: "เลือกบัญชีธนาคาร" },
              ...bankAccounts.map((a) => ({ value: a.id, label: a.label })),
            ]}
          />
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
