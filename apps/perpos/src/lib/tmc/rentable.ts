/**
 * ห้องที่ "เปิดขาย" ของ TMC — แหล่งนิยามเดียวของทั้งการ์ดรายวันและแดชบอร์ด
 *
 * เดิมใช้ธง `is_rentable` ตัวเดียว ⇒ วันที่กดเปิดห้องใหม่ ตัวหารของอัตราการเข้าพัก
 * **ทุกเดือนย้อนหลัง** จะกระโดดตามทันที (ส.ค. 3 ห้อง → 5 ห้อง ทั้งที่เดือนนั้นยังไม่ได้เปิดขาย)
 * จึงเพิ่ม `rentable_from` = วันแรกที่ห้องเปิดขายจริง · ว่าง = เปิดขายมาตลอด
 *
 * กฎ: ห้องนับเป็นเปิดขายในคืน D เมื่อ `is_active AND is_rentable AND (rentable_from is null OR D >= rentable_from)`
 * (ด่าน `is_active`/`is_rentable` อยู่ที่ query ของผู้เรียก — ที่นี่ตัดสินเฉพาะมิติวันที่)
 */

const DAY_MS = 86_400_000;

export type RentableProperty = { code: string; rentable_from?: string | null };

/** ห้องนี้เปิดขายในคืน `night` (YYYY-MM-DD) แล้วหรือยัง */
export function isOpenOn(p: RentableProperty, night: string): boolean {
  return !p.rentable_from || night >= p.rentable_from;
}

/** รหัสห้องที่เปิดขาย ณ วันที่ระบุ (คงลำดับตามที่ query ส่งมา) */
export function openCodesOn(props: RentableProperty[], night: string): string[] {
  return props.filter((p) => isOpenOn(p, night)).map((p) => p.code);
}

/**
 * ห้อง×คืนที่เปิดขายในช่วง `[startIso, endExIso)` — ตัวหารของอัตราการเข้าพัก
 * ห้องที่เปิดกลางช่วงนับเฉพาะคืนตั้งแต่วันเปิดเป็นต้นไป
 */
export function availableNightsIn(
  props: RentableProperty[],
  startIso: string,
  endExIso: string,
): number {
  let total = 0;
  for (let t = new Date(startIso).getTime(); t < new Date(endExIso).getTime(); t += DAY_MS) {
    const night = new Date(t).toISOString().slice(0, 10);
    total += props.reduce((n, p) => n + (isOpenOn(p, night) ? 1 : 0), 0);
  }
  return total;
}
