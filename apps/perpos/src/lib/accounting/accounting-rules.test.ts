/**
 * accounting-rules.test.ts — กฎที่ "ผิดแล้วเสียเงิน/ผิดกฎหมาย" ของโมดูลบัญชี
 *
 * เลือกเทสเฉพาะ logic บริสุทธิ์ (ไม่แตะ DB) ที่ความผิดพลาดมีราคาสูงจริง:
 *   • ยอดเงินบนเอกสาร (ส่วนลด/VAT/หัก ณ ที่จ่าย)     → ออกบิลผิด
 *   • กฎกันรายได้เบิ้ล (จุดรับรู้รายได้)               → งบผิด/เสียภาษีเกิน
 *   • state machine ของสถานะเอกสาร                    → หลักฐานภาษีเพี้ยน
 *   • เอกสารที่เครดิตภาษีซื้อได้/ไม่ได้                → ยื่น ภ.พ.30 ผิด
 *   • เลขนำหน้าเอกสาร                                  → เลขที่ใบกำกับผิดรูป
 *   • จำนวนเงินเป็นตัวอักษร                            → เอกสารไม่สมบูรณ์
 */
import { describe, it, expect } from "vitest";

import { computeDocument } from "./documents";
import { computePurchaseLines } from "./purchase-documents";
import { shouldPostSalesJournal, selectBillingDocuments, billingSign } from "./sales-journal";
import { bahtText } from "./document-html";
import {
  isTaxDocument,
  requiresRefDocument,
  canClaimPurchaseVat,
  type AccDocType,
  type AccPurchaseDocType,
} from "./types";
import { canTransitionDocStatus, isIssuedDoc, normalizeDocPrefix } from "@/app/api/accounting/_lib";

describe("computeDocument — ยอดบนเอกสารขาย", () => {
  it("VAT 7% + ไม่มีส่วนลด", () => {
    const r = computeDocument(
      [{ item_name: "A", qty: 10, unit_price: 100, discount: 0, discount_type: "amount" }],
      true,
      7,
      0,
    );
    expect(r.subtotal).toBe(1000);
    expect(r.vat_amount).toBe(70);
    expect(r.total).toBe(1070);
  });

  it("ส่วนลดแบบจำนวนเงิน หักออกจากยอดบรรทัด", () => {
    const r = computeDocument(
      [{ item_name: "A", qty: 1, unit_price: 3000, discount: 500, discount_type: "amount" }],
      true,
      7,
      0,
    );
    expect(r.subtotal).toBe(2500);
    expect(r.vat_amount).toBe(175);
  });

  it("ส่วนลดแบบ % คิดจากยอดก่อนหัก", () => {
    const r = computeDocument(
      [{ item_name: "A", qty: 2, unit_price: 1000, discount: 10, discount_type: "percent" }],
      false,
      7,
      0,
    );
    expect(r.subtotal).toBe(1800);
    expect(r.vat_amount).toBe(0);
  });

  it("หัก ณ ที่จ่ายคิดจากฐานก่อน VAT ไม่ใช่ยอดรวม", () => {
    const r = computeDocument(
      [{ item_name: "A", qty: 1, unit_price: 10000, discount: 0, discount_type: "amount" }],
      true,
      7,
      3,
    );
    expect(r.subtotal).toBe(10000);
    expect(r.vat_amount).toBe(700);
    expect(r.total).toBe(10700);
    // 3% ของ 10,000 (ไม่ใช่ 3% ของ 10,700)
    expect(r.wht_amount).toBe(300);
  });

  it("ยอดบรรทัดติดลบไม่ได้ (ส่วนลดมากกว่าราคา → 0)", () => {
    const r = computeDocument(
      [{ item_name: "A", qty: 1, unit_price: 100, discount: 999, discount_type: "amount" }],
      false,
      7,
      0,
    );
    expect(r.subtotal).toBe(0);
  });

  it("input ขยะ (NaN/ติดลบ/ไม่ใช่ array) ไม่ทำให้ยอดเพี้ยน", () => {
    expect(computeDocument(null, true, 7, 0).subtotal).toBe(0);
    const r = computeDocument(
      [{ item_name: "A", qty: -5, unit_price: Number.NaN, discount: 0, discount_type: "amount" }],
      true,
      7,
      0,
    );
    expect(r.subtotal).toBe(0);
  });

  it("carry หน่วยนับลงบรรทัด (ม.86/4 (5))", () => {
    const r = computeDocument(
      [
        {
          item_name: "A",
          qty: 1,
          unit_price: 10,
          discount: 0,
          discount_type: "amount",
          unit: " ชิ้น ",
        },
      ],
      false,
      7,
      0,
    );
    expect(r.lines[0].unit).toBe("ชิ้น");
  });
});

