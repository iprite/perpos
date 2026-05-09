import { z } from "zod";

const itemSchema = z
  .object({
    productName: z.string().min(1, "กรุณากรอกรายการ"),
    inventoryItemId: z.string().optional().nullable(),
    quantity: z.string().min(1, "จำนวนไม่ถูกต้อง"),
    unitPrice: z.string().min(1, "ราคาไม่ถูกต้อง"),
    vatType: z.enum(["include", "exclude", "none"]),
  })
  .superRefine((v, ctx) => {
    const q = Number(v.quantity);
    const p = Number(v.unitPrice);
    if (!Number.isFinite(q) || q <= 0) ctx.addIssue({ code: "custom", message: "จำนวนต้องมากกว่า 0", path: ["quantity"] });
    if (!Number.isFinite(p) || p < 0) ctx.addIssue({ code: "custom", message: "ราคาต้องไม่ติดลบ", path: ["unitPrice"] });
  });

export const invoiceFormSchema = z.object({
  contactId: z.string().min(1, "กรุณาเลือกลูกค้า"),
  issueDate: z.string().min(1, "กรุณาเลือกวันที่"),
  dueDate: z.string().optional().nullable(),
  withholdingTax: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  items: z.array(itemSchema).min(1, "อย่างน้อย 1 รายการ"),
});

export type InvoiceFormValues = z.infer<typeof invoiceFormSchema>;

export type InvoiceTotals = {
  subTotal: number;
  vatAmount: number;
  totalAmount: number;
};

export function computeInvoiceTotals(items: Array<{ quantity: string; unitPrice: string; vatType: "include" | "exclude" | "none" }>): InvoiceTotals {
  let sub = 0;
  let vat = 0;

  for (const it of items ?? []) {
    const q = Number(it.quantity || 0);
    const p = Number(it.unitPrice || 0);
    if (!Number.isFinite(q) || !Number.isFinite(p)) continue;
    const line = q * p;

    if (it.vatType === "include") {
      const base = line / 1.07;
      const v = line - base;
      sub += round2(base);
      vat += round2(v);
    } else if (it.vatType === "exclude") {
      const base = line;
      const v = base * 0.07;
      sub += round2(base);
      vat += round2(v);
    } else {
      sub += round2(line);
    }
  }

  return { subTotal: round2(sub), vatAmount: round2(vat), totalAmount: round2(sub + vat) };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
