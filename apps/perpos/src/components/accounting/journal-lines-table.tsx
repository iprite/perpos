"use client";

import React from "react";
import { CustomSelect } from "@/components/ui/custom-select";
import { Plus, Trash2 } from "lucide-react";
import type { UseFieldArrayAppend, UseFieldArrayRemove, UseFieldArrayReturn, UseFormReturn } from "react-hook-form";

import cn from "@core/utils/class-names";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AccountOption, ContactOption } from "@/components/accounting/journal-entry-form";
import type { JournalEntryFormValues } from "@/components/accounting/journal-form-schema";

export function JournalLinesTable(props: {
  form: UseFormReturn<JournalEntryFormValues>;
  fieldArray: UseFieldArrayReturn<JournalEntryFormValues, "lines", "id">;
  accounts: AccountOption[];
  contacts: ContactOption[];
  canCreate: boolean;
  pending: boolean;
  totals: { debit: number; credit: number; diff: number };
}) {
  const { form, fieldArray } = props;
  const { fields, append, remove } = fieldArray;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-slate-900">รายการบรรทัด</div>
        <Button
          type="button"
          variant="outline"
          className="gap-2"
          disabled={!props.canCreate || props.pending}
          onClick={() => append({ accountId: "", contactId: "", description: "", debit: "", credit: "" })}
        >
          <Plus className="h-4 w-4" />
          เพิ่มบรรทัด
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200">
        <div className="grid grid-cols-12 gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
          <div className="col-span-4">บัญชี</div>
          <div className="col-span-2">ผู้ติดต่อ</div>
          <div className="col-span-3">คำอธิบาย</div>
          <div className="col-span-1 text-right">เดบิต</div>
          <div className="col-span-1 text-right">เครดิต</div>
          <div className="col-span-1"></div>
        </div>

        <div className="divide-y divide-slate-100">
          {fields.map((f, idx) => {
            const debitErr = (form.formState.errors.lines?.[idx] as any)?.debit?.message as string | undefined;
            const creditErr = (form.formState.errors.lines?.[idx] as any)?.credit?.message as string | undefined;
            const rowErr = debitErr || creditErr;

            return (
              <div key={f.id} className="px-3 py-2">
                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-12 md:col-span-4">
                    <CustomSelect
                      value={form.watch(`lines.${idx}.accountId`) ?? ""}
                      onChange={(v) => form.setValue(`lines.${idx}.accountId`, v, { shouldValidate: true, shouldDirty: true })}
                      options={[
                        { value: "", label: "เลือกบัญชี" },
                        ...props.accounts.map((a) => ({ value: a.id, label: a.label })),
                      ]}
                      disabled={!props.canCreate || props.pending}
                      hasError={!!(form.formState.errors.lines?.[idx] as any)?.accountId?.message}
                    />
                    {(form.formState.errors.lines?.[idx] as any)?.accountId?.message ? (
                      <div className="mt-1 text-xs text-red-600">{(form.formState.errors.lines?.[idx] as any).accountId.message}</div>
                    ) : null}
                  </div>

                  <div className="col-span-12 md:col-span-2">
                    <CustomSelect
                      value={form.watch(`lines.${idx}.contactId`) ?? ""}
                      onChange={(v) => form.setValue(`lines.${idx}.contactId`, v, { shouldDirty: true })}
                      options={[
                        { value: "", label: "-" },
                        ...props.contacts.map((c) => ({ value: c.id, label: c.label })),
                      ]}
                      disabled={!props.canCreate || props.pending}
                    />
                  </div>

                  <div className="col-span-12 md:col-span-3">
                    <Input placeholder="(ไม่บังคับ)" disabled={!props.canCreate || props.pending} {...form.register(`lines.${idx}.description`)} />
                  </div>

                  <div className="col-span-6 md:col-span-1">
                    <Input
                      inputMode="decimal"
                      className={cn("text-right", rowErr ? "border-red-300" : undefined)}
                      disabled={!props.canCreate || props.pending}
                      {...form.register(`lines.${idx}.debit`)}
                    />
                  </div>

                  <div className="col-span-6 md:col-span-1">
                    <Input
                      inputMode="decimal"
                      className={cn("text-right", rowErr ? "border-red-300" : undefined)}
                      disabled={!props.canCreate || props.pending}
                      {...form.register(`lines.${idx}.credit`)}
                    />
                  </div>

                  <div className="col-span-12 md:col-span-1 flex items-center justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={!props.canCreate || props.pending || fields.length <= 2}
                      onClick={() => remove(idx)}
                      aria-label="ลบบรรทัด"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {rowErr ? <div className="mt-1 text-xs text-red-600">{rowErr}</div> : null}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-slate-600">
          {form.formState.errors.lines?.message ? <span className="text-red-600">{String(form.formState.errors.lines.message)}</span> : null}
        </div>

        <div className="grid grid-cols-3 gap-3 text-sm">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-xs text-slate-600">เดบิตรวม</div>
            <div className="mt-0.5 font-semibold text-slate-900 tabular-nums">{props.totals.debit.toFixed(2)}</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-xs text-slate-600">เครดิตรวม</div>
            <div className="mt-0.5 font-semibold text-slate-900 tabular-nums">{props.totals.credit.toFixed(2)}</div>
          </div>
          <div
            className={cn(
              "rounded-lg border px-3 py-2",
              props.totals.diff === 0 ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50",
            )}
          >
            <div className="text-xs text-slate-600">ส่วนต่าง</div>
            <div
              className={cn(
                "mt-0.5 font-semibold tabular-nums",
                props.totals.diff === 0 ? "text-emerald-700" : "text-amber-900",
              )}
            >
              {props.totals.diff.toFixed(2)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

