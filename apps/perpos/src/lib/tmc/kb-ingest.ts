/**
 * เพิ่มความรู้ให้ผู้ช่วยขาย TMC จากกลุ่ม LINE ของทีมแอดมิน
 *
 * ในกลุ่มที่ผูกไว้แล้ว แค่ **แท็ก @perpos แล้วพิมพ์ข้อมูล** ระบบจะ:
 *   1. หาบทความเดิมที่ใกล้เคียงที่สุดในคลัง (RAG)
 *   2. ให้ Gemini ตัดสินว่า "แก้ของเดิม" หรือ "เพิ่มเรื่องใหม่" แล้วเรียบเรียงเป็นบทความ
 *   3. **ส่งการ์ดสรุปให้ทวนในกลุ่ม + ปุ่มยืนยัน** — ยังไม่เขียนอะไรลงคลัง
 *   4. กด "ยืนยันบันทึก" → เขียนจริง + ฝัง embedding → บอทตอบลูกค้าด้วยข้อมูลใหม่ได้เลย
 *
 * ⚠️ ทำไมต้องมีขั้นยืนยัน: AI เรียบเรียงผิดได้ และการ "แก้ของเดิม" คือการเขียนทับข้อมูลจริง
 *    ที่บอทเอาไปตอบลูกค้า — ต้องให้คนเห็นก่อนเสมอ
 * ⚠️ ทำไมต้องให้เลือก "แก้ของเดิม" ด้วย: ถ้าเพิ่มใหม่ทุกครั้ง คลังจะมีราคา 2 เวอร์ชัน
 *    ที่ขัดกันเอง แล้ว retrieval จะหยิบอันเก่ามาตอบลูกค้าแบบสุ่ม
 *
 * ทุกอย่างที่บันทึกผ่านช่องทางนี้ แก้/ลบย้อนหลังได้ที่หน้า "ผู้ช่วยขาย LINE → คลังความรู้"
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordGeminiFromMetadata } from "@/lib/usage/record";
import { embedArticle, retrieveContext, type KbArticleInput } from "./sales-bot";
import { isUnsafeRule, normalizeRule, MAX_RULES } from "./bot-rules";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL = "gemini-2.5-flash";

/** หมวดที่หน้าเว็บใช้อยู่ — ให้ AI เลือกจากชุดนี้เท่านั้น ไม่งั้นหมวดจะงอกมั่ว */
const CATEGORIES = [
  "บ้านพัก",
  "ราคา",
  "ห้องนอน",
  "เตียงเสริม",
  "ส่วนลด",
  "สัตว์เลี้ยง",
  "การจอง",
  "ทั่วไป",
];

const USAGE =
  "พิมพ์ต่อท้ายการแท็กได้เลยค่ะ 🙏 บันทึกได้ 2 แบบ\n" +
  '• ข้อมูลที่ให้บอทตอบลูกค้า — "@perpos บ้าน 5 ห้องนอน มีคาราโอเกะกับโต๊ะพูล ใช้ฟรี"\n' +
  '• กฎว่าบอทต้องพูดยังไง — "@perpos เรียกลูกค้าว่าคุณท่านทุกคำ ห้ามเปลี่ยน"\n' +
  "ระบบจะทวนให้ดูก่อน กดยืนยันแล้วผู้ช่วยขายจะใช้ทันทีค่ะ";

interface AiDecision {
  /** fact = ข้อมูลเข้าคลังความรู้ · rule = คำสั่งวิธีพูด/ข้อห้าม ที่บอทต้องทำทุกข้อความ */
  kind?: "fact" | "rule";
  action: "create" | "update";
  article_id?: string;
  /** เฉพาะ kind=rule */
  rule_id?: string;
  rule?: string;
  category: string;
  title: string;
  content: string;
  keywords: string[];
}

/** ตัดส่วนที่เป็นการแท็กบอทออก เหลือเฉพาะเนื้อข้อมูล */
export function stripBotMention(
  text: string,
  mentionees?: { index?: number; length?: number; isSelf?: boolean }[],
): string {
  const selfRanges = (mentionees ?? [])
    .filter((m) => m.isSelf && typeof m.index === "number" && typeof m.length === "number")
    .sort((a, b) => (b.index ?? 0) - (a.index ?? 0));

  let out = text;
  for (const m of selfRanges) out = out.slice(0, m.index!) + out.slice(m.index! + m.length!);

  // เผื่อ client ที่ไม่ส่ง mention object มา — ตัด "@xxx" ที่อยู่ต้นข้อความ
  out = out.replace(/^\s*@\S+\s*/, "");
  return out.trim();
}

