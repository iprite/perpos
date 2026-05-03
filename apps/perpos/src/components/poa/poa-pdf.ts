import type { PoaRequestItemRow, PoaRequestRow } from "./poa-types";
import { withBasePath } from "@/utils/base-path";

export async function buildPoaPdfBytes(req: PoaRequestRow, items: PoaRequestItemRow[]) {
  const res = await fetch(withBasePath("/api/poa/pdf"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ req, items }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || "สร้าง PDF ไม่สำเร็จ");
  }

  return new Uint8Array(await res.arrayBuffer());
}
