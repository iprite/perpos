import { z } from "zod";

const lineSchema = z
  .object({
    accountId: z.string().min(1, "กรุณาเลือกบัญชี"),
    contactId: z.string().optional().nullable(),
    description: z.string().optional().nullable(),
    debit: z.string().default("0"),
    credit: z.string().default("0"),
  })
  .superRefine((v, ctx) => {
    const debit = Number(v.debit || 0);
    const credit = Number(v.credit || 0);
    if (!Number.isFinite(debit) || debit < 0) ctx.addIssue({ code: "custom", message: "เดบิตไม่ถูกต้อง", path: ["debit"] });
    if (!Number.isFinite(credit) || credit < 0) ctx.addIssue({ code: "custom", message: "เครดิตไม่ถูกต้อง", path: ["credit"] });
    const hasDebit = debit > 0;
    const hasCredit = credit > 0;
    if (hasDebit === hasCredit) ctx.addIssue({ code: "custom", message: "ใส่เดบิตหรือเครดิตอย่างใดอย่างหนึ่ง", path: ["debit"] });
  });

export const journalEntryFormSchema = z
  .object({
    entryDate: z.string().min(1, "กรุณาเลือกวันที่"),
    referenceNumber: z.string().optional().nullable(),
    memo: z.string().optional().nullable(),
    lines: z.array(lineSchema).min(2, "อย่างน้อย 2 บรรทัด"),
  })
  .superRefine((v, ctx) => {
    const totalDebit = v.lines.reduce((sum, l) => sum + (Number(l.debit || 0) || 0), 0);
    const totalCredit = v.lines.reduce((sum, l) => sum + (Number(l.credit || 0) || 0), 0);
    if (Math.round(totalDebit * 100) !== Math.round(totalCredit * 100)) {
      ctx.addIssue({ code: "custom", message: "เดบิตรวมต้องเท่ากับเครดิตรวม", path: ["lines"] });
    }
  });

export type JournalEntryFormValues = z.infer<typeof journalEntryFormSchema>;

export function computeTotals(lines: Array<{ debit?: string; credit?: string }>) {
  const debit = (lines ?? []).reduce((sum, l) => sum + (Number(l?.debit || 0) || 0), 0);
  const credit = (lines ?? []).reduce((sum, l) => sum + (Number(l?.credit || 0) || 0), 0);
  const diff = debit - credit;
  return { debit, credit, diff };
}

