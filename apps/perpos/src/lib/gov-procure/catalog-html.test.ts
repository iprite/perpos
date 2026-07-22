import { describe, it, expect } from "vitest";
import {
  buildCatalogHtml,
  buildCatalogFooterTemplate,
  esc,
  isValidLogoDataUrl,
  safeImageSrc,
  MAX_LOGO_DATA_URL_BYTES,
} from "./catalog-html";
import type { Catalog, CatalogItem, CatalogTemplate } from "./catalog";

const XSS_NAME = `<script>alert(1)</script>`;
const XSS_ATTR = `" onerror="alert(1)`;
const XSS_URL = `javascript:alert(1)`;

function makeCatalog(over: Partial<Catalog> = {}): Catalog {
  return {
    id: "c1",
    org_id: "o1",
    order_id: null,
    title: "แคตตาล็อกสินค้า",
    company: "89 Global Work",
    template: "table" as CatalogTemplate,
    show_prices: false,
    status: "review",
    letterhead_snapshot: {
      company_name: "บริษัท 89 โกลบอลเวิร์ค จำกัด",
      address_lines: ["95/2 ตำบลบางน้ำ อำเภอเมืองสมุทรปราการ"],
      phone: "094-6466282",
      tax_id: "0115563009857",
      logo_data_url: null,
    },
    notes: null,
    last_exported_at: null,
    created_by: "u1",
    created_at: "2026-07-22T00:00:00Z",
    updated_at: "2026-07-22T00:00:00Z",
    ...over,
  };
}

function makeItem(over: Partial<CatalogItem> = {}): CatalogItem {
  return {
    id: "i1",
    org_id: "o1",
    catalog_id: "c1",
    seq_no: 1,
    name_raw: "ปากกา",
    name: "ปากกาเจล",
    brand_model: "Pentel BLN-105",
    spec_line: "ปากกาหมึกเจล 0.5 มม.",
    size_line: "ขนาด 0.5 มม.",
    bullets: ["เขียนลื่น"],
    care_notes: ["เก็บในที่แห้ง"],
    caution_notes: ["ห้ามเด็กเล็กเล่น"],
    ai_warnings: ["AI ไม่มั่นใจรหัสรุ่นนี้"],
    sub_items: [],
    category: "เครื่องเขียน",
    qty: 12,
    unit: "ด้าม",
    image_path: null,
    unit_price_ref: 15,
    price_min: null,
    price_max: null,
    price_basis: "ผู้ใช้กรอก",
    price_confidence: null,
    price_updated_by: null,
    price_updated_at: null,
    price_history: [],
    source: "human_verified",
    confidence: 0.9,
    ai_note: null,
    verified_by: "u1",
    verified_at: "2026-07-22T00:00:00Z",
    viewed_at: "2026-07-22T00:00:00Z",
    enrich_state: "done",
    enrich_claimed_at: null,
    enrich_job_id: null,
    enrich_error: null,
    product_id: null,
    created_at: "2026-07-22T00:00:00Z",
    updated_at: "2026-07-22T00:00:00Z",
    ...over,
  };
}

