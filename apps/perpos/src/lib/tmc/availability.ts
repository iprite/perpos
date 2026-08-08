/**
 * เช็คห้องว่างให้ผู้ช่วยขาย TMC — อ่านจาก "รายการการเข้าพัก" (tmc_stays) ที่ทีมบันทึกอยู่แล้ว
 *
 * flow: ลูกค้าถามพร้อมวันที่ → extractStayDates() ให้ Gemini แกะวันที่ (รู้วันนี้จริง) →
 *       checkAvailability() ดูว่าหลังไหนชนคิวบ้าง → ยัดเป็นบล็อกข้อความเข้า prompt ของ RAG
 *
 * ⚠️ **ห้ามคำนวณราคาในไฟล์นี้** — ราคาต้องมาจากคลังความรู้เท่านั้น (invariant ของฟีเจอร์)
 *    โค้ดมีหน้าที่บอก "ว่าง/ไม่ว่าง" + "คืนนั้นตรงกับวันอะไร" แล้วให้โมเดลไปหยิบเรทจากคลังเอง
 *    (เดิมโมเดลเดาวันในสัปดาห์เองแล้วตอบราคาผิด 4,000 บาท/คืน — ตอนนี้โค้ดคำนวณให้แทน)
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordGeminiFromMetadata } from "@/lib/usage/record";
import { GRAND_NAME, VILLA_NAME } from "./villa-naming";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL = "gemini-2.5-flash";
const TZ = "Asia/Bangkok";

/**
 * รหัสห้องในระบบ ↔ ชื่อที่ลูกค้าเรียก
 * ยืนยันโดยเจ้าของ 2026-08-01 — ห้ามเดาเอง ผิด = บอกลูกค้าผิดหลัง
 */
export const RENTABLE_VILLAS: {
  code: string;
  name: string;
  short: string;
  /** หลังที่พาสัตว์เลี้ยงเข้าพักได้ — ชื่อที่ลูกค้าเห็นเหมือนวิลล่าหลังอื่น (ดู villa-naming.ts) */
  petFriendly?: boolean;
}[] = [
  { code: "TMC7", name: GRAND_NAME, short: "5 ห้องนอน" },
  { code: "TMC1", name: VILLA_NAME, short: "4 ห้องนอน" },
  { code: "TMC5", name: VILLA_NAME, short: "4 ห้องนอน", petFriendly: true },
];

export interface StayDates {
  checkIn: string; // YYYY-MM-DD
  checkOut: string;
  nights: number;
  guests: number | null;
}

export interface VillaAvailability {
  code: string;
  name: string;
  short: string;
  available: boolean;
  petFriendly?: boolean;
}

export interface AvailabilityResult {
  dates: StayDates;
  villas: VillaAvailability[];
  /** วันในสัปดาห์ของแต่ละคืนที่เข้าพัก (ไทย) — ให้โมเดลใช้เลือกเรทถูกวัน */
  nightWeekdays: string[];
}

function todayBangkok(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ }); // YYYY-MM-DD
}

function thaiWeekday(iso: string): string {
  return new Date(`${iso}T00:00:00+07:00`).toLocaleDateString("th-TH", {
    weekday: "long",
    timeZone: TZ,
  });
}

function thaiDate(iso: string): string {
  return new Date(`${iso}T00:00:00+07:00`).toLocaleDateString("th-TH", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: TZ,
  });
}

/** ข้อความนี้ "อาจ" ถามเรื่องห้องว่างไหม — เช็คด้วยสตริงล้วน กันเรียก AI ทุกข้อความ */
const DATE_MARKERS = [
  "ว่าง",
  "จอง",
  "เข้าพัก",
  "คืนวัน",
  "วันที่",
  "เดือน",
  "พรุ่งนี้",
  "มะรืน",
  "เสาร์",
  "อาทิตย์",
  "ศุกร์",
  "ปีใหม่",
  "สงกรานต์",
  "ม.ค",
  "ก.พ",
  "มี.ค",
  "เม.ย",
  "พ.ค",
  "มิ.ย",
  "ก.ค",
  "ส.ค",
  "ก.ย",
  "ต.ค",
  "พ.ย",
  "ธ.ค",
];