describe("computePurchaseLines — ยอดฝั่งซื้อยึดหน้าบิล", () => {
  it("ใช้ amount ที่ส่งมา (ตรงกับบิล) ไม่คำนวณทับ", () => {
    // บิลปัดเศษเอง: 3 × 33.33 = 99.99 แต่บิลพิมพ์ 100
    const r = computePurchaseLines([{ item_name: "A", qty: 3, unit_price: 33.33, amount: 100 }]);
    expect(r.subtotal).toBe(100);
  });

  it("ไม่ส่ง amount → คำนวณจาก qty × unit_price", () => {
    const r = computePurchaseLines([{ item_name: "A", qty: 3, unit_price: 10 }]);
    expect(r.subtotal).toBe(30);
  });
});

describe("shouldPostSalesJournal — กันรายได้เบิ้ล", () => {
  it("org จด VAT: ลงเฉพาะเอกสารภาษี", () => {
    for (const t of ["tax_invoice", "receipt_tax_invoice", "credit_note", "debit_note"])
      expect(shouldPostSalesJournal(t, true)).toBe(true);
    // ใบแจ้งหนี้/ใบเสร็จธรรมดา = เอกสารประกอบ ไม่ใช่จุดรับรู้ → ถ้าลงด้วยจะเบิ้ล
    for (const t of ["invoice", "receipt", "quotation", "billing_note", "delivery_note"])
      expect(shouldPostSalesJournal(t, true)).toBe(false);
  });

  it("org ไม่จด VAT: ลงใบแจ้งหนี้/ใบเสร็จแทน (ออกใบกำกับไม่ได้)", () => {
    expect(shouldPostSalesJournal("invoice", false)).toBe(true);
    expect(shouldPostSalesJournal("receipt", false)).toBe(true);
    expect(shouldPostSalesJournal("tax_invoice", false)).toBe(false);
    expect(shouldPostSalesJournal("quotation", false)).toBe(false);
  });
});

describe("selectBillingDocuments — ชุดเอกสารที่ใช้คิด KPI/ยอดขาย", () => {
  const doc = (
    o: Partial<{ id: string; doc_type: string; status: string; converted_from_id: string | null }>,
  ) => ({
    id: o.id ?? "x",
    doc_type: o.doc_type ?? "tax_invoice",
    status: o.status ?? "sent",
    converted_from_id: o.converted_from_id ?? null,
  });

  it("org จด VAT: นับใบกำกับ ไม่นับใบเสนอราคา/ใบแจ้งหนี้ประกอบ", () => {
    const r = selectBillingDocuments(
      [
        doc({ id: "a" }),
        doc({ id: "b", doc_type: "quotation" }),
        doc({ id: "c", doc_type: "invoice" }),
      ],
      true,
    );
    expect(r.map((d) => d.id)).toEqual(["a"]);
  });

  it("ฉบับร่าง/ยกเลิก ไม่เข้ายอด", () => {
    const r = selectBillingDocuments(
      [
        doc({ id: "a", status: "draft" }),
        doc({ id: "b", status: "void" }),
        doc({ id: "c", status: "paid" }),
      ],
      true,
    );
    expect(r.map((d) => d.id)).toEqual(["c"]);
  });

  // สายที่แปลงต่อกัน = ดีลเดียว ต้องนับใบเดียว — ยึด "ใบต้นทาง" ให้ตรงกับจุดที่ auto journal
  // รับรู้รายได้ (เอกสารภาษีใบแรกของสาย) ไม่งั้นการ์ดกับสมุดรายวันจะไม่ตรงกัน
  it("สายที่แปลงต่อกัน นับใบต้นทางใบเดียว (กันนับซ้ำ)", () => {
    const r = selectBillingDocuments(
      [doc({ id: "inv" }), doc({ id: "rc", converted_from_id: "inv" })],
      true,
    );
    expect(r.map((d) => d.id)).toEqual(["inv"]);
  });

  it("ต้นทางที่ไม่ได้อยู่ในชุด (ถูกกรอง/หน้าอื่น) ไม่ทำให้ปลายทางหาย", () => {
    const r = selectBillingDocuments([doc({ id: "rc", converted_from_id: "ไม่อยู่ในชุด" })], true);
    expect(r.map((d) => d.id)).toEqual(["rc"]);
  });

  it("billingSign: ใบลดหนี้หักออกจากยอด", () => {
    expect(billingSign("credit_note")).toBe(-1);
    expect(billingSign("tax_invoice")).toBe(1);
    expect(billingSign("debit_note")).toBe(1);
  });
});

