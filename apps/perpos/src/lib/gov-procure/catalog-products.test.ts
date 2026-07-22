import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  normalizeName,
  canSaveToLibrary,
  buildProductPayloadFromItem,
  applyProductToItem,
  upsertProductFromItem,
  LIBRARY_REJECT_MESSAGE,
} from "./catalog-products";
import type { CatalogItem, CatalogItemSource, CatalogProduct } from "./catalog";

// client ที่ "ห้ามถูกเรียก" — ถ้า invariant รั่ว เทสจะพังทันที
const forbiddenClient = new Proxy(
  {},
  {
    get() {
      throw new Error("ห้ามแตะ Supabase เมื่อ source ไม่ใช่ human_verified");
    },
  },
) as unknown as SupabaseClient;

function makeItem(source: CatalogItemSource): CatalogItem {
  return {
    id: "i1",
    org_id: "o1",
    catalog_id: "c1",
    seq_no: 1,
    name_raw: "Post-it 3M",
    name: "Post-it 3M กระดาษโน้ต No.683-5CF",
    brand_model: "3M 683-5CF",
    spec_line: "กระดาษโน้ตกาวในตัว",
    size_line: "ขนาด 1x3 นิ้ว",
    bullets: ["กาวติดแน่น", ""],
    care_notes: ["เก็บให้พ้นแสงแดด"],
    caution_notes: ["ห้ามโดนน้ำ"],
    ai_warnings: ["ไม่แน่ใจรหัสรุ่น"],
    sub_items: [],
    category: "เครื่องเขียน",
    qty: 5,
    unit: "แพ็ค",
    image_path: "o1/catalogs/c1/abc-postit.png",
    unit_price_ref: 42,
    price_min: null,
    price_max: null,
    price_basis: "ผู้ใช้กรอก",
    price_confidence: null,
    price_updated_by: null,
    price_updated_at: null,
    price_history: [],
    source,
    confidence: 0.9,
    ai_note: null,
    verified_by: source === "human_verified" ? "u1" : null,
    verified_at: source === "human_verified" ? "2026-07-22T00:00:00Z" : null,
    viewed_at: "2026-07-22T00:00:00Z",
    enrich_state: "done",
    enrich_claimed_at: null,
    enrich_job_id: null,
    enrich_error: null,
    product_id: null,
    created_at: "2026-07-22T00:00:00Z",
    updated_at: "2026-07-22T00:00:00Z",
  };
}

describe("normalizeName — ต้องตรงกับ SQL gov_procure_normalize_name() เป๊ะ", () => {
  it("เคสที่ยืนยันจาก prod: Post-it 3M …No.683-5CF", () => {
    expect(normalizeName("Post-it 3M กระดาษโน้ต No.683-5CF")).toBe(
      "post it 3m กระดาษโน้ต no 683 5cf",
    );
  });

  it("เคสที่ยืนยันจาก prod: ช่องว่างซ้ำ + เลขไทย + จุดทศนิยม", () => {
    expect(normalizeName("  ปากกา   เจล  ๐.๕  ")).toBe("ปากกา เจล 0 5");
  });

  it("ช่องว่างทุกชนิด (tab/newline/nbsp) ถูกยุบเป็นช่องว่างเดียว", () => {
    expect(normalizeName("แฟ้ม\tHorse\nNo.22 22")).toBe("แฟ้ม horse no 22 22");
  });

  it("ค่าว่าง/ช่องว่างล้วน → สตริงว่าง", () => {
    expect(normalizeName("   ")).toBe("");
    expect(normalizeName("")).toBe("");
  });
});

describe("invariant A-2 — คลังรับเฉพาะ human_verified", () => {
  it("canSaveToLibrary เป็นจริงเฉพาะ human_verified", () => {
    expect(canSaveToLibrary("human_verified")).toBe(true);
    expect(canSaveToLibrary("ai_draft")).toBe(false);
    expect(canSaveToLibrary("manual")).toBe(false);
    expect(canSaveToLibrary("library")).toBe(false);
  });

  it.each(["ai_draft", "manual", "library"] as CatalogItemSource[])(
    "upsertProductFromItem ปฏิเสธ source=%s โดยไม่แตะ DB",
    async (source) => {
      const res = await upsertProductFromItem(forbiddenClient, "o1", makeItem(source), "u1");
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.reason).toBe(LIBRARY_REJECT_MESSAGE);
    },
  );
});

describe("buildProductPayloadFromItem", () => {
  const payload = buildProductPayloadFromItem(makeItem("human_verified"));

  it("ไม่คัดลอก ai_warnings เข้าคลัง (C-B1)", () => {
    expect(Object.keys(payload)).not.toContain("ai_warnings");
    expect(JSON.stringify(payload)).not.toContain("ไม่แน่ใจรหัสรุ่น");
  });

  it("ไม่คัดลอก image_path (คนละ prefix — server-set ที่ route)", () => {
    expect(Object.keys(payload)).not.toContain("image_path");
  });

  it("คัดลอก caution_notes + ตัด element ว่างของ bullets", () => {
    expect(payload.caution_notes).toEqual(["ห้ามโดนน้ำ"]);
    expect(payload.bullets).toEqual(["กาวติดแน่น"]);
    expect(payload.default_unit).toBe("แพ็ค");
  });
});

describe("applyProductToItem", () => {
  const product: CatalogProduct = {
    id: "p1",
    org_id: "o1",
    name: "ปากกาเจล",
    name_key: "ปากกาเจล",
    brand_model: "Pentel BLN-105",
    spec_line: null,
    size_line: null,
    bullets: ["เขียนลื่น"],
    care_notes: [],
    caution_notes: [],
    sub_items: [],
    category: "เครื่องเขียน",
    default_unit: "ด้าม",
    image_path: "o1/products/p1/x.png",
    last_unit_price: 15,
    price_updated_at: null,
    price_updated_by: null,
    times_used: 3,
    last_used_at: null,
    created_by: "u1",
    created_at: "2026-07-22T00:00:00Z",
    updated_at: "2026-07-22T00:00:00Z",
  };

  it("ตั้ง source=library + price_basis='คลังสินค้า' + price_confidence=null (C-B2)", () => {
    const patch = applyProductToItem(product);
    expect(patch.source).toBe("library");
    expect(patch.price_basis).toBe("คลังสินค้า");
    expect(patch.price_confidence).toBeNull();
    expect(patch.unit_price_ref).toBe(15);
    expect(patch.ai_warnings).toEqual([]);
  });
});
