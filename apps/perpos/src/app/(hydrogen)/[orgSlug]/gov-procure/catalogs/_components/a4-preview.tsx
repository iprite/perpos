"use client";

// a4-preview.tsx — "ตัวอย่างโครงหน้า" ของเอกสารก่อนดาวน์โหลด (ไม่ใช่ไฟล์จริง)
//
// ⚠️ เจตนา: บอกผู้ใช้ว่าเลือกเทมเพลต/สวิตช์ราคาแล้วหน้าตาจะออกมาแนวไหน + ยังตรวจไม่ครบจะมีลายน้ำ
//    **ไม่ใช่การเรนเดอร์ HTML จริงของ pdf-renderer** (ยังไม่มี endpoint คืน HTML ให้พรีวิว)
//    → ทุกจุดในกล่องนี้ต้องเขียนให้ชัดว่าเป็นตัวอย่างโครงหน้า
// DESIGN §13.5 — เอกสารพิมพ์ = ขาว/ดำ/เส้นเทา ไม่ใช้พาเลตต์หน้าจอ (พรีวิวจึงใช้ gray ล้วน)

import { Text } from "@/components/ui/typography";
import type { Catalog, CatalogItem } from "@/lib/gov-procure/catalog";
import { fmtMoney, fmtNum } from "./format";

const PREVIEW_TABLE_ROWS = 4;
const PREVIEW_NARRATIVE_ITEMS = 2;