describe("esc()", () => {
  it("escape ตัวอักษรอันตรายครบทั้ง text และ attribute context", () => {
    expect(esc(XSS_NAME)).toBe("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(esc(XSS_ATTR)).toBe("&quot; onerror=&quot;alert(1)");
    expect(esc(`'"`)).toBe("&#39;&quot;");
    expect(esc(null)).toBe("");
  });
});

describe("XSS — ค่าผู้ใช้/AI ทุกช่องถูก escape", () => {
  const items = [
    makeItem({
      name: XSS_NAME,
      bullets: [XSS_NAME, XSS_ATTR],
      price_basis: XSS_NAME,
      spec_line: XSS_ATTR,
      caution_notes: [XSS_NAME],
      care_notes: [XSS_ATTR],
    }),
  ];

  it.each(["table", "narrative"] as CatalogTemplate[])(
    "เทมเพลต %s ไม่มี <script> ดิบและไม่มี onerror= ดิบ",
    (template) => {
      const html = buildCatalogHtml(makeCatalog({ template, show_prices: true }), items);
      expect(html).not.toContain("<script>");
      expect(html).not.toContain('onerror="');
      expect(html).toContain("&lt;script&gt;");
    },
  );

  it("attribute context ของ img (src/alt/title) ปลอดภัย", () => {
    const html = buildCatalogHtml(makeCatalog(), [makeItem({ id: "i9", name: XSS_ATTR })], {
      imageUrls: { i9: "https://example.com/a.png?token=1&x=2" },
    });
    expect(html).toContain('alt="&quot; onerror=&quot;alert(1)"');
    expect(html).toContain('title="&quot; onerror=&quot;alert(1)"');
    expect(html).toContain("a.png?token=1&amp;x=2");
  });

  it("URL รูปที่เป็น javascript: ถูกปฏิเสธ (แสดง placeholder แทน)", () => {
    expect(safeImageSrc(XSS_URL)).toBeNull();
    const html = buildCatalogHtml(makeCatalog(), [makeItem({ id: "i9" })], {
      imageUrls: { i9: XSS_URL },
    });
    expect(html).not.toContain("javascript:");
    expect(html).toContain("รอรูปสินค้า");
  });
});

describe("ai_warnings ห้ามขึ้นเอกสาร (C-B1)", () => {
  it.each(["table", "narrative"] as CatalogTemplate[])(
    "เทมเพลต %s ไม่มีข้อความจาก ai_warnings แต่ยังมี caution_notes",
    (template) => {
      const html = buildCatalogHtml(makeCatalog({ template }), [makeItem()]);
      expect(html).not.toContain("AI ไม่มั่นใจรหัสรุ่นนี้");
      expect(html).not.toContain("ai_warnings");
      if (template === "narrative") {
        expect(html).toContain("ข้อควรระวัง");
        expect(html).toContain("ห้ามเด็กเล็กเล่น");
      }
    },
  );
});

describe("โลโก้หัวจดหมาย (A-6)", () => {
  const goodLogo = "data:image/png;base64,AAAABBBB==";

  it("regex + ขนาด ≤500KB", () => {
    expect(isValidLogoDataUrl(goodLogo)).toBe(true);
    expect(isValidLogoDataUrl("data:image/svg+xml;base64,AAAA")).toBe(false);
    expect(isValidLogoDataUrl("https://evil.example/logo.png")).toBe(false);
    expect(isValidLogoDataUrl(`data:image/png;base64,${"A".repeat(MAX_LOGO_DATA_URL_BYTES)}`)).toBe(
      false,
    );
    expect(isValidLogoDataUrl(null)).toBe(false);
  });

  it("โลโก้ที่ไม่ผ่าน regex ไม่ถูกพิมพ์ลงเอกสาร", () => {
    const cat = makeCatalog({
      template: "narrative",
      letterhead_snapshot: {
        company_name: "บริษัททดสอบ",
        address_lines: ["ที่อยู่"],
        phone: null,
        tax_id: null,
        logo_data_url: "javascript:alert(1)",
      },
    });
    const html = buildCatalogHtml(cat, [makeItem()]);
    expect(html).not.toContain("javascript:alert(1)");
    expect(html).toContain("บริษัททดสอบ");
  });

  it("โลโก้ที่ผ่าน regex ถูกพิมพ์", () => {
    const cat = makeCatalog({
      template: "narrative",
      letterhead_snapshot: {
        company_name: "บริษัททดสอบ",
        address_lines: [],
        phone: null,
        tax_id: null,
        logo_data_url: goodLogo,
      },
    });
    expect(buildCatalogHtml(cat, [makeItem()])).toContain(goodLogo);
  });
});

describe("ลายน้ำฉบับร่าง (B-P1-6)", () => {
  it("มีบรรทัดเตือนเมื่อยังยืนยันไม่ครบ", () => {
    const html = buildCatalogHtml(makeCatalog(), [
      makeItem({ id: "a", source: "ai_draft" }),
      makeItem({ id: "b", seq_no: 2, source: "human_verified" }),
    ]);
    expect(html).toContain("ฉบับร่าง — ยังมี 1 รายการที่ยังไม่ผ่านการตรวจสอบ");
  });

  it("หายเองเมื่อยืนยันครบ", () => {
    const html = buildCatalogHtml(makeCatalog(), [makeItem({ source: "human_verified" })]);
    expect(html).not.toContain("ฉบับร่าง");
  });

  it("footer template ของ pdf-renderer ทำงานคู่กัน", () => {
    expect(buildCatalogFooterTemplate(3)).toContain("ยังมี 3 รายการ");
    expect(buildCatalogFooterTemplate(0)).not.toContain("ฉบับร่าง");
  });
});

describe("เทมเพลต A — ตาราง", () => {
  it("6 คอลัมน์เมื่อไม่แสดงราคา · เพิ่ม 2 คอลัมน์ + แถวรวมเมื่อแสดงราคา", () => {
    const plain = buildCatalogHtml(makeCatalog(), [makeItem()]);
    expect(plain).toContain("คำอธิบายสินค้า");
    expect(plain).not.toContain("ราคา/หน่วย (฿)");
    expect(plain).not.toContain("รวมทั้งสิ้น");
    // เทมเพลต A ไม่มีหัวจดหมาย (ข้อมูลบริษัทไม่ถูกพิมพ์)
    expect(plain).not.toContain("บริษัท 89 โกลบอลเวิร์ค จำกัด");

    const priced = buildCatalogHtml(makeCatalog({ show_prices: true }), [makeItem()]);
    expect(priced).toContain("ราคา/หน่วย (฿)");
    expect(priced).toContain("รวมทั้งสิ้น");
    expect(priced).toContain("180.00"); // 12 × 15
  });

  it("page-break-inside มีทั้ง modern และ legacy · แถวยาวยอมให้ break", () => {
    const html = buildCatalogHtml(makeCatalog(), [
      makeItem({ bullets: Array.from({ length: 40 }, (_, i) => `ข้อ ${i + 1}`) }),
    ]);
    expect(html).toContain("page-break-inside: avoid");
    expect(html).toContain("break-inside: avoid");
    expect(html).toContain('class="item-row tall"');
  });
});
