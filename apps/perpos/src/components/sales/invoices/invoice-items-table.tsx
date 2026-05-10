"use client";

import React from "react";
import { Plus, Trash2 } from "lucide-react";
import type { UseFieldArrayReturn, UseFormReturn } from "react-hook-form";

import cn from "@core/utils/class-names";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CustomSelect } from "@/components/ui/custom-select";
import type { InvoiceFormValues } from "@/components/sales/invoices/invoice-form-schema";

const VAT_OPTIONS = [
  { value: "exclude", label: "Exclude VAT" },
  { value: "include", label: "Include VAT" },
  { value: "none",    label: "No VAT" },
];

export function InvoiceItemsTable(props: {
  form: UseFormReturn<InvoiceFormValues>;
  fieldArray: UseFieldArrayReturn<InvoiceFormValues, "items", "id">;
  disabled: boolean;
  inventoryOptions?: Array<{ id: string; label: string }>;
}) {
  const { form, fieldArray } = props;
  const { fields, append, remove } = fieldArray;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">รายการสินค้า/บริการ</div>
          <div className="mt-0.5 text-xs text-slate-600">เพิ่ม/ลบรายการได้ตามต้องการ</div>
        </div>
        <Button
          type="button"
          variant="outline"
          className="gap-2"
          disabled={props.disabled}
          onClick={() => append({ productName: "", quantity: "1", unitPrice: "0", vatType: "exclude" })}
        >
          <Plus className="h-4 w-4" />
          เพิ่มบรรทัด
        </Button>
      </div>

      <div className="grid grid-cols-12 gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
        <div className="col-span-12 md:col-span-5">สินค้า/บริการ</div>
        <div className="col-span-4 md:col-span-2 text-right">จำนวน</div>
        <div className="col-span-4 md:col-span-2 text-right">ราคา/หน่วย</div>
        <div className="col-span-4 md:col-span-2">VAT</div>
        <div className="col-span-12 md:col-span-1"></div>
      </div>

      <div className="divide-y divide-slate-100">
        {fields.map((f, idx) => {
          const itemErr = (form.formState.errors.items?.[idx] as any) ?? {};
          const productErr = itemErr.productName?.message as string | undefined;
          const qtyErr = itemErr.quantity?.message as string | undefined;
          const priceErr = itemErr.unitPrice?.message as string | undefined;

          return (
            <div key={f.id} className="px-4 py-3">
              <div className="grid grid-cols-12 gap-2">
                <div className="col-span-12 md:col-span-5">
                  {props.inventoryOptions?.length ? (
                    <CustomSelect
                      className="mb-2"
                      disabled={props.disabled}
                      value={form.watch(`items.${idx}.inventoryItemId`) ?? ""}
                      onChange={(id) => {
                        form.setValue(`items.${idx}.inventoryItemId`, id, { shouldDirty: true });
                        const opt = props.inventoryOptions?.find((x) => x.id === id);
                        if (opt) form.setValue(`items.${idx}.productName`, opt.label, { shouldDirty: true });
                      }}
                      options={[
                        { value: "", label: "(ไม่ผูกสต๊อก) เลือกสินค้า" },
                        ...props.inventoryOptions.map((o) => ({ value: o.id, label: o.label })),
                      ]}
                    />
                  ) : null}
                  <Input
                    placeholder="เช่น ค่าบริการรายเดือน"
                    disabled={props.disabled}
                    className={cn(productErr ? "border-red-300" : undefined)}
                    {...form.register(`items.${idx}.productName`)}
                  />
                  {productErr ? <div className="mt-1 text-xs text-red-600">{productErr}</div> : null}
                </div>

                <div className="col-span-4 md:col-span-2">
                  <Input
                    inputMode="decimal"
                    disabled={props.disabled}
                    className={cn("text-right", qtyErr ? "border-red-300" : undefined)}
                    {...form.register(`items.${idx}.quantity`)}
                  />
                  {qtyErr ? <div className="mt-1 text-xs text-red-600">{qtyErr}</div> : null}
                </div>

                <div className="col-span-4 md:col-span-2">
                  <Input
                    inputMode="decimal"
                    disabled={props.disabled}
                    className={cn("text-right", priceErr ? "border-red-300" : undefined)}
                    {...form.register(`items.${idx}.unitPrice`)}
                  />
                  {priceErr ? <div className="mt-1 text-xs text-red-600">{priceErr}</div> : null}
                </div>

                <div className="col-span-4 md:col-span-2">
                  <CustomSelect
                    disabled={props.disabled}
                    value={form.watch(`items.${idx}.vatType`) ?? "exclude"}
                    onChange={(v) => form.setValue(`items.${idx}.vatType`, v as any, { shouldDirty: true })}
                    options={VAT_OPTIONS}
                  />
                </div>

                <div className="col-span-12 md:col-span-1 flex items-center justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={props.disabled || fields.length <= 1}
                    onClick={() => remove(idx)}
                    aria-label="ลบบรรทัด"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {form.formState.errors.items?.message ? (
        <div className="border-t border-slate-200 px-4 py-3 text-sm text-red-600">
          {String(form.formState.errors.items.message)}
        </div>
      ) : null}
    </div>
  );
}