/** ข้อความนี้แท็กบอทเราไหม (ดูจาก payload ล้วน ไม่แตะ DB) */
export function mentionsBot(text: string, mention?: unknown): boolean {
  const mentionees = (mention as { mentionees?: { isSelf?: boolean }[] } | undefined)?.mentionees;
  if (mentionees?.some((m) => m.isSelf === true)) return true;
  // fallback: client เก่าที่ไม่ส่ง isSelf
  return /^\s*@\S*perpos/i.test(text);
}

/** บทความ/กฎที่ AI เสนอต่อ 1 รายการ (ข้อความเดียวเสนอได้หลายรายการ) */
interface AiItem {
  kind?: "fact" | "rule";
  action: "create" | "update";
  article_id?: string;
  rule_id?: string;
  rule?: string;
  category?: string;
  title?: string;
  content?: string;
  keywords?: string[];
}

/** เพดานรายการต่อข้อความ — กันข้อความยาวมากแตกเป็นสิบร่างจนคนไล่ตรวจไม่ไหว */
const MAX_ITEMS = 5;

async function askGemini(
  note: string,
  candidates: { id: string; title: string; category: string | null; content: string }[],
  rules: { id: string; rule: string }[],
): Promise<AiItem[] | null> {
  const key = process.env.GEMINI_API_KEY ?? "";
  if (!key) return null;

  const prompt = `คุณคือผู้ช่วยจัดระเบียบ "สมองของบอทขาย" ของบ้านพัก Thammachat Villa (ให้เช่าเหมาหลัง)
ทีมแอดมินพิมพ์ข้อความเข้ามาในกลุ่ม LINE — ข้อความหนึ่งอาจมีหลายเรื่องปนกัน คุณต้องแยกให้ออก

สิ่งที่อาจอยู่ในข้อความ
1. **ข้อมูล** (kind = "fact") — ของจริงเรื่องที่พักที่บอทเอาไปตอบลูกค้า
   เช่น ราคา เงื่อนไข สิ่งอำนวยความสะดวก นโยบายมัดจำ จำนวนห้องนอน
2. **คำสั่งวิธีพูด/ข้อห้าม** (kind = "rule") — บอกว่าบอทต้องพูดหรือวางตัวอย่างไร ต้องมีผลกับทุกข้อความ
   เช่น "เรียกลูกค้าว่าคุณท่าน" · "ห้ามบอกว่ามีหลัง Pet Friendly แยก" · "ห้ามใช้อีโมจิ"
   สังเกต: เป็นคำสั่งถึงบอท ไม่ใช่ข้อเท็จจริงเรื่องที่พัก
3. **ตัวอย่างคำตอบที่บอทเคยตอบ / บทสนทนาที่แอดมินแปะมาให้ดู** — ใช้เป็น "บริบท" เท่านั้น
   **ห้ามเอาข้อความพวกนี้ไปเขียนเป็นบทความในคลังเด็ดขาด** (มักขึ้นต้นว่า "สวัสดีค่ะ" / "ได้เลยค่ะ"
   หรือเป็นคำตอบยาวที่จ่าหน้าถึงลูกค้า) — หน้าที่คุณคือดูว่าแอดมิน **ไม่พอใจตรงไหน** แล้วแปลงเป็นกฎ

ข้อความจากแอดมิน:
"""
${note}
"""

${
  rules.length
    ? `กฎประจำตัวที่บอทถืออยู่ตอนนี้
${rules.map((r) => `- (id: ${r.id}) ${r.rule}`).join("\n")}`
    : "ตอนนี้บอทยังไม่มีกฎประจำตัวเลย"
}

${
  candidates.length
    ? `บทความในคลังที่ใกล้เคียงกับข้อความนี้ (เลือก article_id จากรายการนี้เท่านั้นเวลา update)
${candidates
  .map((c) => `- (id: ${c.id}) [${c.category ?? "-"}] ${c.title}\n  ${c.content.slice(0, 300)}`)
  .join("\n")}`
    : "ยังไม่มีบทความเดิมที่ใกล้เคียงในคลัง"
}

หน้าที่: แตกข้อความนี้เป็นรายการที่ต้องบันทึก (items) ได้สูงสุด ${MAX_ITEMS} รายการ
- 1 เรื่อง = 1 รายการ · ห้ามรวมหลายเรื่องไว้ในรายการเดียว
- ถ้าแอดมินสั่งเรื่องวิธีพูดหลายอย่างในข้อความเดียว ให้แตกเป็นหลาย item kind="rule"
- ถ้าไม่มีอะไรต้องบันทึกเลย (เช่น แปะแต่บทสนทนา ไม่ได้สั่งอะไร) ให้ตอบ {"items":[]}

กติกาสำหรับ kind = "rule"
- rule = ประโยคคำสั่งเดียว สั้น ชัด ไม่เกิน 150 ตัวอักษร
- ถ้าคำสั่งใหม่ขัด/แทนที่กฎเดิม → action = "update" + rule_id ของกฎเดิม · ไม่งั้น action = "create"
- title = สรุปกฎสั้น ๆ ไม่เกิน 40 ตัวอักษร · content = ข้อความเดียวกับ rule · category = "กฎประจำตัว"
- ห้ามแต่งกฎที่แอดมินไม่ได้สั่ง

กติกาสำหรับ kind = "fact"
- ถ้าเป็นเรื่องเดียวกับบทความในคลัง → action = "update" + article_id นั้น แล้วเขียน content ใหม่ที่รวมของเดิมกับของใหม่
  **ข้อมูลใหม่ชนะของเดิมเสมอเมื่อขัดกัน** — ทิ้งค่าเก่าไปเลย ห้ามเก็บสองเวอร์ชัน และห้ามเขียนว่า "เดิม X ตอนนี้ Y"
- ถ้าเป็นคนละเรื่อง → action = "create"
- เขียน content เป็นข้อความที่แอดมินจะตอบลูกค้าจริง ภาษาไทยสุภาพ อ่านง่าย
  หลายเงื่อนไขขึ้นบรรทัดใหม่นำด้วย "• " (ห้าม markdown * - # **) · จำนวนเงินใส่คอมมาและหน่วยเสมอ
- ห้ามเพิ่มข้อมูลที่แอดมินไม่ได้บอกและไม่มีในบทความเดิม ห้ามเดาตัวเลขเอง
- title = คำถามที่ลูกค้าน่าจะถามเรื่องนี้ (สั้น ชัด)
- keywords = คำที่ลูกค้า "พิมพ์จริง" เวลาถามเรื่องนี้ 5-10 คำ (คำสั้น ๆ เช่น "คาราโอเกะ" "มัดจำ")
- category เลือกจาก: ${CATEGORIES.join(" / ")}

ตอบเป็น JSON อย่างเดียว ไม่มีข้อความอื่น:
{"items":[{"kind":"fact"|"rule","action":"create"|"update","article_id":"...","rule_id":"...","rule":"...","category":"...","title":"...","content":"...","keywords":["..."]}]}`;

  const res = await fetch(`${GEMINI_BASE}/${MODEL}:generateContent?key=${key}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 3000,
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
  // org มาจาก ambient context ของ tmc webhook (แท็ก @perpos ในกลุ่มที่ผูกแล้ว)
  void recordGeminiFromMetadata({ feature: "tmc.kb_ingest" }, MODEL, json?.usageMetadata);
  const raw = (json?.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("")
    .trim();
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as { items?: AiItem[] } | AiItem[];
    const items = Array.isArray(parsed) ? parsed : (parsed.items ?? []);
    return items.slice(0, MAX_ITEMS);
  } catch {
    return null;
  }
}

/** 1 ร่างที่รอยืนยัน (ใช้ทั้งการ์ดเดี่ยวและการ์ดรวมชุด) */
export interface DraftItem {
  draftId: string;
  /** article = ความรู้เข้าคลัง (ผ่าน retrieval) · rule = กฎประจำตัว (เข้า prompt ทุกครั้ง) */
  draftKind: "article" | "rule";
  action: "create" | "update";
  /** ชื่อบทความ/ข้อความกฎเดิมที่จะถูกแทนที่ */
  targetTitle: string | null;
  category: string;
  title: string;
  content: string;
}

export type IngestReply =
  | { kind: "text"; text: string }
  | ({ kind: "draft"; note: string } & DraftItem)
  | {
      /** ข้อความเดียวมีหลายเรื่อง → การ์ดรวม ยืนยันทีเดียวทั้งชุด */
      kind: "batch";
      batchId: string;
      items: DraftItem[];
      /** รายการที่ระบบไม่รับ (เช่น กฎที่ขัด invariant) — บอกให้คนรู้ ไม่ใช่เงียบ */
      skipped: string[];
      note: string;
    };

/**
 * รับข้อความที่แท็กบอทในกลุ่มที่ผูกไว้ → เรียบเรียงเป็น "ร่าง" รอยืนยัน (ยังไม่เขียนคลัง)
 * ข้อความเดียวมีได้หลายเรื่อง (ข้อมูล + คำสั่งปนกัน) → สร้างหลายร่างใน batch เดียว
 * คืน null = กลุ่มนี้ไม่ได้ผูกกับ TMC (บอทต้องเงียบ)
 */
export async function handleTmcGroupKnowledge(
  admin: SupabaseClient,
  groupId: string,
  note: string,
  lineUserId?: string | null,
): Promise<IngestReply | null> {
  const { data } = await admin
    .from("tmc_bot_settings")
    .select("org_id")
    .eq("notify_group_id", groupId)
    .maybeSingle();
  const orgId = (data as { org_id: string } | null)?.org_id;
  if (!orgId) return null; // กลุ่มที่ไม่ได้ผูก = ไม่ใช่เรื่องของเรา

  if (!note.trim()) return { kind: "text", text: USAGE };
  if (!process.env.GEMINI_API_KEY) {
    return {
      kind: "text",
      text: "ยังตั้งค่า AI ไม่เสร็จ จึงบันทึกให้ไม่ได้ค่ะ 🙏 รบกวนแจ้งผู้ดูแลระบบนะคะ",
    };
  }

  // กฎประจำตัวที่บอทถืออยู่ — ให้ AI ตัดสินได้ว่าคำสั่งใหม่ "แทนที่" กฎเดิมข้อไหน
  const { data: ruleRows } = await admin
    .from("tmc_bot_rules")
    .select("id, rule")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .order("sort_order")
    .limit(MAX_RULES);
  const currentRules = (ruleRows ?? []) as { id: string; rule: string }[];

  // บทความเดิมที่ใกล้เคียง (สูงสุด 3 ใบ) — ข้อความยาวมักแตะหลายเรื่อง ให้ AI เลือกใบที่ตรงเอง
  let candidates: { id: string; title: string; category: string | null; content: string }[] = [];
  try {
    const hits = await retrieveContext(admin as never, orgId, note, 0.5);
    const ids = Array.from(new Set(hits.map((h) => h.article_id))).slice(0, 3);
    if (ids.length) {
      const { data: arts } = await admin
        .from("tmc_kb_articles")
        .select("id, title, category, content")
        .in("id", ids);
      candidates = (arts ?? []) as typeof candidates;
    }
  } catch {
    candidates = []; // หาไม่เจอก็ยังเพิ่มใหม่ได้
  }

  const items = await askGemini(note, candidates, currentRules);
  if (!items) {
    return {
      kind: "text",
      text: "ขออภัยค่ะ ระบบเรียบเรียงข้อมูลไม่สำเร็จ รบกวนพิมพ์ใหม่อีกครั้งนะคะ 🙏",
    };
  }
  if (!items.length) {
    return {
      kind: "text",
      text: "อ่านแล้วยังไม่เจอข้อมูลหรือคำสั่งที่ต้องบันทึกค่ะ 🙏\nถ้าต้องการให้แก้วิธีตอบ รบกวนบอกสั้น ๆ ว่าต้องการให้ตอบแบบไหนแทนนะคะ",
    };
  }

  const batchId = crypto.randomUUID();
  const drafts: DraftItem[] = [];
  const skipped: string[] = [];
  let ruleBudget = MAX_RULES - currentRules.length;

  for (const it of items) {
    const row: Record<string, unknown> = {
      org_id: orgId,
      group_id: groupId,
      line_user_id: lineUserId ?? null,
      note: note.slice(0, 2000),
      batch_id: batchId,
    };

    if (it.kind === "rule") {
      const rule = normalizeRule(String(it.rule ?? it.content ?? ""));
      if (!rule) continue;

      // กฎที่ลบล้างกติกาความปลอดภัยของบอท = ไม่รับตั้งแต่ต้นทาง (ไม่สร้างร่างให้กดยืนยันด้วยซ้ำ)
      const unsafe = isUnsafeRule(rule);
      if (unsafe) {
        skipped.push(`“${rule.slice(0, 60)}” — ${unsafe}`);
        continue;
      }

      const target = currentRules.find((r) => r.id === it.rule_id);
      const isRuleUpdate = it.action === "update" && !!target;
      if (!isRuleUpdate && ruleBudget <= 0) {
        skipped.push(`“${rule.slice(0, 60)}” — กฎเต็ม ${MAX_RULES} ข้อแล้ว`);
        continue;
      }
      if (!isRuleUpdate) ruleBudget -= 1;

      const title = (it.title ?? "").trim().slice(0, 60) || "กฎประจำตัวบอท";
      Object.assign(row, {
        kind: "rule",
        action: isRuleUpdate ? "update" : "create",
        target_rule_id: isRuleUpdate ? target!.id : null,
        target_title: isRuleUpdate ? target!.rule : null,
        category: "กฎประจำตัว",
        title,
        content: rule,
        keywords: [],
      });
    } else {
      const title = (it.title ?? "").trim();
      const content = (it.content ?? "").trim();
      if (!title || !content) continue;

      const target = candidates.find((c) => c.id === it.article_id);
      const isUpdate = it.action === "update" && !!target;
      Object.assign(row, {
        kind: "article",
        action: isUpdate ? "update" : "create",
        target_article_id: isUpdate ? target!.id : null,
        target_title: isUpdate ? target!.title : null,
        category: CATEGORIES.includes(it.category ?? "") ? it.category : "ทั่วไป",
        title,
        content,
        keywords: Array.isArray(it.keywords) ? it.keywords.map(String).slice(0, 8) : [],
      });
    }

    const { data: created, error } = await admin
      .from("tmc_kb_drafts")
      .insert(row)
      .select("id")
      .single();
    if (error || !created) continue;

    drafts.push({
      draftId: (created as { id: string }).id,
      draftKind: row.kind as "article" | "rule",
      action: row.action as "create" | "update",
      targetTitle: (row.target_title as string | null) ?? null,
      category: row.category as string,
      title: row.title as string,
      content: row.content as string,
    });
  }

  if (!drafts.length) {
    return {
      kind: "text",
      text: skipped.length
        ? `บันทึกให้ไม่ได้ค่ะ 🙏\n${skipped.map((s) => `• ${s}`).join("\n")}`
        : "ขออภัยค่ะ ระบบขัดข้อง สร้างร่างไม่สำเร็จ 🙏",
    };
  }

  if (drafts.length === 1 && !skipped.length) {
    return { kind: "draft", note: note.slice(0, 2000), ...drafts[0] };
  }

  return { kind: "batch", batchId, items: drafts, skipped, note: note.slice(0, 2000) };
}

/** กด "ยืนยันบันทึก" → เขียนลงคลังจริง + ฝัง embedding */
export async function confirmTmcKbDraft(
  admin: SupabaseClient,
  draftId: string,
  groupId: string,
): Promise<string> {
  const { data } = await admin.from("tmc_kb_drafts").select("*").eq("id", draftId).maybeSingle();
  const d = data as {
    id: string;
    org_id: string;
    group_id: string;
    note: string;
    kind?: "article" | "rule";
    action: "create" | "update";
    target_article_id: string | null;
    target_rule_id: string | null;
    target_title: string | null;
    category: string;
    title: string;
    content: string;
    keywords: string[];
    status: string;
    expires_at: string;
    line_user_id: string | null;
  } | null;

  if (!d) return "ไม่พบรายการนี้แล้วค่ะ 🙏";
  // ร่างของกลุ่มอื่นห้ามยืนยันข้ามกลุ่ม
  if (d.group_id !== groupId) return "รายการนี้ไม่ได้อยู่ในกลุ่มนี้ค่ะ 🙏";
  if (d.status === "applied") return "รายการนี้บันทึกไปแล้วค่ะ ✅";
  if (d.status === "cancelled") return "รายการนี้ถูกยกเลิกไปแล้วค่ะ";
  if (new Date(d.expires_at) < new Date()) {
    await admin.from("tmc_kb_drafts").update({ status: "expired" }).eq("id", d.id);
    return "รายการนี้หมดอายุแล้วค่ะ 🙏 รบกวนแท็กพิมพ์ข้อมูลเข้ามาใหม่นะคะ";
  }

  // ─── กฎประจำตัว — เขียนลง tmc_bot_rules ไม่ต้องฝัง embedding (ไม่ผ่าน retrieval) ───
  if (d.kind === "rule") {
    const isRuleUpdate = d.action === "update" && !!d.target_rule_id;
    if (isRuleUpdate) {
      const { data: cur } = await admin
        .from("tmc_bot_rules")
        .select("rule")
        .eq("id", d.target_rule_id!)
        .maybeSingle();
      const prev = (cur as { rule: string } | null)?.rule ?? null;
      if (prev === null) return "กฎเดิมถูกลบไปแล้วค่ะ 🙏 รบกวนพิมพ์คำสั่งเข้ามาใหม่นะคะ";

      const { error } = await admin
        .from("tmc_bot_rules")
        .update({
          rule: d.content,
          is_active: true,
          updated_at: new Date().toISOString(),
          source: "line",
          source_note: d.note,
          source_line_user_id: d.line_user_id,
          previous_rule: prev,
        })
        .eq("id", d.target_rule_id!)
        .eq("org_id", d.org_id);
      if (error) return "บันทึกไม่สำเร็จค่ะ 🙏 ลองใหม่อีกครั้งนะคะ";
    } else {
      const { error } = await admin.from("tmc_bot_rules").insert({
        org_id: d.org_id,
        rule: d.content,
        sort_order: 500,
        source: "line",
        source_note: d.note,
        source_line_user_id: d.line_user_id,
      });
      if (error) return "บันทึกไม่สำเร็จค่ะ 🙏 ลองใหม่อีกครั้งนะคะ";
    }

    await admin
      .from("tmc_kb_drafts")
      .update({ status: "applied", decided_at: new Date().toISOString() })
      .eq("id", d.id);

    const rHead = isRuleUpdate
      ? `แก้กฎประจำตัวเรียบร้อยค่ะ ✅\n(แทนที่กฎเดิม “${d.target_title ?? "-"}”)`
      : "บันทึกกฎประจำตัวเรียบร้อยค่ะ ✅";
    return `${rHead}\n\n📌 ${d.content}\n\nผู้ช่วยขายจะทำตามกฎนี้ทุกข้อความตั้งแต่นี้เลยค่ะ\n(ปิด/แก้/ลบได้ที่หน้า “ผู้ช่วยขาย LINE → กฎประจำตัว”)`;
  }

  const isUpdate = d.action === "update" && !!d.target_article_id;
  let articleId: string;

  if (isUpdate) {
    const { data: cur } = await admin
      .from("tmc_kb_articles")
      .select("content")
      .eq("id", d.target_article_id!)
      .maybeSingle();
    const prev = (cur as { content: string } | null)?.content ?? null;
    if (prev === null) return "บทความเดิมถูกลบไปแล้วค่ะ 🙏 รบกวนพิมพ์เข้ามาใหม่นะคะ";

    articleId = d.target_article_id!;
    const { error } = await admin
      .from("tmc_kb_articles")
      .update({
        category: d.category,
        title: d.title,
        content: d.content,
        keywords: d.keywords,
        embedded_at: null,
        updated_at: new Date().toISOString(),
        source: "line",
        source_note: d.note,
        source_line_user_id: d.line_user_id,
        previous_content: prev, // กู้คืนได้จากหน้าเว็บถ้า AI เรียบเรียงผิด
      })
      .eq("id", articleId)
      .eq("org_id", d.org_id);
    if (error) return "บันทึกไม่สำเร็จค่ะ 🙏 ลองใหม่อีกครั้งนะคะ";
  } else {
    const { data: created, error } = await admin
      .from("tmc_kb_articles")
      .insert({
        org_id: d.org_id,
        category: d.category,
        title: d.title,
        content: d.content,
        keywords: d.keywords,
        sort_order: 500,
        source: "line",
        source_note: d.note,
        source_line_user_id: d.line_user_id,
      })
      .select("id")
      .single();
    if (error || !created) return "บันทึกไม่สำเร็จค่ะ 🙏 ลองใหม่อีกครั้งนะคะ";
    articleId = (created as { id: string }).id;
  }

  await admin
    .from("tmc_kb_drafts")
    .update({
      status: "applied",
      applied_article_id: articleId,
      decided_at: new Date().toISOString(),
    })
    .eq("id", d.id);

  // ฝังทันที เพื่อให้บอทเอาไปตอบลูกค้าได้เลย ไม่ต้องรอใครกดปุ่มในเว็บ
  let embedded = true;
  try {
    await embedArticle(admin as never, {
      id: articleId,
      title: d.title,
      category: d.category,
      content: d.content,
      keywords: d.keywords,
    } satisfies KbArticleInput);
  } catch {
    embedded = false;
  }

  const head = isUpdate
    ? `อัปเดตความรู้เรียบร้อยค่ะ ✅\n(เขียนทับบทความ “${d.target_title ?? "-"}”)`
    : "บันทึกความรู้ใหม่เรียบร้อยค่ะ ✅";
  const tail = embedded
    ? "ผู้ช่วยขายนำไปตอบลูกค้าได้ทันทีเลยค่ะ"
    : 'บันทึกแล้วแต่ยังฝังข้อมูลไม่สำเร็จ รบกวนกด "อัปเดตความรู้" ในหน้าเว็บอีกครั้งนะคะ';

  return `${head}\n\n📌 ${d.title}\n\n${tail}\n(แก้ไข/ลบ/กู้คืนได้ที่หน้า “ผู้ช่วยขาย LINE → คลังความรู้”)`;
}

/** กด "ยกเลิก" */
export async function cancelTmcKbDraft(
  admin: SupabaseClient,
  draftId: string,
  groupId: string,
): Promise<string> {
  const { data } = await admin
    .from("tmc_kb_drafts")
    .select("id, group_id, status")
    .eq("id", draftId)
    .maybeSingle();
  const d = data as { id: string; group_id: string; status: string } | null;
  if (!d || d.group_id !== groupId) return "ไม่พบรายการนี้แล้วค่ะ 🙏";
  if (d.status === "applied") return "รายการนี้บันทึกไปแล้วค่ะ — แก้ไข/ลบได้ที่หน้าเว็บนะคะ";
  if (d.status !== "pending") return "รายการนี้ถูกปิดไปแล้วค่ะ";

  await admin
    .from("tmc_kb_drafts")
    .update({ status: "cancelled", decided_at: new Date().toISOString() })
    .eq("id", d.id);
  return "ยกเลิกแล้วค่ะ ไม่มีอะไรถูกบันทึกลงคลังความรู้นะคะ 🙏";
}

/**
 * กด "ยืนยันทั้งหมด" บนการ์ดรวมชุด — ยืนยันทีละร่างในชุดเดียวกัน
 * ใช้ตัวเดียวกับการยืนยันร่างเดี่ยว จึงได้ guard ครบเหมือนกัน (ข้ามกลุ่มไม่ได้ / ซ้ำไม่เขียนซ้ำ / หมดอายุ)
 */
export async function confirmTmcKbBatch(
  admin: SupabaseClient,
  batchId: string,
  groupId: string,
): Promise<string> {
  const { data } = await admin
    .from("tmc_kb_drafts")
    .select("id")
    .eq("batch_id", batchId)
    .eq("group_id", groupId)
    .eq("status", "pending")
    .order("created_at");
  const ids = ((data ?? []) as { id: string }[]).map((d) => d.id);
  if (!ids.length) return "รายการชุดนี้ถูกบันทึกหรือปิดไปแล้วค่ะ 🙏";

  const lines: string[] = [];
  for (const id of ids) lines.push(await confirmTmcKbDraft(admin, id, groupId));
  return `บันทึกทั้งชุดแล้วค่ะ (${ids.length} รายการ) ✅\n\n${lines.join("\n\n———\n\n")}`;
}

/** กด "ยกเลิก" บนการ์ดรวมชุด */
export async function cancelTmcKbBatch(
  admin: SupabaseClient,
  batchId: string,
  groupId: string,
): Promise<string> {
  const { data } = await admin
    .from("tmc_kb_drafts")
    .update({ status: "cancelled", decided_at: new Date().toISOString() })
    .eq("batch_id", batchId)
    .eq("group_id", groupId)
    .eq("status", "pending")
    .select("id");
  const n = ((data ?? []) as { id: string }[]).length;
  return n ? `ยกเลิกแล้วค่ะ ไม่มีอะไรถูกบันทึก (${n} รายการ) 🙏` : "รายการชุดนี้ถูกปิดไปแล้วค่ะ";
}
