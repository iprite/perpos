"use client";

import React from "react";
import { Plus, Trash2 } from "lucide-react";
import type { UseFieldArrayReturn, UseFormReturn } from "react-hook-form";

import cn from "@core/utils/class-names";
import { Button } from "@/components/ui/button";
import { Input }  from "@/components/ui/input";
import type { PurchaseDocFormValues } from "./purchase-doc-form-schema";

export function PurchaseDocItemsTable(props: {
  form:             UseFormReturn<PurchaseDocFormValues>;
  fieldArray:       UseFieldArrayReturn<PurchaseDocFormValues, "items", "id">;
  disabled:         boolean;
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
        <div className="col-span-12 md:col-span-1" />
      </div>

      <div className="divide-y divide-slate-100">
        {fields.map((f, idx) => {
          const itemErr  = (form.formState.errors.items?.[idx] as any) ?? {};
          const prodErr  = itemErr.productName?.message as string | undefined;
          const qtyErr   = itemErr.quantity?.message   as string | undefined;
          const priceErr = itemErr.unitPrice?.message  as string | undefined;

          return (
            <div key={f.id} className="px-4 py-3">
              <div className="grid grid-cols-12 gap-2">
                <div className="col-span-12 md:col-span-5">
                  {props.inventoryOptions?.length ? (
                    <select
                      className="mb-2 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-900 focus:outline-none"
                      disabled={props.disabled}
                      value={form.getValues(`items.${idx}.inventoryItemId`) ?? ""}
                      onChange={(e) => {
                        const id = e.target.value || "";
                        form.setValue(`items.${idx}.inventoryItemId`, id, { shouldDirty: true });
                        const opt = props.inventoryOptions?.find((x) => x.id === id);
                        if (opt) form.setValue(`items.${idx}.productName`, opt.label, { shouldDirty: true });
                        if (!id) form.setValue(`items.${idx}.inventoryItemId`, "", { shouldDirty: true });
                      }}
                    >
                      <option value="">(ไม่ผูกสต๊อก) เลือกสินค้า</option>
                      {props.inventoryOptions.map((o) => (
                        <option key={o.id} value={o.id}>{o.label}</option>
                      ))}
                    </select>
                  ) : null}
                  <Input
                    placeholder="เช่น ค่าวัตถุดิบ / ค่าบริการ"
                    disabled={props.disabled}
                    className={cn(prodErr ? "border-red-300" : undefined)}
                    {...form.register(`items.${idx}.productName`)}
                  />
                  {prodErr ? <div className="mt-1 text-xs text-red-600">{prodErr}</div> : null}
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
                  <select
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-900 focus:outline-none"
                    disabled={props.disabled}
                    {...form.register(`items.${idx}.vatType`)}
                  >
                    <option value="exclude">Exclude VAT</option>
                    <option value="include">Include VAT</option>
                    <option value="none">No VAT</option>
                  </select>
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
