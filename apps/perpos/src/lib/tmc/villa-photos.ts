/**
 * ส่งรูปห้องพักให้ลูกค้าใน LINE — ผู้ช่วยขาย TMC
 *
 * รูปมาจากเว็บ landing (repo iprite/tmc) นำเข้าด้วย `node scripts/tmc-import-landing.mjs`
 * เก็บไฟล์ต้นฉบับ .jpeg ไว้ใน Storage bucket `tmc-villa` (public)
 * — **LINE ส่งรูปได้เฉพาะ JPEG/PNG** ใช้ .webp ที่เว็บ build ออกมาไม่ได้
 *
 * ชื่อไฟล์เดิมไม่มีความหมาย (1.jpeg / DSC04857.jpeg) การจับคู่ "ขอรูปห้องนอน"
 * จึงพึ่ง `category` ที่ Gemini vision ติดให้ตอนนำเข้า
 */
import { publicVillaName } from "./villa-naming";
import type { SupabaseClient } from "@supabase/supabase-js";

/** ส่งได้สูงสุด 5 ข้อความต่อ 1 reply → ข้อความนำ 1 + รูป 4 */
export const MAX_PHOTOS = 4;

export interface VillaPhoto {
  villa_name: string;
  public_url: string;
  category: string;
  caption: string | null;
}

/** คำที่บ่งว่าลูกค้าอยากดูรูป */
const PHOTO_MARKERS = [
  "ขอรูป",
  "ขอดูรูป",
  "มีรูป",
  "ดูรูป",
  "ส่งรูป",
  "ขอภาพ",
  "ดูภาพ",
  "รูปห้อง",
  "รูปบ้าน",
  "รูปสระ",
  "ภาพห้อง",
  "photo",
  "picture",
];

export function wantsPhotos(text: string): boolean {
  const t = text.toLowerCase().replace(/\s+/g, "");
  return PHOTO_MARKERS.some((m) => t.includes(m.replace(/\s+/g, "")));
}

/** คำของลูกค้า → หมวดรูป (ต้องตรงกับหมวดที่สคริปต์นำเข้าใช้) */
const CATEGORY_HINTS: [string, string[]][] = [
  ["ห้องนอน", ["ห้องนอน", "เตียง", "มาสเตอร์", "bedroom", "ห้องพัก"]],
  ["ห้องน้ำ", ["ห้องน้ำ", "อาบน้ำ", "bathroom"]],
  ["สระว่ายน้ำ", ["สระ", "ว่ายน้ำ", "pool"]],
  ["ครัว", ["ครัว", "kitchen", "ทำอาหาร"]],
  ["ห้องนั่งเล่น", ["นั่งเล่น", "รับแขก", "living", "โซฟา"]],
  ["พื้นที่กินข้าว", ["กินข้าว", "โต๊ะอาหาร", "ทานข้าว", "dining"]],
  ["ภายนอก/สวน", ["สวน", "ข้างนอก", "ภายนอก", "รอบบ้าน", "หน้าบ้าน"]],
  ["วิว", ["วิว", "view", "ภูเขา"]],
];

/** คำของลูกค้า → หลังไหน (เรียงจากเฉพาะเจาะจงไปกว้าง — "วิลล่า" อยู่ในชื่อทุกหลัง) */
const VILLA_HINTS: [string, string[]][] = [
  ["thammachat-villa-pet-friendly", ["pet", "เพ็ท", "หมา", "สุนัข", "สัตว์เลี้ยง", "petfriendly"]],
  ["thammachat-grand", ["แกรนด์", "grand", "tmc7", "tmc 7", "5ห้องนอน", "5 ห้องนอน", "ห้าห้องนอน"]],
  ["thammachat-estate", ["เอสเตท", "estate"]],
  ["thammachat-villa", ["วิลล่า", "villa", "4ห้องนอน", "4 ห้องนอน", "สี่ห้องนอน"]],
];

function pick(text: string, table: [string, string[]][]): string | null {
  const t = text.toLowerCase().replace(/\s+/g, "");
  for (const [value, words] of table) {
    if (words.some((w) => t.includes(w.toLowerCase().replace(/\s+/g, "")))) return value;
  }
  return null;
}

export interface PhotoLookup {
  photos: VillaPhoto[];
  /** ยังไม่รู้ว่าลูกค้าหมายถึงหลังไหน — ต้องถามก่อน */
  askWhichVilla: boolean;
  villaNames: string[];
}

/**
 * หารูปให้ตรงกับที่ลูกค้าขอ
 * @param context ข้อความล่าสุด + บทสนทนาก่อนหน้า (ใช้เดาว่าหมายถึงหลังไหน)
 */
export async function findVillaPhotos(
  admin: SupabaseClient,
  orgId: string,
  question: string,
  context = "",
): Promise<PhotoLookup> {
  const { data: all } = await admin
    .from("tmc_villa_photos")
    .select("villa_slug, villa_name, public_url, category, caption, sort_order")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .order("sort_order");

  const rows = (all ?? []) as (VillaPhoto & { villa_slug: string; sort_order: number })[];
  // ชื่อที่โชว์ลูกค้าต้องผ่าน publicVillaName เสมอ (ห้ามเผยว่ามีหลัง Pet Friendly แยก)
  const villaNames = Array.from(new Set(rows.map((r) => publicVillaName(r.villa_name))));
  if (!rows.length) return { photos: [], askWhichVilla: false, villaNames };

  // หลังไหน: ดูจากคำถามก่อน ถ้าไม่ระบุค่อยดูจากบทสนทนาก่อนหน้า
  const slug = pick(question, VILLA_HINTS) ?? pick(context, VILLA_HINTS);
  if (!slug) return { photos: [], askWhichVilla: true, villaNames };

  const category = pick(question, CATEGORY_HINTS);
  let pool = rows.filter((r) => r.villa_slug === slug);
  if (category) {
    const inCat = pool.filter((r) => r.category === category);
    // ขอหมวดที่ไม่มีรูป → ส่งรูปรวมของหลังนั้นแทน ดีกว่าเงียบ
    if (inCat.length) pool = inCat;
  }

  return { photos: pool.slice(0, MAX_PHOTOS), askWhichVilla: false, villaNames };
}

/** ข้อความนำก่อนส่งรูป */
export function photoIntro(photos: VillaPhoto[], question: string): string {
  const villa = photos[0] ? publicVillaName(photos[0].villa_name) : "บ้านพัก";
  const cat = pick(question, CATEGORY_HINTS);
  const what = cat ? `รูป${cat}` : "รูปบรรยากาศ";
  return `ได้เลยครับ ส่ง${what}ของ ${villa} ให้ดูครับ 🌿\nหากอยากดูมุมไหนเพิ่มเติม บอกได้เลยครับ`;
}

export function askWhichVillaText(villaNames: string[]): string {
  return [
    "ได้เลยครับ ไม่ทราบว่าสนใจดูรูปของหลังไหนครับ",
    ...villaNames.map((n) => `• ${n}`),
    "",
    "แจ้งชื่อหลังที่สนใจ หรือบอกจำนวนผู้เข้าพักมาได้เลยครับ เดี๋ยวผมแนะนำให้ครับ",
  ].join("\n");
}