export function A4Preview({
  catalog,
  items,
  template,
  showPrices,
  notVerifiedCount,
}: {
  catalog: Catalog;
  /** รายการของชุด (ใช้แค่ 2–4 รายการแรกเป็นตัวอย่าง) */
  items: CatalogItem[];
  template: "table" | "narrative";
  showPrices: boolean;
  notVerifiedCount: number;
}) {
  const snap = catalog.letterhead_snapshot;
  const sample = [...items].sort((a, b) => a.seq_no - b.seq_no);

  return (
    <div>
      <div className="mx-auto aspect-[1/1.414] w-full max-w-[420px] overflow-hidden rounded-lg border border-gray-300 bg-white p-4 text-gray-900 shadow-sm">
        {notVerifiedCount > 0 && (
          <div className="mb-2 border border-dashed border-gray-400 px-2 py-1 text-center text-[9px] text-gray-500">
            ฉบับร่าง — ยังมี {fmtNum(notVerifiedCount)} รายการที่ยังไม่ผ่านการตรวจสอบ
          </div>
        )}

        {template === "narrative" && (
          <div className="mb-3 flex items-start gap-2 border-b border-gray-300 pb-2">
            {snap?.logo_data_url ? (
              /* data URL ของโลโก้ (ไม่ผ่าน storage) — ใช้ next/image ไม่ได้ */
              <img
                src={snap.logo_data_url}
                alt="โลโก้บริษัท"
                className="h-8 w-8 shrink-0 object-contain"
              />
            ) : (
              <span className="flex h-8 w-8 shrink-0 items-center justify-center border border-dashed border-gray-300 text-[8px] text-gray-400">
                โลโก้
              </span>
            )}
            <div className="min-w-0 text-[9px] leading-tight">
              <div className="font-semibold">
                {snap?.company_name || catalog.company || "— ยังไม่ได้ตั้งชื่อบริษัทบนหัวจดหมาย —"}
              </div>
              {(snap?.address_lines ?? []).slice(0, 3).map((line, i) => (
                <div key={i} className="text-gray-600">
                  {line}
                </div>
              ))}
              {(snap?.phone || snap?.tax_id) && (
                <div className="text-gray-600">
                  {snap?.phone ? `โทร. ${snap.phone}` : ""}
                  {snap?.phone && snap?.tax_id ? " · " : ""}
                  {snap?.tax_id ? `เลขประจำตัวผู้เสียภาษี ${snap.tax_id}` : ""}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="mb-2 text-center text-[11px] font-semibold">{catalog.title}</div>

        {template === "table" ? (
          <TablePreview rows={sample.slice(0, PREVIEW_TABLE_ROWS)} showPrices={showPrices} />
        ) : (
          <NarrativePreview
            rows={sample.slice(0, PREVIEW_NARRATIVE_ITEMS)}
            showPrices={showPrices}
          />
        )}

        {sample.length > 0 && (
          <div className="mt-2 text-center text-[8px] text-gray-400">
            … อีก{" "}
            {fmtNum(
              Math.max(
                0,
                sample.length -
                  (template === "table" ? PREVIEW_TABLE_ROWS : PREVIEW_NARRATIVE_ITEMS),
              ),
            )}{" "}
            รายการในไฟล์จริง
          </div>
        )}
      </div>

      <Text className="mt-2 text-center text-xs text-gray-500">
        นี่คือ <span className="font-medium text-gray-700">ตัวอย่างโครงหน้า</span> เท่านั้น —
        ไม่ใช่ไฟล์จริง · ไฟล์ PDF จริงถูกสร้างโดยระบบเรนเดอร์เอกสารตอนกดดาวน์โหลด (ฟอนต์ ระยะขอบ
        และการตัดหน้าอาจต่างจากนี้)
      </Text>
    </div>
  );
}

function TablePreview({ rows, showPrices }: { rows: CatalogItem[]; showPrices: boolean }) {
  const headers = showPrices
    ? ["ลำดับ", "ชื่อสินค้า", "คำอธิบายสินค้า", "จำนวน", "หน่วย", "ราคา/หน่วย (฿)"]
    : ["ลำดับ", "ชื่อสินค้า", "คำอธิบายสินค้า", "จำนวน", "หน่วย", "รูปสินค้า"];

  return (
    <div className="border border-gray-300">
      <div className="grid grid-cols-[7%_23%_34%_10%_10%_16%] border-b border-gray-300 bg-gray-100 text-[8px] font-medium">
        {headers.map((h) => (
          <div key={h} className="truncate border-r border-gray-300 px-1 py-1 last:border-r-0">
            {h}
          </div>
        ))}
      </div>
      {rows.length === 0 ? (
        <div className="px-1 py-3 text-center text-[8px] text-gray-400">ยังไม่มีรายการในชุดนี้</div>
      ) : (
        rows.map((r) => (
          <div
            key={r.id}
            className="grid grid-cols-[7%_23%_34%_10%_10%_16%] border-b border-gray-200 text-[8px] last:border-b-0"
          >
            <div className="border-r border-gray-200 px-1 py-1 text-center tabular-nums">
              {r.seq_no}
            </div>
            <div className="truncate border-r border-gray-200 px-1 py-1">{r.name}</div>
            <div className="truncate border-r border-gray-200 px-1 py-1 text-gray-600">
              {r.bullets[0] ?? r.spec_line ?? "—"}
            </div>
            <div className="border-r border-gray-200 px-1 py-1 text-right tabular-nums">
              {r.qty ?? "—"}
            </div>
            <div className="border-r border-gray-200 px-1 py-1 text-center">{r.unit ?? "—"}</div>
            <div className="px-1 py-1 text-right tabular-nums">
              {showPrices ? fmtMoney(r.unit_price_ref) : r.image_path ? "มีรูป" : "—"}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function NarrativePreview({ rows, showPrices }: { rows: CatalogItem[]; showPrices: boolean }) {
  if (rows.length === 0) {
    return (
      <div className="border border-dashed border-gray-300 px-2 py-6 text-center text-[8px] text-gray-400">
        ยังไม่มีรายการในชุดนี้
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.id} className="flex gap-2 border-b border-gray-200 pb-2 last:border-b-0">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center border border-dashed border-gray-300 text-[8px] text-gray-400">
            {r.image_path ? "รูปสินค้า" : "ไม่มีรูป"}
          </span>
          <div className="min-w-0 text-[8px] leading-relaxed">
            <div className="text-[9px] font-semibold">
              {r.seq_no}. {r.name}
            </div>
            {r.spec_line && <div className="text-gray-600">{r.spec_line}</div>}
            <ul className="mt-0.5 space-y-0.5">
              {r.bullets.slice(0, 3).map((b, i) => (
                <li key={i} className="truncate text-gray-700">
                  • {b}
                </li>
              ))}
              {r.bullets.length === 0 && <li className="text-gray-400">— ยังไม่มีรายละเอียด —</li>}
            </ul>
            <div className="mt-0.5 text-gray-600">
              จำนวน {r.qty ?? "—"} {r.unit ?? ""}
              {showPrices ? ` · ราคา/หน่วย ${fmtMoney(r.unit_price_ref)}` : ""}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
