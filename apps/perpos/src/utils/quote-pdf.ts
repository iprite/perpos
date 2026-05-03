import type { SalesQuoteItemRow, SalesQuoteRow } from "@/app/(hydrogen)/quotes/quote-types";
import { withBasePath } from "@/utils/base-path";

export async function buildQuotePdfBytes(input: {
  quote: SalesQuoteRow;
  items: Array<SalesQuoteItemRow & { task_list?: string[] | null }>;
  preparedByProfileId?: string | null;
  customer?: {
    tax_id: string | null;
    branch_name: string | null;
    address: string | null;
    contact_name: string | null;
  } | null;
}) {
  const res = await fetch(withBasePath("/api/quotes/pdf"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      quote: input.quote,
      items: input.items,
      customer: input.customer ?? null,
      prepared_by_profile_id: input.preparedByProfileId ?? null,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || "สร้าง PDF ไม่สำเร็จ");
  }

  return new Uint8Array(await res.arrayBuffer());
}