describe("state machine ของสถานะเอกสาร (Phase 1.4)", () => {
  it("เดินหน้าได้ตามลำดับ", () => {
    expect(canTransitionDocStatus("draft", "sent")).toBe(true);
    expect(canTransitionDocStatus("sent", "paid")).toBe(true);
    expect(canTransitionDocStatus("accepted", "overdue")).toBe(true);
  });

  it("ย้อนหลังไม่ได้ — หลักฐาน/ยอดภาษีจะเพี้ยน", () => {
    expect(canTransitionDocStatus("sent", "draft")).toBe(false);
    expect(canTransitionDocStatus("paid", "sent")).toBe(false);
  });

  it("paid / void = สถานะจบ", () => {
    expect(canTransitionDocStatus("paid", "void")).toBe(false);
    expect(canTransitionDocStatus("void", "draft")).toBe(false);
  });

  it("ตั้งค่าเดิมซ้ำได้ (no-op)", () => {
    expect(canTransitionDocStatus("paid", "paid")).toBe(true);
  });

  it("เอกสารที่ออกแล้ว = ทุกสถานะที่ไม่ใช่ draft", () => {
    expect(isIssuedDoc("draft")).toBe(false);
    for (const s of ["sent", "accepted", "paid", "overdue", "void"])
      expect(isIssuedDoc(s)).toBe(true);
  });
});

describe("ชนิดเอกสาร — กฎภาษี", () => {
  it("เอกสารภาษีต้องพิมพ์ครบ ม.86/4", () => {
    for (const t of ["tax_invoice", "receipt_tax_invoice", "credit_note", "debit_note"])
      expect(isTaxDocument(t as AccDocType)).toBe(true);
    for (const t of ["quotation", "invoice", "receipt", "billing_note", "delivery_note"])
      expect(isTaxDocument(t as AccDocType)).toBe(false);
  });

  it("ใบลด/เพิ่มหนี้ต้องอ้างใบกำกับเดิม (ม.86/10, 86/9)", () => {
    expect(requiresRefDocument("credit_note")).toBe(true);
    expect(requiresRefDocument("debit_note")).toBe(true);
    expect(requiresRefDocument("tax_invoice")).toBe(false);
  });

  it("ใบเสร็จ/ใบกำกับอย่างย่อ เครดิตภาษีซื้อไม่ได้", () => {
    expect(canClaimPurchaseVat("tax_invoice")).toBe(true);
    expect(canClaimPurchaseVat("receipt_tax_invoice")).toBe(true);
    expect(canClaimPurchaseVat("receipt" as AccPurchaseDocType)).toBe(false);
    expect(canClaimPurchaseVat("abbreviated_tax_invoice")).toBe(false);
  });
});

describe("normalizeDocPrefix — รหัสนำหน้าเลขเอกสาร (Phase 1.3)", () => {
  it("ตัดปี/ตัวคั่นท้ายที่ค้างจาก UI รุ่นเก่า", () => {
    expect(normalizeDocPrefix("QT-2026-", "QT")).toBe("QT");
    expect(normalizeDocPrefix("INV-2026", "INV")).toBe("INV");
    expect(normalizeDocPrefix("ivp2p-2026-", "TIV")).toBe("IVP2P");
  });

  it("ตัดอักขระที่ทำเลขเอกสารพัง + uppercase", () => {
    expect(normalizeDocPrefix("t i v!", "X")).toBe("TIV");
  });

  it("ว่าง/ขยะล้วน → ใช้ค่า default", () => {
    expect(normalizeDocPrefix("", "TIV")).toBe("TIV");
    expect(normalizeDocPrefix("   ", "TIV")).toBe("TIV");
    expect(normalizeDocPrefix("!!!", "TIV")).toBe("TIV");
    expect(normalizeDocPrefix(null, "TIV")).toBe("TIV");
  });
});

describe("bahtText — จำนวนเงินเป็นตัวอักษร", () => {
  it("จำนวนเต็ม", () => {
    expect(bahtText(0)).toBe("ศูนย์บาทถ้วน");
    expect(bahtText(1)).toBe("หนึ่งบาทถ้วน");
    expect(bahtText(21)).toBe("ยี่สิบเอ็ดบาทถ้วน");
    expect(bahtText(100)).toBe("หนึ่งร้อยบาทถ้วน");
    expect(bahtText(4494)).toBe("สี่พันสี่ร้อยเก้าสิบสี่บาทถ้วน");
  });

  it("มีสตางค์", () => {
    expect(bahtText(1.5)).toBe("หนึ่งบาทห้าสิบสตางค์");
    expect(bahtText(898.8)).toBe("แปดร้อยเก้าสิบแปดบาทแปดสิบสตางค์");
  });

  it("หลักล้าน", () => {
    expect(bahtText(1_000_000)).toBe("หนึ่งล้านบาทถ้วน");
  });
});