export function mightAskAvailability(text: string): boolean {
  return DATE_MARKERS.some((m) => text.includes(m));
}

/** ให้ Gemini แกะวันที่จากภาษาพูด (รู้ "วันนี้" จริง จึงตีความ "เสาร์นี้/พรุ่งนี้" ได้) */
export async function extractStayDates(question: string): Promise<StayDates | null> {
  const key = process.env.GEMINI_API_KEY ?? "";
  if (!key) return null;

  const today = todayBangkok();
  const prompt = `วันนี้คือ ${thaiDate(today)} (${today})

ลูกค้าพิมพ์มาว่า: "${question}"

แกะวันที่เข้าพักจากข้อความ ตอบ JSON เท่านั้น
{"checkIn":"YYYY-MM-DD","checkOut":"YYYY-MM-DD","nights":1,"guests":null}

กติกา
- ใช้ปฏิทินคริสต์ศักราชใน checkIn/checkOut เสมอ (ถ้าลูกค้าบอก พ.ศ. ให้ลบ 543)
- ถ้าบอกแค่วันเข้าพักวันเดียว ให้ถือว่าพัก 1 คืน (checkOut = วันถัดไป)
- "เสาร์นี้/พรุ่งนี้/สุดสัปดาห์นี้" ให้คิดจากวันที่วันนี้ข้างบน
- ถ้าไม่ได้ระบุปี ให้เลือกปีที่ทำให้วันที่นั้นอยู่ในอนาคตที่ใกล้ที่สุด
- guests = จำนวนผู้เข้าพักถ้าระบุ ไม่ระบุใส่ null
- **ถ้าข้อความไม่มีวันที่เข้าพักที่ชัดเจนพอ ให้ตอบ {"checkIn":null}** ห้ามเดา`;

  const res = await fetch(`${GEMINI_BASE}/${MODEL}:generateContent?key=${key}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 200,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  }).catch(() => null);
  if (!res?.ok) return null;

  const json = (await res.json().catch(() => null)) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      thoughtsTokenCount?: number;
    };
  } | null;
  // org มาจาก ambient context ของ tmc webhook (จุดเรียกเดียวของฟังก์ชันนี้)
  void recordGeminiFromMetadata({ feature: "tmc.sales_bot" }, MODEL, json?.usageMetadata, {
    step: "extract_stay_dates",
  });
  const raw = (json?.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");

  try {
    const d = JSON.parse(raw) as Partial<StayDates>;
    const iso = /^\d{4}-\d{2}-\d{2}$/;
    if (!d.checkIn || !iso.test(d.checkIn)) return null;
    if (!d.checkOut || !iso.test(d.checkOut)) return null;
    if (d.checkOut <= d.checkIn) return null;
    // กันวันที่เพี้ยน: ต้องไม่ใช่อดีต และไม่ไกลเกิน 2 ปี
    const today0 = todayBangkok();
    if (d.checkIn < today0) return null;
    const maxDate = new Date(Date.now() + 730 * 86400_000).toISOString().slice(0, 10);
    if (d.checkIn > maxDate) return null;

    const nights = Math.round(
      (Date.parse(`${d.checkOut}T00:00:00Z`) - Date.parse(`${d.checkIn}T00:00:00Z`)) / 86400_000,
    );
    return {
      checkIn: d.checkIn,
      checkOut: d.checkOut,
      nights,
      guests: typeof d.guests === "number" ? d.guests : null,
    };
  } catch {
    return null;
  }
}

/**
 * หลังไหนว่างในช่วงนั้น — ชนกันเมื่อ (คิวเดิมเข้าก่อนเราออก) และ (คิวเดิมออกหลังเราเข้า)
 * วันเช็คเอาท์ของคิวเดิม = วันเช็คอินของเราได้ (ไม่ถือว่าชน)
 */
export async function checkAvailability(
  admin: SupabaseClient,
  orgId: string,
  dates: StayDates,
): Promise<AvailabilityResult> {
  const { data: props } = await admin
    .from("tmc_properties")
    .select("id, code")
    .eq("org_id", orgId)
    .eq("is_active", true);
  const byId = new Map(
    ((props ?? []) as { id: string; code: string }[]).map((p) => [p.id, p.code]),
  );

  const { data: stays } = await admin
    .from("tmc_stays")
    .select("property_id, check_in, check_out")
    .eq("org_id", orgId)
    .lt("check_in", dates.checkOut)
    .gt("check_out", dates.checkIn);

  const busy = new Set(
    ((stays ?? []) as { property_id: string }[])
      .map((s) => byId.get(s.property_id))
      .filter((c): c is string => !!c),
  );

  const nightWeekdays: string[] = [];
  for (let d = new Date(`${dates.checkIn}T00:00:00+07:00`); ; d.setDate(d.getDate() + 1)) {
    const iso = d.toLocaleDateString("en-CA", { timeZone: TZ });
    if (iso >= dates.checkOut) break;
    nightWeekdays.push(`คืน ${thaiDate(iso)}`);
  }

  return {
    dates,
    nightWeekdays,
    villas: RENTABLE_VILLAS.map((v) => ({ ...v, available: !busy.has(v.code) })),
  };
}

/** บล็อกข้อความที่ยัดเข้า prompt ให้โมเดลใช้ตอบ (โมเดลหยิบราคาจากคลังความรู้เอง) */
export function availabilityBlock(a: AvailabilityResult): string {
  const L: string[] = [];
  L.push("ข้อมูลห้องว่างจากระบบจองจริง ณ ขณะนี้ (เชื่อถือได้ ใช้ตอบลูกค้าได้เลย)");
  L.push(
    `ช่วงที่ลูกค้าถาม: ${thaiDate(a.dates.checkIn)} ถึง ${thaiDate(a.dates.checkOut)} · ${a.dates.nights} คืน`,
  );
  if (a.dates.guests) L.push(`จำนวนผู้เข้าพักที่ลูกค้าแจ้ง: ${a.dates.guests} ท่าน`);
  L.push("วันในสัปดาห์ของคืนที่เข้าพัก (ใช้เลือกเรทราคาให้ถูกวัน):");
  for (const n of a.nightWeekdays) L.push(`  - ${n}`);
  L.push("สถานะห้องว่าง:");
  // บ้าน 4 ห้องนอนมีหลายหลังแต่ลูกค้าเห็นเป็นแบบเดียว → รวมเป็นบรรทัดเดียวว่าว่างกี่หลัง
  const groups = new Map<string, { total: number; free: number }>();
  for (const v of a.villas) {
    const g = groups.get(v.name) ?? { total: 0, free: 0 };
    g.total += 1;
    if (v.available) g.free += 1;
    groups.set(v.name, g);
  }
  for (const [name, g] of Array.from(groups)) {
    if (g.total === 1) {
      L.push(`  - ${name}: ${g.free ? "ว่าง" : "ไม่ว่าง (มีคิวจองแล้ว)"}`);
    } else {
      L.push(
        `  - ${name}: ${g.free ? `ว่าง ${g.free} หลัง (จากทั้งหมด ${g.total} หลัง)` : "ไม่ว่าง (มีคิวจองแล้ว)"}`,
      );
    }
  }
  // ข้อมูลภายในสำหรับตอบเฉพาะเคสพาสัตว์เลี้ยง — ห้ามหลุดไปในคำตอบถ้าลูกค้าไม่ได้ถาม
  const pet = a.villas.find((v) => v.petFriendly);
  if (pet) {
    L.push(
      `(ข้อมูลภายใน ห้ามบอกลูกค้าถ้าไม่ได้ถามเรื่องสัตว์เลี้ยง) หลังที่พาสัตว์เลี้ยงเข้าพักได้: ${pet.available ? "ว่าง" : "ไม่ว่าง"}`,
    );
  }
  return L.join("\n");
}

export { thaiDate, thaiWeekday, todayBangkok };
