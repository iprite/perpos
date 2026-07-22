// format.ts — ตัวช่วยจัดรูปแบบ + กฎการอ่านค่าของหน้าแคตตาล็อก (ไม่มี JSX ในไฟล์นี้)
// DESIGN §3 (เงิน tabular + `฿` ตามหลัง · `−` U+2212) · §14 (ไทยทั้งหมด)
// contract: §5.9 P1-4 (ป้าย "ประมาณการ" คงที่ ไม่ผูก confidence) · C-B4 (KPI นับจาก source จริง)

import type { CatalogItem, CatalogItemStats } from "@/lib/gov-procure/catalog";

/** ความเชื่อมั่นต่ำกว่านี้ = ต้องตรวจ (ตรงกับ verify-bulk/route.ts + getCatalogItemStats) */
export const RISKY_CONFIDENCE = 0.6;
/** ต่ำกว่านี้ = ป้ายประมาณการเติมเปอร์เซ็นต์ (P1-4) */
export const SHOW_PRICE_PCT_BELOW = 0.7;

const NUM = new Intl.NumberFormat("th-TH");
const MONEY = new Intl.NumberFormat("th-TH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function fmtNum(n: number | null | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return NUM.format(n);
}

/** เงิน — "1,234.56 ฿" · ไม่มีค่า = "—" · ยอดลบใช้ U+2212 */
export function fmtMoney(n: number | null | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  const sign = n < 0 ? "−" : "";
  return `${sign}${MONEY.format(Math.abs(n))} ฿`;
}

/** วัน-เวลาไทย (พ.ศ.) — "22 ก.ค. 2569 15:20" */
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** จำนวน + หน่วย ("200 แพ็ค") — เซลล์ผสมเลข+ไทย ห้ามใช้ prop `tabular` (DESIGN §5 ข้อ 8) */
export function fmtQty(qty: number | null, unit: string | null): string {
  if (typeof qty !== "number" || !Number.isFinite(qty)) return "—";
  return unit ? `${NUM.format(qty)} ${unit}` : NUM.format(qty);
}

/**
 * ป้ายกำกับราคา (P1-4) — ราคาที่มาจาก AI ติด "ประมาณการ" **เสมอ**
 * เติมเปอร์เซ็นต์เฉพาะเมื่อ `price_confidence < 0.7` ·
 * ราคาที่คนกรอก/ดึงจากคลัง (`price_confidence = null`) → ไม่มีป้าย (C-B2)
 */
export function priceEstimateLabel(item: CatalogItem): string | null {
  if (item.unit_price_ref === null) return null;
  const conf = item.price_confidence;
  if (typeof conf !== "number") return null;
  if (conf < SHOW_PRICE_PCT_BELOW) return `ประมาณการ ${Math.round(conf * 100)}%`;
  return "ประมาณการ";
}

/** แถวที่ AI กำลังถืออยู่ → ล็อกเฉพาะแถวนั้น (B4 / A-1) */
export function isItemLocked(item: CatalogItem): boolean {
  return item.enrich_state === "queued" || item.enrich_state === "running";
}

// ---------------------------------------------------------------------------
// "ต้องตรวจ" — คอลัมน์เดียวในตารางที่มีสี (P1-2)
// ---------------------------------------------------------------------------

export type IssueKey =
  | "no_bullets"
  | "no_image"
  | "no_price"
  | "low_price_conf"
  | "low_conf"
  | "ai_note";

export const ISSUE_LABELS: Record<IssueKey, string> = {
  no_bullets: "ไม่มีรายละเอียด",
  no_image: "ไม่มีรูป",
  no_price: "ไม่มีราคา",
  low_price_conf: "ราคาไม่มั่นใจ",
  low_conf: "ข้อมูลไม่มั่นใจ",
  ai_note: "AI มีหมายเหตุ",
};

/** เรียงตามความสำคัญ — ตารางแสดง 2 ใบแรก + `+n` */
export function computeIssues(item: CatalogItem): IssueKey[] {
  const out: IssueKey[] = [];
  if (item.bullets.length === 0) out.push("no_bullets");
  if (!item.image_path) out.push("no_image");
  if (item.unit_price_ref === null) out.push("no_price");
  if (typeof item.price_confidence === "number" && item.price_confidence < RISKY_CONFIDENCE)
    out.push("low_price_conf");
  if (typeof item.confidence === "number" && item.confidence < RISKY_CONFIDENCE)
    out.push("low_conf");
  if (item.ai_warnings.length > 0) out.push("ai_note");
  return out;
}

// ---------------------------------------------------------------------------
// แท็บกรอง — ชุดเดียวกับที่ verify-bulk ใช้ (tab/q/category)
// ---------------------------------------------------------------------------

export type WorkspaceTab = "todo" | "all" | "verified" | "no_image" | "risky_price";

export const TAB_LABELS: Record<WorkspaceTab, string> = {
  todo: "ต้องตรวจ",
  all: "ทั้งหมด",
  verified: "ยืนยันแล้ว",
  no_image: "ไม่มีรูป",
  risky_price: "ราคาน่าสงสัย",
};

export const TAB_ORDER: WorkspaceTab[] = ["todo", "all", "verified", "no_image", "risky_price"];

export function matchesTab(item: CatalogItem, tab: WorkspaceTab): boolean {
  switch (tab) {
    case "todo":
      return item.source !== "human_verified";
    case "verified":
      return item.source === "human_verified";
    case "no_image":
      return !item.image_path;
    case "risky_price":
      return typeof item.price_confidence === "number" && item.price_confidence < RISKY_CONFIDENCE;
    default:
      return true;
  }
}

// ---------------------------------------------------------------------------
// KPI ฝั่ง client — ใช้ได้เฉพาะเมื่อโหลดรายการครบ (ไม่ truncated)
// กฎเดียวกับ getCatalogItemStats (C-B4: ai_draft นับจาก source จริง)
// ---------------------------------------------------------------------------

export function computeStats(items: CatalogItem[]): CatalogItemStats {
  const s: CatalogItemStats = {
    total: 0,
    verified: 0,
    ai_draft: 0,
    library: 0,
    manual: 0,
    no_image: 0,
    low_conf: 0,
    low_price_conf: 0,
    no_price: 0,
    est_value: 0,
    not_viewed: 0,
    truncated: false,
  };

  for (const r of items) {
    s.total += 1;
    if (r.source === "human_verified") s.verified += 1;
    else if (r.source === "ai_draft") s.ai_draft += 1;
    else if (r.source === "library") s.library += 1;
    else s.manual += 1;

    if (!r.image_path) s.no_image += 1;
    if (typeof r.confidence === "number" && r.confidence < RISKY_CONFIDENCE) s.low_conf += 1;
    if (typeof r.price_confidence === "number" && r.price_confidence < RISKY_CONFIDENCE)
      s.low_price_conf += 1;
    if (r.unit_price_ref === null) s.no_price += 1;
    if (typeof r.qty === "number" && typeof r.unit_price_ref === "number")
      s.est_value += r.qty * r.unit_price_ref;
    if (!r.viewed_at) s.not_viewed += 1;
  }

  return s;
}

/** มูลค่าประมาณการของชุดที่กรองอยู่ (footer ตาราง) */
export function sumEstimatedValue(items: CatalogItem[]): number {
  return items.reduce(
    (sum, r) =>
      typeof r.qty === "number" && typeof r.unit_price_ref === "number"
        ? sum + r.qty * r.unit_price_ref
        : sum,
    0,
  );
}
