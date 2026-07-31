/**
 * นำเข้าข้อมูลห้องพัก + รูป จากเว็บ landing ของ TMC (repo iprite/tmc) เข้าคลังความรู้ผู้ช่วยขาย
 *
 *   node scripts/tmc-import-landing.mjs [--src /path/to/tmc] [--skip-photos] [--dry]
 *
 * ทำ 3 อย่าง
 *   1. อ่าน src/content/villas/*.md → เขียนเป็นบทความในคลังความรู้ (source='landing') + ฝัง embedding
 *   2. อัปโหลดรูปต้นฉบับ .jpeg เข้า Storage bucket `tmc-villa` (public)
 *      — LINE ส่งรูปได้เฉพาะ JPEG/PNG จึงใช้ไฟล์ต้นฉบับ ไม่ใช้ .webp ที่เว็บ build ออกมา
 *   3. ให้ Gemini vision จัดหมวด + เขียนคำบรรยายไทยให้ทุกรูป → ตาราง tmc_villa_photos
 *      — ชื่อไฟล์เดิมไม่มีความหมาย (1.jpeg / DSC04857.jpeg) ลูกค้าถาม "ขอรูปห้องนอน" จึงต้องพึ่ง AI
 *
 * รันซ้ำได้ (idempotent): บทความ upsert ตามหัวข้อ · รูปข้ามไฟล์ที่มีอยู่แล้ว
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(new URL("../apps/perpos/package.json", import.meta.url));
const { createClient } = require("@supabase/supabase-js");

const ORG_ID = "1f52618c-09c4-49c5-a929-ea5060f26e7d"; // TMC
const BUCKET = "tmc-villa";
const GEMINI = "https://generativelanguage.googleapis.com/v1beta/models";
const EMBED_MODEL = "gemini-embedding-001";
const VISION_MODEL = "gemini-2.5-flash";
const EMBED_DIM = 768;

/**
 * จุดที่ข้อมูลในเว็บ landing ขัดกับคลังความรู้เดิม (ถอดจากคลิปสอนขายของเจ้าของ)
 * เจ้าของยืนยัน 2026-08-01: **ยึดคลังเดิม** → ต้อง override ตอนนำเข้าทุกครั้ง
 * ไม่งั้นรันสคริปต์ซ้ำเมื่อไร ข้อมูลที่ขัดกันจะกลับเข้าคลังอีก
 */
const LANDING_OVERRIDES = {
  // เว็บมี 4 หลัง แต่ที่ขายผ่านช่องทางนี้มี 3 หลัง (ยังไม่รวมธรรมชาติ เอสเตท)
  excludeSlugs: ["thammachat-estate"],
  // เว็บเขียน "อาหารเช้าและอาหารเย็น (หมูกระทะ / บาร์บีคิว)" แต่ราคาที่ขายรวมเฉพาะอาหารเช้า
  meals: "รวมอาหารเช้า",
  amenityReplace: new Map([["บริการอาหารเช้า–เย็น", "บริการอาหารเช้า"]]),
};

/** หมวดรูปที่ลูกค้าถามถึงจริง — Gemini ต้องเลือกจากชุดนี้เท่านั้น ไม่งั้นหมวดงอกมั่ว */
const PHOTO_CATEGORIES = [
  "ห้องนอน",
  "ห้องน้ำ",
  "สระว่ายน้ำ",
  "ครัว",
  "ห้องนั่งเล่น",
  "พื้นที่กินข้าว",
  "ภายนอก/สวน",
  "วิว",
  "อื่นๆ",
];

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : d;
};
const SRC = opt("--src", "/Users/iprite/site/tmc");
const DRY = flag("--dry");
const SKIP_PHOTOS = flag("--skip-photos");

// ─── env ─────────────────────────────────────────────────────────────────────
const ENV = fs.readFileSync(
  new URL("../apps/perpos/.env.local", import.meta.url).pathname,
  "utf8",
);
const env = (k) =>
  ENV.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim().replace(/^["']|["']$/g, "") ?? "";
const GEMINI_KEY = env("GEMINI_API_KEY");
const supabase = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));

