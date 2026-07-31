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

async function askGemini(
  note: string,
  existing: { id: string; title: string; category: string | null; content: string } | null,
  rules: { id: string; rule: string }[],
): Promise<AiDecision | null> {
  const key = process.env.GEMINI_API_KEY ?? "";
  if (!key) return null;

  const prompt = `คุณคือผู้ช่วยจัดระเบียบ "สมองของบอทขาย" ของบ้านพัก Thammachat Villa (ให้เช่าเหมาหลัง)
ทีมแอดมินเพิ่งพิมพ์ข้อความเข้ามาในกลุ่ม LINE — คุณต้องแยกก่อนว่าเป็นของชนิดไหน

ชนิดที่ 1 (kind = "fact") — **ข้อมูล** ที่บอทเอาไปตอบลูกค้า
  เช่น ราคา เงื่อนไข สิ่งอำนวยความสะดวก นโยบายมัดจำ จำนวนห้องนอน
ชนิดที่ 2 (kind = "rule") — **คำสั่งว่าบอทต้องพูด/วางตัวอย่างไร** ที่ต้องมีผลกับทุกข้อความ
  เช่น "เรียกลูกค้าว่าคุณท่านทุกคำ" · "ห้ามใช้อีโมจิ" · "ลงท้ายด้วยค่ะเสมอ" ·
  "ทักด้วยชื่อบ้านทุกครั้ง" · "ห้ามเรียกลูกค้าว่าพี่"
  สังเกต: เป็นคำสั่งถึงบอท ไม่ใช่ข้อเท็จจริงเรื่องที่พัก · ตอบคำถามลูกค้าตรง ๆ ไม่ได้

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

ถ้า kind = "rule"
- เขียน rule เป็น **ประโยคคำสั่งเดียว สั้น ชัด ไม่เกิน 150 ตัวอักษร** เช่น "เรียกผู้เข้าพักว่า คุณท่าน เสมอ ห้ามใช้คำเรียกอื่น"
- ถ้าคำสั่งใหม่ **ขัดหรือแทนที่กฎเดิม** (เช่น เปลี่ยนคำเรียกลูกค้า) → action = "update" + rule_id ของกฎเดิมนั้น
  ไม่งั้น action = "create"
- title = สรุปกฎสั้น ๆ ไม่เกิน 40 ตัวอักษร · content = ข้อความเดียวกับ rule · category = "กฎประจำตัว" · keywords = []
- **ห้ามแต่งกฎที่แอดมินไม่ได้สั่ง** และห้ามรวมหลายเรื่องไว้ในกฎเดียว

ถ้า kind = "fact" ให้ทำตามด้านล่างนี้ (เรียบเรียงเป็นบทความคลังความรู้)

${
  existing
    ? `บทความเดิมที่ใกล้เคียงที่สุดในคลัง (id: ${existing.id})
หัวข้อ: ${existing.title}
หมวด: ${existing.category ?? "-"}
เนื้อหา:
"""
${existing.content}
"""`
    : "ยังไม่มีบทความเดิมที่ใกล้เคียงในคลัง"
}

ตัดสินใจ
- ถ้าข้อมูลใหม่เป็น "เรื่องเดียวกัน" กับบทความเดิม (แก้ราคา/เพิ่มเงื่อนไข/แก้ให้ถูกต้อง) → action = "update"
  แล้วเขียน content ใหม่ที่ **รวมของเดิมกับของใหม่**
  **ข้อมูลใหม่ชนะของเดิมเสมอเมื่อขัดกัน** — ทิ้งค่าเก่าไปเลย ห้ามเก็บทั้งสองเวอร์ชันไว้ในบทความเดียวกัน
  และห้ามเขียนทำนองว่า "เดิม X ตอนนี้เป็น Y" ให้เหลือแต่ค่าที่ถูกต้องล่าสุด (ลูกค้าจะสับสน)
- ถ้าเป็นคนละเรื่อง → action = "create"

กติกาการเขียน content
- เขียนเป็นข้อความที่แอดมินจะตอบลูกค้าจริง ภาษาไทยสุภาพ อ่านง่าย
- หลายเงื่อนไขให้ขึ้นบรรทัดใหม่นำด้วย "• " (ห้ามใช้ markdown * - # **)
- จำนวนเงินใส่คอมมาและหน่วยเสมอ เช่น "29,900 บาท/คืน"
- **ห้ามเพิ่มข้อมูลที่แอดมินไม่ได้บอกและไม่มีในบทความเดิม** ห้ามเดาตัวเลขเอง
- title = คำถามที่ลูกค้าน่าจะถามเรื่องนี้ (สั้น ชัด)
- keywords = คำที่ลูกค้า "พิมพ์จริง" เวลาถามเรื่องนี้ 5-10 คำ
  ระบบค้นคลังจับคำเหล่านี้ในข้อความลูกค้าแบบตรงตัว → ใส่คำสั้น ๆ ที่ลูกค้าพิมพ์เอง
  เช่น "คาราโอเกะ" "ที่จอดรถ" "มัดจำ" (ไม่ใช่วลียาวแบบ "บริการที่จอดรถหน้าที่พัก")
  ใส่ทั้งคำเต็มและคำย่อ/คำที่สะกดต่างกันถ้ามี
- category เลือกจาก: ${CATEGORIES.join(" / ")}

ตอบเป็น JSON อย่างเดียว ไม่มีข้อความอื่น:
{"kind":"fact"|"rule","action":"create"|"update","article_id":"<ใส่เฉพาะตอน update บทความ>","rule_id":"<ใส่เฉพาะตอน update กฎ>","rule":"<ใส่เฉพาะ kind=rule>","category":"...","title":"...","content":"...","keywords":["..."]}`;

  const res = await fetch(`${GEMINI_BASE}/${MODEL}:generateContent?key=${key}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 1500,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  }).catch(() => null);

  if (!res?.ok) return null;
  const json = (await res.json().catch(() => null)) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  } | null;
  const raw = (json?.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("")
    .trim();
  if (!raw) return null;

  try {
    const d = JSON.parse(raw) as AiDecision;
    if (!d.title?.trim() || !d.content?.trim()) return null;
    return d;
  } catch {
    return null;
  }
}

export type IngestReply =
  | { kind: "text"; text: string }
  | {
      kind: "draft";
      /** article = ความรู้เข้าคลัง (ผ่าน retrieval) · rule = กฎประจำตัว (เข้า prompt ทุกครั้ง) */
      draftKind: "article" | "rule";
      draftId: string;
      action: "create" | "update";
      targetTitle: string | null;
      category: string;
      title: string;
      content: string;
      note: string;
    };

/**
 * รับข้อความที่แท็กบอทในกลุ่มที่ผูกไว้ → เรียบเรียงเป็น "ร่าง" รอยืนยัน (ยังไม่เขียนคลัง)
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

  // หาบทความเดิมที่ใกล้เคียง เพื่อให้ AI เลือกได้ว่าจะแก้ของเดิมหรือเพิ่มใหม่
  let existing: { id: string; title: string; category: string | null; content: string } | null =
    null;
  try {
    const hits = await retrieveContext(admin as never, orgId, note, 0.55);
    if (hits.length) {
      const { data: art } = await admin
        .from("tmc_kb_articles")
        .select("id, title, category, content")
        .eq("id", hits[0].article_id)
        .maybeSingle();
      existing = art as typeof existing;
    }
  } catch {
    existing = null; // หาไม่ได้ก็ยังเพิ่มใหม่ได้
  }

  const decision = await askGemini(note, existing, currentRules);
  if (!decision) {
    return {
      kind: "text",
      text: "ขออภัยค่ะ ระบบเรียบเรียงข้อมูลไม่สำเร็จ รบกวนพิมพ์ใหม่อีกครั้งนะคะ 🙏",
    };
  }

  // ─── คำสั่งวิธีพูด/ข้อห้าม → กฎประจำตัว (ไม่เข้าคลังความรู้) ────────────────
  if (decision.kind === "rule") {
    const rule = normalizeRule(String(decision.rule ?? decision.content ?? ""));
    if (!rule) {
      return {
        kind: "text",
        text: "ยังจับใจความคำสั่งไม่ได้ค่ะ 🙏 รบกวนพิมพ์สั้น ๆ ชัด ๆ อีกครั้งนะคะ",
      };
    }

    // กฎที่ลบล้างกติกาความปลอดภัยของบอท = ไม่รับตั้งแต่ต้นทาง (ไม่สร้างร่างให้กดยืนยันด้วยซ้ำ)
    const unsafe = isUnsafeRule(rule);
    if (unsafe) {
      return {
        kind: "text",
        text: `ขออภัยค่ะ กฎนี้บันทึกให้ไม่ได้ 🙏\n${unsafe}\n\nถ้าต้องการปรับเรื่องนี้จริง ๆ รบกวนคุยกับผู้ดูแลระบบนะคะ`,
      };
    }

    const target = currentRules.find((r) => r.id === decision.rule_id);
    const isRuleUpdate = decision.action === "update" && !!target;
    if (!isRuleUpdate && currentRules.length >= MAX_RULES) {
      return {
        kind: "text",
        text: `ตอนนี้บอทมีกฎประจำตัวครบ ${MAX_RULES} ข้อแล้วค่ะ 🙏\nรบกวนปิดหรือลบกฎที่ไม่ใช้แล้วในหน้า “ผู้ช่วยขาย LINE → กฎประจำตัว” ก่อนนะคะ`,
      };
    }

    const ruleTitle = (decision.title ?? "").trim().slice(0, 60) || "กฎประจำตัวบอท";
    const { data: rDraft, error: rErr } = await admin
      .from("tmc_kb_drafts")
      .insert({
        org_id: orgId,
        group_id: groupId,
        line_user_id: lineUserId ?? null,
        note: note.slice(0, 2000),
        kind: "rule",
        action: isRuleUpdate ? "update" : "create",
        target_rule_id: isRuleUpdate ? target!.id : null,
        target_title: isRuleUpdate ? target!.rule : null,
        category: "กฎประจำตัว",
        title: ruleTitle,
        content: rule,
        keywords: [],
      })
      .select("id")
      .single();

    if (rErr || !rDraft) {
      return { kind: "text", text: "ขออภัยค่ะ ระบบขัดข้อง สร้างร่างไม่สำเร็จ 🙏" };
    }

    return {
      kind: "draft",
      draftKind: "rule",
      draftId: (rDraft as { id: string }).id,
      action: isRuleUpdate ? "update" : "create",
      targetTitle: isRuleUpdate ? target!.rule : null,
      category: "กฎประจำตัว",
      title: ruleTitle,
      content: rule,
      note: note.slice(0, 2000),
    };
  }

  const category = CATEGORIES.includes(decision.category) ? decision.category : "ทั่วไป";
  const keywords = Array.isArray(decision.keywords)
    ? decision.keywords.map(String).slice(0, 8)
    : [];
  const isUpdate = decision.action === "update" && !!existing;

  const { data: draft, error } = await admin
    .from("tmc_kb_drafts")
    .insert({
      org_id: orgId,
      group_id: groupId,
      line_user_id: lineUserId ?? null,
      note: note.slice(0, 2000),
      action: isUpdate ? "update" : "create",
      target_article_id: isUpdate ? existing!.id : null,
      target_title: isUpdate ? existing!.title : null,
      category,
      title: decision.title.trim(),
      content: decision.content.trim(),
      keywords,
    })
    .select("id")
    .single();

  if (error || !draft) {
    return { kind: "text", text: "ขออภัยค่ะ ระบบขัดข้อง สร้างร่างไม่สำเร็จ 🙏" };
  }

  return {
    kind: "draft",
    draftKind: "article",
    draftId: (draft as { id: string }).id,
    action: isUpdate ? "update" : "create",
    targetTitle: isUpdate ? existing!.title : null,
    category,
    title: decision.title.trim(),
    content: decision.content.trim(),
    note: note.slice(0, 2000),
  };
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
