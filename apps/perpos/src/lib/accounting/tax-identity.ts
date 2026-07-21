/**
 * tax-identity.ts — ด่านกัน "ใบกำกับภาษีที่ใช้ไม่ได้" ออกจากระบบ
 *
 * ม.86/4 บังคับว่าใบกำกับภาษีต้องมี ชื่อ-ที่อยู่-เลขประจำตัวผู้เสียภาษี ของ **ผู้ขาย**
 * (พร้อมระบุสำนักงานใหญ่/สาขา) และ ชื่อ-ที่อยู่ ของ **ผู้ซื้อ** — ขาดข้อใดข้อหนึ่ง
 * ผู้ซื้อนำไปเครดิตภาษีซื้อไม่ได้ และผู้ขายมีความผิด
 *
 * ก่อนหน้านี้ระบบยอมให้ออกใบกำกับทั้งที่ org ยังไม่ได้กรอกตั้งค่าบริษัท → ได้เอกสาร
 * ที่พิมพ์เลขผู้เสียภาษีเป็น `0000000000000` และที่อยู่ placeholder ออกไปให้ลูกค้าจริง
 * (snapshot freeze ตอนออก → แก้ตั้งค่าทีหลังก็ไม่ช่วย ต้องยกเลิกแล้วออกใหม่)
 */

export interface PartyIdentity {
  name?: string | null;
  address?: string | null;
  tax_id?: string | null;
  branch?: string | null;
}

/**
 * เลขประจำตัวผู้เสียภาษีไทย = 13 หลัก
 * ตัวเลขซ้ำตัวเดียวทั้งหมด (0000000000000 / 1111111111111) = ค่า placeholder ไม่ใช่เลขจริง
 */
export function isValidThaiTaxId(value: string | null | undefined): boolean {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length !== 13) return false;
  if (/^(\d)\1{12}$/.test(digits)) return false;
  return true;
}

function isBlank(v: string | null | undefined): boolean {
  return String(v ?? "").trim().length === 0;
}

/** ที่อยู่ที่ seed ไว้เป็นตัวอย่าง — ห้ามหลุดไปอยู่บนเอกสารภาษี */
function looksLikePlaceholderAddress(v: string | null | undefined): boolean {
  const s = String(v ?? "");
  return s.includes("[ตัวอย่าง") || s.includes("แทนที่ด้วยที่อยู่จริง");
}

/**
 * ตรวจข้อมูลผู้ขาย (จาก acc_org_settings) — คืนรายการสิ่งที่ยังขาด (ว่าง = ผ่าน)
 * ข้อความเป็นภาษาไทยพร้อมโชว์ให้ผู้ใช้ตรงๆ
 */
export function missingSellerIdentity(seller: PartyIdentity): string[] {
  const missing: string[] = [];
  if (isBlank(seller.name)) missing.push("ชื่อบริษัท/ผู้ประกอบการ");
  if (isBlank(seller.address) || looksLikePlaceholderAddress(seller.address))
    missing.push("ที่อยู่ตามหนังสือรับรอง");
  if (!isValidThaiTaxId(seller.tax_id)) missing.push("เลขประจำตัวผู้เสียภาษี (13 หลัก)");
  if (isBlank(seller.branch)) missing.push("สำนักงานใหญ่/สาขา");
  return missing;
}

/**
 * ตรวจข้อมูลผู้ซื้อ (จาก acc_contacts) — ม.86/4 (4) ต้องมีชื่อ+ที่อยู่
 * เลขผู้เสียภาษีของผู้ซื้อไม่บังคับ (ผู้ซื้อรายย่อยไม่มี) แต่ถ้ากรอกมาต้องเป็นเลขจริง
 */
export function missingBuyerIdentity(buyer: PartyIdentity): string[] {
  const missing: string[] = [];
  if (isBlank(buyer.name)) missing.push("ชื่อผู้ซื้อ");
  if (isBlank(buyer.address)) missing.push("ที่อยู่ผู้ซื้อ");
  if (!isBlank(buyer.tax_id) && !isValidThaiTaxId(buyer.tax_id))
    missing.push("เลขประจำตัวผู้เสียภาษีของผู้ซื้อ (ต้องเป็น 13 หลัก)");
  return missing;
}

/** snapshot ที่ buildPartySnapshot สร้าง — ใช้ตรวจก่อน insert */
export interface PartySnapshotShape {
  seller_name?: string | null;
  seller_address?: string | null;
  seller_tax_id?: string | null;
  seller_branch?: string | null;
  buyer_name?: string | null;
  buyer_address?: string | null;
  buyer_tax_id?: string | null;
  buyer_branch?: string | null;
}

/**
 * ตรวจ snapshot ทั้งใบก่อนออกเอกสารภาษี — คืนข้อความ error พร้อมใช้ (null = ผ่าน)
 * เรียกเฉพาะเอกสารที่เป็นหลักฐานภาษี (isTaxDocument) เท่านั้น
 */
export function validateTaxDocumentParties(snapshot: PartySnapshotShape): string | null {
  const seller = missingSellerIdentity({
    name: snapshot.seller_name,
    address: snapshot.seller_address,
    tax_id: snapshot.seller_tax_id,
    branch: snapshot.seller_branch,
  });
  if (seller.length > 0)
    return `ออกใบกำกับภาษีไม่ได้ — ตั้งค่าบริษัทยังไม่ครบตาม ม.86/4: ${seller.join(", ")} (ไปที่ บัญชี → ตั้งค่า)`;

  const buyer = missingBuyerIdentity({
    name: snapshot.buyer_name,
    address: snapshot.buyer_address,
    tax_id: snapshot.buyer_tax_id,
    branch: snapshot.buyer_branch,
  });
  if (buyer.length > 0)
    return `ออกใบกำกับภาษีไม่ได้ — ข้อมูลผู้ซื้อไม่ครบตาม ม.86/4: ${buyer.join(", ")} (แก้ที่ บัญชี → ลูกค้า/ผู้ขาย)`;

  return null;
}
