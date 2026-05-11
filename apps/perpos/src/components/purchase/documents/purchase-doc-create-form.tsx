"use client";

import React, { useMemo, useTransition } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { AlertTriangle, FileText, Save } from "lucide-react";
import { toast } from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { Input }  from "@/components/ui/input";
import { Label }  from "@/components/ui/label";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import { CustomSelect } from "@/components/ui/custom-select";
import { ContactQuickAddSelect } from "@/components/contacts/contact-quick-add-select";
import { PurchaseDocItemsTable } from "./purchase-doc-items-table";
import { computePurchaseDocTotals, purchaseDocFormSchema, type PurchaseDocFormValues } from "./purchase-doc-form-schema";
import { createPurchaseDocumentAction } from "@/lib/purchase/documents/actions";
import type { PurchaseDocTypeConfig } from "./purchase-doc-type-config";
import type { OrganizationSummary } from "@/lib/accounting/queries";
import cn from "@core/utils/class-names";

export type VendorOption    = { id: string; label: string };
export type InventoryOption = { id: string; label: string };
export type RefDocOption    = { id: string; label: string };

export function PurchaseDocCreateForm(props: {
  config:               PurchaseDocTypeConfig;
  organizations:        OrganizationSummary[];
  activeOrganizationId: string | null;
  vendors:              VendorOption[];
  inventoryOptions:     InventoryOption[];
  refDocOptions?:       RefDocOption[];
}) {
  const { config } = props;
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const canWrite = useMemo(() => {
    const orgId = props.activeOrganizationId;
    if (!orgId) return false;
    const org = props.organizations.find((o) => o.id === orgId);
    return org?.role === "owner" || org?.role === "admin";
  }, [props.activeOrganizationId, props.organizations]);

  const form = useForm<PurchaseDocFormValues>({
    resolver: zodResolver(purchaseDocFormSchema),
    defaultValues: {
      contactId:      "",
      issueDate:      new Date().toISOString().slice(0, 10),
      dueDate:        "",
      withholdingTax: "",
      notes:          "",
      refDocId:       "",
      items:          [{ productName: "", inventoryItemId: "", quantity: "1", unitPrice: "0", vatType: "exclude" }],
    },
    mode: "onChange",
  });

  const fieldArray   = useFieldArray({ control: form.control, name: "items" });
  const watchedItems = form.watch("items");
  const totals       = useMemo(() => computePurchaseDocTotals(watchedItems ?? []), [watchedItems]);

  const disabled     = pending || !canWrite || !props.activeOrganizationId;
  const submitDisabled = disabled || !form.formState.isValid;

  const submit = (status: "draft" | "issued") => {
    const orgId = props.activeOrganizationId;
    if (!orgId || !canWrite) return;

    startTransition(async () => {
      const v = form.getValues();
      const res = await createPurchaseDocumentAction({
        organizationId:  orgId,
        docType:         config.docType,
        contactId:       v.contactId,
        issueDate:       v.issueDate,
        dueDate:         v.dueDate        || null,
        status,
        withholdingTax:  v.withholdingTax || null,
        notes:           v.notes          || null,
        refDocId:        v.refDocId       || null,
        items: v.items.map((it) => ({
          productName:     it.productName,
          inventoryItemId: it.inventoryItemId || null,
          quantity:        it.quantity,
          unitPrice:       it.unitPrice,
          vatType:         it.vatType,
        })),
      });

      if (!res.ok) {
        toast.error(String(res.error || "บันทึกไม่สำเร็จ"));
        return;
      }

      toast.success(status === "issued" ? `บันทึก${config.nameTh}แล้ว` : "บันทึกแบบร่างแล้ว");
      router.replace(config.path);
      router.refresh();
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      {/* ── Left panel ── */}
      <div className="lg:col-span-8">
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-5 py-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <FileText className="h-4 w-4" />
              ข้อมูลเอกสาร
            </div>
          </div>
          <div className="grid gap-4 p-5 md:grid-cols-2">
            {/* Vendor */}
            <div className="grid gap-2 md:col-span-2">
              <Label>ผู้จำหน่าย / คู่ค้า</Label>
              <ContactQuickAddSelect
                disabled={disabled}
                hasError={!!form.formState.errors.contactId}
                value={form.watch("contactId") ?? ""}
                onChange={(v) => form.setValue("contactId", v, { shouldValidate: true, shouldDirty: true })}
                placeholder="เลือกผู้จำหน่าย"
                initialOptions={props.vendors.map((v) => ({ value: v.id, label: v.label }))}
                organizationId={props.activeOrganizationId}
                contactType="vendor"
              />
              {form.formState.errors.contactId?.message ? (
                <div className="text-sm text-red-600">{form.formState.errors.contactId.message}</div>
              ) : null}
            </div>

            {/* Issue date */}
            <div className="grid gap-2">
              <Label>วันที่เอกสาร</Label>
              <ThaiDatePicker
                disabled={disabled}
                value={form.watch("issueDate") ?? ""}
                onChange={(v) => form.setValue("issueDate", v, { shouldValidate: true, shouldDirty: true })}
              />
              {form.formState.errors.issueDate?.message ? (
                <div className="text-sm text-red-600">{form.formState.errors.issueDate.message}</div>
              ) : null}
            </div>

            {/* Due date */}
            {config.canHaveDueDate ? (
              <div className="grid gap-2">
                <Label>กำหนดส่ง / วันหมดอายุ</Label>
                <ThaiDatePicker
                  disabled={disabled}
                  value={form.watch("dueDate") ?? ""}
                  onChange={(v) => form.setValue("dueDate", v, { shouldValidate: true, shouldDirty: true })}
                />
              </div>
            ) : <div />}

            {/* WHT */}
            {config.hasWht ? (
              <div className="grid gap-2">
                <Label>ภาษีหัก ณ ที่จ่าย (บาท)</Label>
                <Input inputMode="decimal" placeholder="0.00" disabled={disabled} {...form.register("withholdingTax")} />
              </div>
            ) : null}

            {/* Ref doc */}
            {config.canRefDoc && props.refDocOptions?.length ? (
              <div className="grid gap-2">
                <Label>อ้างอิงเอกสาร</Label>
                <CustomSelect
                  disabled={disabled}
                  value={form.watch("refDocId") ?? ""}
                  onChange={(v) => form.setValue("refDocId", v, { shouldDirty: true })}
                  placeholder="(ไม่อ้างอิง)"
                  options={[
                    { value: "", label: "(ไม่อ้างอิง)" },
                    ...props.refDocOptions.map((d) => ({ value: d.id, label: d.label })),
                  ]}
                />
              </div>
            ) : null}

            {/* Notes */}
            <div className="grid gap-2 md:col-span-2">
              <Label>หมายเหตุ</Label>
              <Input placeholder="(ไม่บังคับ)" disabled={disabled} {...form.register("notes")} />
            </div>
          </div>
        </div>

        <div className="mt-6">
          <PurchaseDocItemsTable
            form={form}
            fieldArray={fieldArray}
            disabled={disabled}
            inventoryOptions={props.inventoryOptions}
          />
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="lg:col-span-4">
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-5 py-4">
            <div className="text-sm font-semibold text-slate-900">สรุปยอด</div>
            <div className="mt-0.5 text-xs text-slate-600">คำนวณ VAT 7% ตาม VAT type</div>
          </div>
          <div className="grid gap-3 p-5 text-sm">
            <div className="flex items-center justify-between">
              <div className="text-slate-600">Subtotal</div>
              <div className="font-semibold tabular-nums text-slate-900">{totals.subTotal.toFixed(2)}</div>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-slate-600">VAT (7%)</div>
              <div className="font-semibold tabular-nums text-slate-900">{totals.vatAmount.toFixed(2)}</div>
            </div>
            <div className="h-px bg-slate-200" />
            <div className="flex items-center justify-between">
              <div className="text-slate-900">Grand Total</div>
              <div className="text-lg font-semibold tabular-nums text-slate-900">{totals.totalAmount.toFixed(2)}</div>
            </div>
          </div>
        </div>

        {!props.activeOrganizationId ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4" />
              <div>กรุณาเลือกองค์กรก่อน</div>
            </div>
          </div>
        ) : null}

        <div className="mt-4 grid gap-2">
          <Button
            type="button"
            variant="secondary"
            className="gap-2"
            disabled={submitDisabled}
            onClick={() => submit("draft")}
          >
            <Save className="h-4 w-4" />
            บันทึกแบบร่าง
          </Button>
          <Button
            type="button"
            className="gap-2"
            disabled={submitDisabled}
            onClick={() => submit("issued")}
          >
            <FileText className="h-4 w-4" />
            บันทึก{config.nameTh}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => router.push(config.path)}
          >
            ยกเลิก
          </Button>
        </div>
      </div>
    </div>
  );
}
