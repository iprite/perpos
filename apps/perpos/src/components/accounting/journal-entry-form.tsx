"use client";

import React, { useMemo, useTransition } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";

import type { OrganizationSummary } from "@/lib/accounting/queries";
import { createJournalEntryAction } from "@/lib/accounting/journal-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { JournalLinesTable } from "@/components/accounting/journal-lines-table";
import { computeTotals, journalEntryFormSchema, type JournalEntryFormValues } from "@/components/accounting/journal-form-schema";

export type AccountOption = { id: string; label: string; type: string };
export type ContactOption = { id: string; label: string; type: string };

export function JournalEntryForm(props: {
  organizations: OrganizationSummary[];
  activeOrganizationId: string | null;
  accounts: AccountOption[];
  contacts: ContactOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const canCreate = useMemo(() => {
    if (!props.activeOrganizationId) return false;
    return props.organizations.some((o) => o.id === props.activeOrganizationId);
  }, [props.activeOrganizationId, props.organizations]);

  const form = useForm<JournalEntryFormValues>({
    resolver: zodResolver(journalEntryFormSchema),
    defaultValues: {
      entryDate: new Date().toISOString().slice(0, 10),
      referenceNumber: "",
      memo: "",
      lines: [
        { accountId: "", contactId: "", description: "", debit: "0", credit: "" },
        { accountId: "", contactId: "", description: "", debit: "", credit: "0" },
      ],
    },
    mode: "onChange",
  });

  const fieldArray = useFieldArray({ control: form.control, name: "lines" });
  const watchedLines = form.watch("lines");

  const totals = useMemo(() => {
    return computeTotals(watchedLines ?? []);
  }, [watchedLines]);

  const canSave = canCreate && form.formState.isValid && !pending;

  return (
    <form
      onSubmit={form.handleSubmit((values) => {
        const orgId = props.activeOrganizationId;
        if (!orgId) return;
        startTransition(async () => {
          const res = await createJournalEntryAction({
            organizationId: orgId,
            entryDate: values.entryDate,
            referenceNumber: values.referenceNumber ?? "",
            memo: values.memo ?? "",
            lines: values.lines.map((l) => ({
              accountId: l.accountId,
              contactId: l.contactId || null,
              description: l.description || null,
              debit: String(l.debit ?? "0"),
              credit: String(l.credit ?? "0"),
            })),
          });

          if (!res.ok) {
            const msg =
              res.error === "unbalanced"
                ? "เดบิตรวมต้องเท่ากับเครดิตรวม"
                : res.error === "invalid_items"
                  ? "รายการบรรทัดไม่ถูกต้อง"
                  : res.error === "not_member"
                    ? "ไม่มีสิทธิ์ในองค์กรนี้"
                    : res.error;
            form.setError("lines", { type: "manual", message: msg });
            return;
          }

          form.reset({
            entryDate: new Date().toISOString().slice(0, 10),
            referenceNumber: "",
            memo: "",
            lines: [
              { accountId: "", contactId: "", description: "", debit: "0", credit: "" },
              { accountId: "", contactId: "", description: "", debit: "", credit: "0" },
            ],
          });
          router.refresh();
        });
      })}
      className="grid gap-6"
    >
      <div className="grid gap-4 md:grid-cols-3">
        <div className="grid gap-2">
          <Label htmlFor="je-date">วันที่</Label>
          <Input id="je-date" type="date" {...form.register("entryDate")} />
          {form.formState.errors.entryDate?.message ? (
            <div className="text-sm text-red-600">{form.formState.errors.entryDate.message}</div>
          ) : null}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="je-ref">เลขที่อ้างอิง</Label>
          <Input id="je-ref" placeholder="เช่น JV-0001" {...form.register("referenceNumber")} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="je-memo">คำอธิบาย</Label>
          <Input id="je-memo" placeholder="เช่น ปรับปรุงรายการ" {...form.register("memo")} />
        </div>
      </div>

      <JournalLinesTable
        form={form}
        fieldArray={fieldArray}
        accounts={props.accounts}
        contacts={props.contacts}
        canCreate={canCreate}
        pending={pending}
        totals={totals}
      />

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={() => {
            form.reset();
          }}
        >
          ล้างฟอร์ม
        </Button>
        <Button type="submit" disabled={!canSave}>
          {pending ? "กำลังบันทึก…" : "บันทึก"}
        </Button>
      </div>
    </form>
  );
}
