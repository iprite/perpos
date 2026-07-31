// ชนิดข้อมูลของคลัง TMC — ใช้ร่วมกันระหว่างหน้าและ component ย่อย
// อ้างอิงโครง: specs/tmc-stock-v2.md §3

export type StockClass = "consumable" | "reusable";

export type StockItem = {
  id: string;
  name: string;
  unit: string;
  current_qty: number;
  min_quantity: number;
  category: string | null;
  stock_class: StockClass;
  item_group: string | null;
  default_location_id: string | null;
};

export type StockLocation = {
  id: string;
  code: string;
  name: string;
  kind: "warehouse" | "property" | "laundry" | "linen_room" | "soiled" | "kitchen" | "store";
  is_external: boolean;
  is_default: boolean;
  is_active: boolean;
  sort_order: number;
};

export type StockBalance = {
  item_id: string;
  location_id: string;
  qty: number;
};

export type Movement = {
  id: string;
  movement_type: string;
  quantity: number;
  property_code: string | null;
  reason: string | null;
  note: string | null;
  created_at: string;
  tmc_stock_items: { name: string; unit: string } | null;
  from_location: { code: string; name: string } | null;
  to_location: { code: string; name: string } | null;
};

/** ชื่อไทยของกลุ่มสินค้า — ใช้เป็นตัวกรองในแท็บของใช้แล้วหมดไป */
export const GROUP_LABELS: Record<string, string> = {
  amenity: "ของใช้ในห้อง",
  fnb: "อาหาร/เครื่องดื่ม",
  cleaning: "ทำความสะอาด",
  maintenance: "ซ่อมบำรุง",
  linen: "ผ้า",
  bedding: "เครื่องนอน",
  equipment: "อุปกรณ์",
};

export const MOVEMENT_LABELS: Record<
  string,
  { label: string; tone: "success" | "danger" | "info" | "warning" | "neutral" }
> = {
  in: { label: "รับเข้า", tone: "success" },
  receive: { label: "รับเข้า", tone: "success" },
  out: { label: "เบิกออก", tone: "danger" },
  issue: { label: "เบิกใช้", tone: "danger" },
  transfer: { label: "ย้ายที่", tone: "info" },
  send_wash: { label: "ส่งซัก", tone: "info" },
  return_wash: { label: "รับคืนผ้าซัก", tone: "success" },
  consume: { label: "ใช้ไป", tone: "danger" },
  retire: { label: "ตัดทิ้ง", tone: "warning" },
  lost: { label: "สูญหาย", tone: "warning" },
  sale: { label: "ขายให้แขก", tone: "info" },
  adjust: { label: "ปรับยอด", tone: "neutral" },
};