// ─── อ่าน frontmatter (พอสำหรับ schema ของ villas) ────────────────────────────
function parseVilla(file) {
  const raw = fs.readFileSync(file, "utf8");
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error(`frontmatter ไม่ถูกต้อง: ${file}`);
  const [, fm, body] = m;

  const out = { body: body.trim() };
  let listKey = null;
  for (const line of fm.split("\n")) {
    const listItem = line.match(/^\s+-\s+(.*)$/);
    if (listKey && listItem) {
      let v = listItem[1].trim();
      // amenities เป็น { icon: x, label: y } → เอาเฉพาะ label
      const label = v.match(/label:\s*([^}]+)\}?/);
      out[listKey].push((label ? label[1] : v).replace(/^["']|["']$/g, "").trim());
      continue;
    }
    const kv = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
    if (!kv) continue;
    const [, key, valRaw] = kv;
    const val = valRaw.trim();
    if (val === "" || val === "[]") {
      out[key] = val === "[]" ? [] : [];
      listKey = val === "[]" ? null : key;
      continue;
    }
    listKey = null;
    out[key] = /^-?\d+$/.test(val)
      ? Number(val)
      : val === "true"
        ? true
        : val === "false"
          ? false
          : val.replace(/^["']|["']$/g, "");
  }
  return out;
}

/** frontmatter → เนื้อหาบทความที่บอทเอาไปตอบลูกค้าได้ทันที */
function villaArticle(v) {
  const L = [];
  const th = v.nameTh || v.name;
  L.push(`${th} (${v.name})${v.code ? ` · รหัสห้อง ${v.code}` : ""}`);
  if (v.tagline) L.push(v.tagline);
  L.push("");
  L.push("จำนวนผู้เข้าพัก");
  if (v.guestsIncluded) L.push(`• ราคาเริ่มต้นรวม ${v.guestsIncluded} ท่าน`);
  L.push(`• เข้าพักได้สูงสุด ${v.maxGuests} ท่าน`);
  if (v.childrenMax) L.push(`• รองรับเด็กได้สูงสุด ${v.childrenMax} ท่าน`);
  if (v.units && v.units > 1) L.push(`• มีทั้งหมด ${v.units} ยูนิต`);
  if (v.petFriendly) L.push("• พาสัตว์เลี้ยงเข้าพักได้");

  if (v.meals) {
    L.push("");
    L.push(`อาหาร: ${v.meals}`);
  }
  if (v.amenities?.length) {
    L.push("");
    L.push("สิ่งอำนวยความสะดวก");
    for (const a of v.amenities) L.push(`• ${a}`);
  }
  if (v.highlights?.length) {
    L.push("");
    L.push("จุดเด่น");
    for (const h of v.highlights) L.push(`• ${h}`);
  }
  if (v.body) {
    L.push("");
    L.push(v.body.replace(/\n+/g, " ").trim());
  }
  return L.join("\n");
}

// ─── Gemini ──────────────────────────────────────────────────────────────────
async function embed(text, attempt = 0) {
  const res = await fetch(`${GEMINI}/${EMBED_MODEL}:embedContent?key=${GEMINI_KEY}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: `models/${EMBED_MODEL}`,
      content: { parts: [{ text }] },
      taskType: "RETRIEVAL_DOCUMENT",
      outputDimensionality: EMBED_DIM,
    }),
  });
  if (!res.ok) {
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      return embed(text, attempt + 1);
    }
    throw new Error(`embed ${res.status}: ${await res.text()}`);
  }
  return (await res.json()).embedding.values;
}

async function describePhoto(buf, villaName, attempt = 0) {
  const res = await fetch(`${GEMINI}/${VISION_MODEL}:generateContent?key=${GEMINI_KEY}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            { inline_data: { mime_type: "image/jpeg", data: buf.toString("base64") } },
            {
              text: `รูปนี้เป็นภาพของบ้านพัก "${villaName}" (พูลวิลล่าให้เช่าเหมาหลัง)
จัดหมวดรูปนี้ และเขียนคำบรรยายภาษาไทยสั้น ๆ ไม่เกิน 12 คำ ที่แอดมินจะใช้ส่งให้ลูกค้าดู
category ต้องเลือกจาก: ${PHOTO_CATEGORIES.join(" / ")}
ห้ามบรรยายสิ่งที่ไม่เห็นในรูป
ตอบ JSON เท่านั้น: {"category":"...","caption":"..."}`,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 200,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  });
  if (!res.ok) {
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
      return describePhoto(buf, villaName, attempt + 1);
    }
    throw new Error(`vision ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const j = await res.json();
  const raw = (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
  try {
    const d = JSON.parse(raw);
    return {
      category: PHOTO_CATEGORIES.includes(d.category) ? d.category : "อื่นๆ",
      caption: String(d.caption ?? "").slice(0, 120),
    };
  } catch {
    return { category: "อื่นๆ", caption: "" };
  }
}

// ─── main ────────────────────────────────────────────────────────────────────
const villaDir = path.join(SRC, "src/content/villas");
const files = fs.readdirSync(villaDir).filter((f) => f.endsWith(".md"));
console.log(`📁 พบ ${files.length} หลัง ใน ${villaDir}\n`);

const villas = files
  .map((f) => ({ slug: f.replace(/\.md$/, ""), ...parseVilla(path.join(villaDir, f)) }))
  .filter((v) => {
    if (LANDING_OVERRIDES.excludeSlugs.includes(v.slug)) {
      console.log(`⏭  ข้าม ${v.nameTh || v.name} (เจ้าของยืนยันว่ายังไม่ขายผ่านช่องทางนี้)\n`);
      return false;
    }
    return true;
  });
villas.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

// ใช้ค่าที่เจ้าของยืนยันแทนค่าจากเว็บ
for (const v of villas) {
  if (LANDING_OVERRIDES.meals) v.meals = LANDING_OVERRIDES.meals;
  if (v.amenities) {
    v.amenities = v.amenities.map((a) => LANDING_OVERRIDES.amenityReplace.get(a) ?? a);
  }
}

// ── 1) บทความ
for (const v of villas) {
  const title = `${v.nameTh || v.name} — ห้องพัก สิ่งอำนวยความสะดวก จำนวนคน`;
  const content = villaArticle(v);
  // keywords = "คำที่ลูกค้าพิมพ์แล้วต้องเจอบทความนี้"
  // ค้นแบบผสม (match_tmc_kb_hybrid) จับคำเหล่านี้ในคำถามตรง ๆ → ใส่ให้ครบที่สุดเท่าที่มี
  // ต้องมีทั้งชื่อสิ่งอำนวยความสะดวกดิบ ๆ (คาราโอเกะ / Wi-Fi / BBQ) เพราะ embedding ไทยพลาดคำเฉพาะ
  const keywords = Array.from(
    new Set(
      [
        v.nameTh || v.name,
        v.name,
        v.code,
        "สิ่งอำนวยความสะดวก",
        "นอนกี่คน",
        ...(v.amenities ?? []),
        ...(v.highlights ?? []),
        // ตัดคำนำหน้าออกให้เหลือคำที่ลูกค้าพิมพ์จริง เช่น "เตาปิ้งย่าง BBQ" → "BBQ"
        ...(v.amenities ?? []).flatMap((a) =>
          String(a)
            .split(/[\s/]+/)
            .filter((w) => w.length >= 3),
        ),
      ]
        .filter(Boolean)
        .map((k) => String(k).trim()),
    ),
  );

  console.log(`📝 ${title}`);
  if (DRY) {
    console.log(content.split("\n").map((l) => "   " + l).join("\n"), "\n");
    continue;
  }

  const { data: existing } = await supabase
    .from("tmc_kb_articles")
    .select("id")
    .eq("org_id", ORG_ID)
    .eq("title", title)
    .maybeSingle();

  let id = existing?.id;
  if (id) {
    await supabase
      .from("tmc_kb_articles")
      .update({ content, keywords, category: "บ้านพัก", source: "landing", embedded_at: null, updated_at: new Date().toISOString() })
      .eq("id", id);
  } else {
    const { data: created, error } = await supabase
      .from("tmc_kb_articles")
      .insert({ org_id: ORG_ID, category: "บ้านพัก", title, content, keywords, sort_order: 200 + (v.order ?? 0), source: "landing" })
      .select("id")
      .single();
    if (error) throw new Error(`insert ${title}: ${error.message}`);
    id = created.id;
  }

  const head = `[บ้านพัก] ${title}\nคำที่ลูกค้ามักถาม: ${keywords.join(", ")}`;
  const vector = await embed(`${head}\n${content}`);
  const { error: e2 } = await supabase.rpc("replace_tmc_kb_chunks", {
    p_article_id: id,
    p_chunks: [{ chunk_index: 0, content: `${head}\n${content}`, embedding: vector }],
  });
  if (e2) throw new Error(`embed ${title}: ${e2.message}`);
  console.log("   ✓ บันทึก + ฝัง embedding แล้ว");
}

if (SKIP_PHOTOS || DRY) {
  console.log("\n(ข้ามรูป)");
  process.exit(0);
}

// ── 2+3) รูป
await supabase.storage.createBucket(BUCKET, { public: true }).catch(() => {});
const { data: buckets } = await supabase.storage.listBuckets();
if (!buckets?.some((b) => b.name === BUCKET)) {
  const { error } = await supabase.storage.createBucket(BUCKET, { public: true });
  if (error) throw new Error(`สร้าง bucket ไม่สำเร็จ: ${error.message}`);
}
console.log(`\n🪣 bucket ${BUCKET} พร้อม`);

let uploaded = 0;
let skipped = 0;
for (const v of villas) {
  const folder = v.imageFolder;
  if (!folder) {
    console.log(`\n🖼  ${v.nameTh}: ไม่มี imageFolder — ข้าม`);
    continue;
  }
  const dir = path.join(SRC, "src/assets/villas", folder);
  if (!fs.existsSync(dir)) {
    console.log(`\n🖼  ${v.nameTh}: ไม่พบโฟลเดอร์ ${dir}`);
    continue;
  }
  const imgs = fs.readdirSync(dir).filter((f) => /\.jpe?g$/i.test(f)).sort();
  console.log(`\n🖼  ${v.nameTh}: ${imgs.length} รูป`);

  const { data: already } = await supabase
    .from("tmc_villa_photos")
    .select("file_name")
    .eq("org_id", ORG_ID)
    .eq("villa_slug", v.slug);
  const have = new Set((already ?? []).map((r) => r.file_name));

  for (let i = 0; i < imgs.length; i++) {
    const file = imgs[i];
    if (have.has(file)) {
      skipped++;
      continue;
    }
    const buf = fs.readFileSync(path.join(dir, file));
    const storagePath = `${v.slug}/${file}`;
    const up = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, buf, { contentType: "image/jpeg", upsert: true });
    if (up.error) {
      console.log(`   ✗ ${file}: ${up.error.message}`);
      continue;
    }
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
    const { category, caption } = await describePhoto(buf, v.nameTh || v.name);

    const { error } = await supabase.from("tmc_villa_photos").insert({
      org_id: ORG_ID,
      villa_slug: v.slug,
      villa_name: v.nameTh || v.name,
      file_name: file,
      storage_path: storagePath,
      public_url: pub.publicUrl,
      category,
      caption,
      sort_order: i,
    });
    if (error) console.log(`   ✗ ${file}: ${error.message}`);
    else {
      uploaded++;
      process.stdout.write(`   ✓ ${file} → ${category}${caption ? " · " + caption : ""}\n`);
    }
  }
}

console.log(`\n✅ เสร็จ — อัปโหลดใหม่ ${uploaded} รูป, ข้ามที่มีอยู่แล้ว ${skipped} รูป`);
