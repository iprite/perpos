// ai-mocks.ts — ผลลัพธ์ AI แบบ canned ของ prototype mattii_ops (Contract v3 §5 — 4 must)
//
// prototype = Mock AI (CONTEXT §12): ห้ามยิง API จริง — หน้าเว็บจำลอง latency แล้วหยิบผลจากไฟล์นี้
// ทุกผลลัพธ์เป็น "ข้อเสนอ" ที่คนต้องตรวจ/กดยืนยันเสมอ (human-in-the-loop) — ห้ามบันทึกอัตโนมัติ
//
// AI must ตาม §5 มี 4 จุด: §5.1 สรุปแชท→ร่างออเดอร์ · §5.2 ตรวจไฟล์ลาย · §5.4 ร่างข้อความตอบลูกค้า ·
// §5.5 เตือนงานเสี่ยงเลยกำหนด (สรุปเป็นภาษาคน).  ⚠️ §5.3 จัดคิวผลิต = **rule-based ไม่ใช่ AI**
// (UI ห้ามเคลมว่าเป็น AI) · §5.6 สรุปฟีดแบ็ก CF = nice-to-have ที่ทำเพิ่มให้แล้ว
//
// จุดที่ใช้:
//   §5.1 (must) /inbox      — "สร้างออเดอร์จากแชท" (พรีฟิลฟอร์ม + ช่องที่ต้องตรวจ + evidence)
//   §5.4 (must) /inbox      — "ร่างข้อความตอบลูกค้า" 3 เจตนา × 3 โทน
//   §5.2 (must) /design     — "ตรวจไฟล์ลายก่อนพิมพ์" (rule-based + AI vision)
//   §5.5 (must) หน้าภาพรวม  — "สรุปงานเสี่ยงวันนี้ + ควรทำอะไรก่อน" (rule-based คัดงาน → AI เรียบเรียง)
//   §5.6 (nice) /design     — "สรุปฟีดแบ็ก CF → เช็กลิสต์แก้ลาย"
//
// binding ที่ UI ต้องทำตาม:
//   - ห้ามโชว์ "% ความมั่นใจ" เป็นตัวเลขหลัก → ใช้ StatusBadge "AI ร่างให้ — ต้องตรวจ N ช่อง"
//     (% เก็บไว้ในบรรทัดรอง/tooltip เท่านั้น)
//   - field ที่ AI มั่นใจต่ำ → ทิ้งว่าง ไม่เดาใส่ + ไฮไลต์ให้คนกรอกเอง
//   - ทุกข้อสรุปต้องอ้าง evidence (ข้อความต้นฉบับ) ให้กดดูได้
//   - ผล AI ห้ามมีตัวเลขต้นทุน/กำไร (owner-only §2.3 ข้อ 5) — ไฟล์นี้จึงไม่มี field ต้นทุนใด ๆ

import type { ChatChannel, DesignSource } from "./types";

/** หน่วงจำลองเวลาเรียก AI (มิลลิวินาที) — ใช้ให้เท่ากันทุกหน้าเพื่อความรู้สึกเดียวกัน */
export const AI_MOCK_LATENCY_MS = 1200;

/** ป้ายกำกับโมเดลที่ใช้ (จำลอง) — โชว์เป็นบรรทัดรองในผลลัพธ์ */
export const AI_MOCK_MODEL_LABEL = "จำลอง — ผู้ช่วย AI ของ PERPOS Suite";

/** ข้อความกำกับมาตรฐานท้ายผลลัพธ์ AI ทุกจุด */
export const AI_DISCLAIMER = "ผลลัพธ์นี้เป็นข้อเสนอจาก AI — ตรวจสอบก่อนบันทึกทุกครั้ง";

// ───────────────────────────────────────────────────────────────────────────
// §5.1 (MUST-1) สรุปแชท → ร่างออเดอร์  [/inbox]
// ───────────────────────────────────────────────────────────────────────────

/** ช่องในร่างออเดอร์ที่ AI เติมให้ (หรือจงใจเว้นว่างเพราะไม่มั่นใจ) */
export interface AiDraftField {
  /** key ตรงกับ field ในฟอร์มสร้างออเดอร์ */
  key: "product" | "size" | "qty" | "pattern_name" | "design_source" | "due_date";
  label: string;
  /** 0–1 — เก็บไว้โชว์เป็นบรรทัดรอง/tooltip เท่านั้น ห้ามเป็นตัวเลขหลัก */
  confidence: number;
  /** true = ต้องให้คนกรอก/ตรวจเอง (AI จะไม่เดาใส่ค่า) */
  needsReview: boolean;
  /** ข้อความต้นฉบับในแชทที่ AI ใช้ตัดสิน */
  evidenceQuote: string;
  /** id ของ message ที่ยกมา (ให้ UI เลื่อนไปไฮไลต์) */
  evidenceMessageId: string;
}

export interface AiChatDraft {
  conversation_id: string;
  /** สรุปบทสนทนา 1–2 ประโยค (ภาษาคน) */
  summary: string;
  /** ค่าที่ AI เติมให้ — ค่าที่ไม่มั่นใจจะเป็น null (ห้ามเดา) */
  suggested: {
    product_id: string | null;
    product_size_id: string | null;
    qty: number | null;
    pattern_name: string | null;
    design_source: DesignSource | null;
    due_date: string | null;
    channel: ChatChannel;
    customer_name_guess: string | null;
  };
  fields: AiDraftField[];
}

/** จำนวนช่องที่ต้องตรวจ — UI เอาไปเขียนป้าย "AI ร่างให้ — ต้องตรวจ N ช่อง" */
export function reviewCountOf(draft: AiChatDraft): number {
  return draft.fields.filter((f) => f.needsReview).length;
}

/** ร่างที่เตรียมไว้ต่อห้องแชท (key = conversation id) */
export const AI_CHAT_DRAFTS: Record<string, AiChatDraft> = {
  // ★ เคสเดโมหลัก — ลูกค้าบอกแบบพรมชัด แต่ "ขนาด" กับ "จำนวน" ยังไม่ตัดสินใจ → ต้องตรวจ 2 ช่อง
  "conv-10": {
    conversation_id: "conv-10",
    summary:
      "ลูกค้าอยากทำพรมเช็ดเท้ากำมะหยี่พิมพ์รูปสุนัขที่บ้าน ส่งรูปอ้างอิงมาแล้ว 1 รูป แต่ยังไม่เคาะขนาดและจำนวน (บอกว่าจะถามที่บ้านก่อน)",
    suggested: {
      product_id: "prd-01",
      product_size_id: null,
      qty: null,
      pattern_name: "ลายรูปสุนัขของลูกค้า",
      design_source: "in_house",
      due_date: null,
      channel: "tiktok",
      customer_name_guess: "ลูกค้า TikTok (ยังไม่ได้ผูกบัญชีลูกค้า)",
    },
    fields: [
      {
        key: "product",
        label: "แบบพรม",
        confidence: 0.93,
        needsReview: false,
        evidenceQuote: "เอาแบบพรมเช็ดเท้ากำมะหยี่นะคะ",
        evidenceMessageId: "msg-10-4",
      },
      {
        key: "size",
        label: "ขนาด",
        confidence: 0.31,
        needsReview: true,
        evidenceQuote: "แต่ยังไม่แน่ใจว่าจะเอาขนาดไหนดี",
        evidenceMessageId: "msg-10-4",
      },
      {
        key: "qty",
        label: "จำนวน (ผืน)",
        confidence: 0.28,
        needsReview: true,
        evidenceQuote: "กับจำนวนก็ยังไม่ตัดสินใจค่ะ เดี๋ยวถามที่บ้านก่อน",
        evidenceMessageId: "msg-10-4",
      },
      {
        key: "pattern_name",
        label: "ชื่อลาย",
        confidence: 0.88,
        needsReview: false,
        evidenceQuote: "อยากเอารูปหมาที่บ้านมาพิมพ์",
        evidenceMessageId: "msg-10-1",
      },
      {
        key: "design_source",
        label: "แหล่งที่มาของลาย",
        confidence: 0.81,
        needsReview: false,
        evidenceQuote: "ทีมกราฟิกจะจัดองค์ประกอบให้สวยงามค่ะ",
        evidenceMessageId: "msg-10-2",
      },
    ],
  },

  // ลูกค้าถามราคาเฉย ๆ ยังไม่บอกลาย/ขนาด/จำนวน → ต้องตรวจ 3 ช่อง
  "conv-08": {
    conversation_id: "conv-08",
    summary: "ลูกค้าถามราคาพรมเช็ดเท้าเริ่มต้นและขอดูตัวอย่างลาย ยังไม่ระบุลาย ขนาด หรือจำนวน",
    suggested: {
      product_id: "prd-01",
      product_size_id: null,
      qty: null,
      pattern_name: null,
      design_source: null,
      due_date: null,
      channel: "line",
      customer_name_guess: "ลูกค้า LINE (ยังไม่ได้ผูกบัญชีลูกค้า)",
    },
    fields: [
      {
        key: "product",
        label: "แบบพรม",
        confidence: 0.76,
        needsReview: false,
        evidenceQuote: "พรมเช็ดเท้าราคาเริ่มต้นเท่าไหร่คะ",
        evidenceMessageId: "msg-08-1",
      },
      {
        key: "size",
        label: "ขนาด",
        confidence: 0.34,
        needsReview: true,
        evidenceQuote: "เริ่มต้น 290 บาทค่ะ ขนาด 40x60",
        evidenceMessageId: "msg-08-2",
      },
      {
        key: "qty",
        label: "จำนวน (ผืน)",
        confidence: 0.2,
        needsReview: true,
        evidenceQuote: "ขอดูตัวอย่างลายหน่อยค่ะ",
        evidenceMessageId: "msg-08-3",
      },
      {
        key: "pattern_name",
        label: "ชื่อลาย",
        confidence: 0.18,
        needsReview: true,
        evidenceQuote: "ขอดูตัวอย่างลายหน่อยค่ะ",
        evidenceMessageId: "msg-08-3",
      },
    ],
  },

  // งานจำนวนมาก — จำนวนชัด แต่ขนาด/ลายยังไม่เคาะ → ต้องตรวจ 2 ช่อง
  "conv-09": {
    conversation_id: "conv-09",
    summary:
      "ลูกค้าต้องการสั่ง 10 ผืนเพื่อแจกลูกค้าของร้าน และขอส่วนลด ยังไม่แจ้งขนาดและลายที่ต้องการ",
    suggested: {
      product_id: "prd-01",
      product_size_id: null,
      qty: 10,
      pattern_name: null,
      design_source: "in_house",
      due_date: null,
      channel: "facebook",
      customer_name_guess: "ลูกค้า Facebook (ยังไม่ได้ผูกบัญชีลูกค้า)",
    },
    fields: [
      {
        key: "qty",
        label: "จำนวน (ผืน)",
        confidence: 0.94,
        needsReview: false,
        evidenceQuote: "สั่ง 10 ผืนพร้อมกันลดได้เท่าไหร่ครับ",
        evidenceMessageId: "msg-09-1",
      },
      {
        key: "product",
        label: "แบบพรม",
        confidence: 0.62,
        needsReview: false,
        evidenceQuote: "ทำแจกลูกค้าร้าน",
        evidenceMessageId: "msg-09-1",
      },
      {
        key: "size",
        label: "ขนาด",
        confidence: 0.25,
        needsReview: true,
        evidenceQuote: "รบกวนแจ้งขนาด+ลายที่ต้องการก่อนนะคะ",
        evidenceMessageId: "msg-09-2",
      },
      {
        key: "pattern_name",
        label: "ชื่อลาย",
        confidence: 0.22,
        needsReview: true,
        evidenceQuote: "รบกวนแจ้งขนาด+ลายที่ต้องการก่อนนะคะ",
        evidenceMessageId: "msg-09-2",
      },
    ],
  },

  // เคสข้อมูลครบเกือบหมด (ลูกค้าเก่า) — ต้องตรวจ 1 ช่อง
  "conv-02": {
    conversation_id: "conv-02",
    summary:
      "ลูกค้าต้องการพรมห้องนั่งเล่นลายดอกไม้พาสเทล ขนาด 80×120 ซม. กำลังเลือกลายจากตัวอย่างที่ร้านส่งให้",
    suggested: {
      product_id: "prd-03",
      product_size_id: null,
      qty: 1,
      pattern_name: "ลายดอกไม้พาสเทล",
      design_source: "in_house",
      due_date: null,
      channel: "facebook",
      customer_name_guess: "ร้านดอกไม้พาสเทล",
    },
    fields: [
      {
        key: "product",
        label: "แบบพรม",
        confidence: 0.91,
        needsReview: false,
        evidenceQuote: "อยากได้พรมห้องนั่งเล่นลายดอกไม้พาสเทลค่ะ",
        evidenceMessageId: "msg-02-1",
      },
      {
        key: "size",
        label: "ขนาด",
        confidence: 0.86,
        needsReview: false,
        evidenceQuote: "ขนาด 80x120",
        evidenceMessageId: "msg-02-1",
      },
      {
        key: "qty",
        label: "จำนวน (ผืน)",
        confidence: 0.55,
        needsReview: true,
        evidenceQuote: "สวยค่ะ เดี๋ยวขอดูก่อนนะคะ",
        evidenceMessageId: "msg-02-3",
      },
      {
        key: "pattern_name",
        label: "ชื่อลาย",
        confidence: 0.79,
        needsReview: false,
        evidenceQuote: "ลายดอกไม้พาสเทล",
        evidenceMessageId: "msg-02-1",
      },
    ],
  },
};

/** ร่างกลาง ๆ สำหรับห้องที่ยังไม่ได้เตรียมผลไว้ (AI ไม่มั่นใจเกือบทุกช่อง) */
export function fallbackChatDraft(conversationId: string, channel: ChatChannel): AiChatDraft {
  return {
    conversation_id: conversationId,
    summary:
      "อ่านบทสนทนาแล้วยังได้ข้อมูลไม่พอสรุปเป็นออเดอร์ — กรอกแบบพรม ขนาด และจำนวนเองก่อนบันทึก",
    suggested: {
      product_id: null,
      product_size_id: null,
      qty: null,
      pattern_name: null,
      design_source: null,
      due_date: null,
      channel,
      customer_name_guess: null,
    },
    fields: [
      {
        key: "product",
        label: "แบบพรม",
        confidence: 0.2,
        needsReview: true,
        evidenceQuote: "ไม่พบข้อความที่ระบุแบบพรมชัดเจน",
        evidenceMessageId: "",
      },
      {
        key: "size",
        label: "ขนาด",
        confidence: 0.2,
        needsReview: true,
        evidenceQuote: "ไม่พบข้อความที่ระบุขนาดชัดเจน",
        evidenceMessageId: "",
      },
      {
        key: "qty",
        label: "จำนวน (ผืน)",
        confidence: 0.2,
        needsReview: true,
        evidenceQuote: "ไม่พบข้อความที่ระบุจำนวนชัดเจน",
        evidenceMessageId: "",
      },
    ],
  };
}

/** หาร่าง AI ของห้องแชท — ไม่มีผลที่เตรียมไว้ก็คืนร่างกลาง ๆ (ไม่เดาข้อมูล) */
export function aiChatDraftFor(conversationId: string, channel: ChatChannel): AiChatDraft {
  return AI_CHAT_DRAFTS[conversationId] ?? fallbackChatDraft(conversationId, channel);
}

// ───────────────────────────────────────────────────────────────────────────
// §5.4 (MUST-3) ร่างข้อความตอบลูกค้า  [/inbox]
// ───────────────────────────────────────────────────────────────────────────

export type AiReplyIntent = "ask_cf" | "queue_update" | "tracking";
export type AiReplyTone = "friendly" | "formal" | "concise";

export const AI_REPLY_INTENT_LABEL: Record<AiReplyIntent, string> = {
  ask_cf: "ขอให้ลูกค้ายืนยันลาย",
  queue_update: "แจ้งคิว/ความคืบหน้า",
  tracking: "แจ้งเลขพัสดุ",
};

export const AI_REPLY_TONE_LABEL: Record<AiReplyTone, string> = {
  friendly: "เป็นกันเอง",
  formal: "สุภาพทางการ",
  concise: "สั้น กระชับ",
};

/**
 * ข้อความร่าง 3 เจตนา × 3 โทน — ใช้ตัวยึด {ชื่อลูกค้า} / {เลขที่ออเดอร์} / {เลขพัสดุ}
 * UI ต้องเติมลง "ช่องพิมพ์" ให้คนแก้ก่อนกดส่งเสมอ (ห้ามส่งอัตโนมัติ)
 */
export const AI_REPLY_DRAFTS: Record<AiReplyIntent, Record<AiReplyTone, string>> = {
  ask_cf: {
    friendly:
      "สวัสดีค่ะคุณ{ชื่อลูกค้า} 😊 ทีมกราฟิกทำลายให้เรียบร้อยแล้วนะคะ ส่งให้ดูตามนี้เลยค่ะ ถ้าโอเคแล้วรบกวนตอบกลับว่า “ยืนยัน” ทางร้านจะเข้าคิวพิมพ์ให้ทันทีค่ะ ถ้าอยากปรับตรงไหนบอกได้เลยนะคะ",
    formal:
      "เรียนคุณ{ชื่อลูกค้า} ทางร้านได้จัดทำแบบลายสำหรับออเดอร์ {เลขที่ออเดอร์} เรียบร้อยแล้ว รบกวนตรวจสอบและยืนยันแบบเพื่อให้ทางร้านดำเนินการพิมพ์ต่อ หากต้องการแก้ไขส่วนใด กรุณาแจ้งรายละเอียดกลับมาได้เลยครับ/ค่ะ",
    concise:
      "ส่งลายให้ดูแล้วนะคะ ออเดอร์ {เลขที่ออเดอร์} — ถ้าโอเครบกวนตอบ “ยืนยัน” เพื่อเข้าคิวพิมพ์ค่ะ",
  },
  queue_update: {
    friendly:
      "สวัสดีค่ะคุณ{ชื่อลูกค้า} อัปเดตงานให้นะคะ ออเดอร์ {เลขที่ออเดอร์} เข้าคิวผลิตเรียบร้อยแล้วค่ะ ทางร้านจะรีบทำให้เร็วที่สุด พอพิมพ์เสร็จและแพ็คแล้วจะแจ้งเลขพัสดุให้ทันทีเลยค่ะ",
    formal:
      "เรียนคุณ{ชื่อลูกค้า} ขอแจ้งความคืบหน้าออเดอร์ {เลขที่ออเดอร์} ขณะนี้อยู่ระหว่างขั้นตอนการผลิต ทางร้านจะแจ้งกำหนดจัดส่งและเลขพัสดุให้ทราบอีกครั้งเมื่อดำเนินการแล้วเสร็จ ขออภัยในความล่าช้าหากมีครับ/ค่ะ",
    concise: "ออเดอร์ {เลขที่ออเดอร์} เข้าคิวผลิตแล้วค่ะ เสร็จเมื่อไรจะแจ้งเลขพัสดุให้ทันทีนะคะ",
  },
  tracking: {
    friendly:
      "ส่งของให้แล้วนะคะคุณ{ชื่อลูกค้า} 🎉 ออเดอร์ {เลขที่ออเดอร์} เลขพัสดุ {เลขพัสดุ} (J&T) ติดตามสถานะได้เลยค่ะ ของถึงแล้วรบกวนช่วยรีวิวรูปพรมที่ใช้จริงให้ด้วยนะคะ ขอบคุณมากค่ะ",
    formal:
      "เรียนคุณ{ชื่อลูกค้า} ทางร้านได้จัดส่งออเดอร์ {เลขที่ออเดอร์} เรียบร้อยแล้ว หมายเลขพัสดุ {เลขพัสดุ} (J&T Express) ท่านสามารถตรวจสอบสถานะการจัดส่งได้จากหมายเลขดังกล่าว ขอบคุณที่ใช้บริการครับ/ค่ะ",
    concise: "ส่งของแล้วค่ะ ออเดอร์ {เลขที่ออเดอร์} เลขพัสดุ {เลขพัสดุ} (J&T) ติดตามได้เลยนะคะ",
  },
};

/** เติมตัวยึดในข้อความร่าง — ค่าที่ไม่รู้จะคงตัวยึดไว้ให้คนกรอกเอง (ไม่เดา) */
export function aiReplyDraft(
  intent: AiReplyIntent,
  tone: AiReplyTone,
  ctx?: { customerName?: string | null; orderNo?: string | null; trackingNo?: string | null },
): string {
  let text = AI_REPLY_DRAFTS[intent][tone];
  if (ctx?.customerName) text = text.replaceAll("{ชื่อลูกค้า}", ctx.customerName);
  if (ctx?.orderNo) text = text.replaceAll("{เลขที่ออเดอร์}", ctx.orderNo);
  if (ctx?.trackingNo) text = text.replaceAll("{เลขพัสดุ}", ctx.trackingNo);
  return text;
}

// ───────────────────────────────────────────────────────────────────────────
// §5.2 (MUST-2) ตรวจไฟล์ลายก่อนพิมพ์  [/design — กลุ่ม B ใช้ต่อ]
// ───────────────────────────────────────────────────────────────────────────

export type AiCheckResult = "pass" | "warn" | "fail";

export interface AiArtworkCheckItem {
  key: "dpi" | "aspect_ratio" | "bleed" | "color_mode" | "content";
  label: string;
  result: AiCheckResult;
  /** สิ่งที่ตรวจเจอ + สิ่งที่ควรทำ (ภาษาคน) */
  detail: string;
  /** true = กฎตายตัว (ไม่ต้องเรียก AI) · false = ต้องใช้ AI ดูภาพ */
  ruleBased: boolean;
}

export interface AiArtworkCheck {
  design_version_id: string;
  /** สรุปรวม — fail = ห้ามส่งพิมพ์ก่อนแก้ · warn = พิมพ์ได้แต่ควรเช็ค */
  overall: AiCheckResult;
  headline: string;
  items: AiArtworkCheckItem[];
  /** 0–1 (บรรทัดรอง/tooltip เท่านั้น) */
  confidence: number;
}

/** ผลตรวจไฟล์ลายที่เตรียมไว้ (key = design_version id) */
export const AI_ARTWORK_CHECKS: Record<string, AiArtworkCheck> = {
  // เคส "ผ่านสะอาด" — ใช้โชว์ happy path
  "dvr-13-1": {
    design_version_id: "dvr-13-1",
    overall: "pass",
    headline: "ไฟล์พร้อมพิมพ์ ไม่พบปัญหาที่ต้องแก้",
    confidence: 0.95,
    items: [
      {
        key: "dpi",
        label: "ความละเอียด (DPI)",
        result: "pass",
        detail: "300 dpi ที่ขนาดพิมพ์จริง — คมพอสำหรับพรมพิมพ์ลาย",
        ruleBased: true,
      },
      {
        key: "aspect_ratio",
        label: "สัดส่วนกับขนาดพรม",
        result: "pass",
        detail: "สัดส่วนไฟล์ตรงกับ 60 × 90 ซม. ไม่ต้องยืด/บีบ",
        ruleBased: true,
      },
      {
        key: "bleed",
        label: "ระยะตัดตก (bleed)",
        result: "pass",
        detail: "เผื่อขอบ 2 ซม. รอบด้าน เพียงพอต่อการเย็บโพ้ง",
        ruleBased: true,
      },
      {
        key: "color_mode",
        label: "โหมดสี",
        result: "pass",
        detail: "ไฟล์เป็น sRGB เหมาะกับการพิมพ์ซับลิเมชัน",
        ruleBased: true,
      },
      {
        key: "content",
        label: "องค์ประกอบลาย",
        result: "pass",
        detail: "ไม่พบตัวอักษร/โลโก้ตกขอบเขตพื้นที่ปลอดภัย",
        ruleBased: false,
      },
    ],
  },
  // เคส "เตือน" — dpi ต่ำ + ตัวอักษรชิดขอบ (ใช้โชว์คุณค่า: กันพิมพ์เสียทั้งผืน)
  "dvr-28-1": {
    design_version_id: "dvr-28-1",
    overall: "warn",
    headline: "พิมพ์ได้ แต่ควรแก้ 2 จุดก่อน ไม่งั้นเสี่ยงพิมพ์ออกมาไม่คม",
    confidence: 0.87,
    items: [
      {
        key: "dpi",
        label: "ความละเอียด (DPI)",
        result: "warn",
        detail:
          "180 dpi ที่ขนาดพิมพ์จริง — ต่ำกว่ามาตรฐาน 300 dpi ควรขอไฟล์ต้นฉบับที่ใหญ่กว่านี้จากลูกค้า",
        ruleBased: true,
      },
      {
        key: "aspect_ratio",
        label: "สัดส่วนกับขนาดพรม",
        result: "pass",
        detail: "สัดส่วนใกล้เคียง 40 × 60 ซม. เพี้ยนไม่ถึง 1%",
        ruleBased: true,
      },
      {
        key: "bleed",
        label: "ระยะตัดตก (bleed)",
        result: "warn",
        detail: "เผื่อขอบเพียง 0.5 ซม. — ตอนเย็บโพ้งอาจกินลายด้านล่าง แนะนำเผื่อ 2 ซม.",
        ruleBased: true,
      },
      {
        key: "color_mode",
        label: "โหมดสี",
        result: "pass",
        detail: "sRGB ตามมาตรฐานงานซับลิเมชัน",
        ruleBased: true,
      },
      {
        key: "content",
        label: "องค์ประกอบลาย",
        result: "warn",
        detail: "ข้อความ “บ้านมะลิ” อยู่ห่างขอบ 0.8 ซม. เสี่ยงถูกตัดตอนเย็บขอบ",
        ruleBased: false,
      },
    ],
  },
  // เคส "ไม่ผ่าน" — ต้องแก้ก่อนพิมพ์
  "dvr-30-1": {
    design_version_id: "dvr-30-1",
    overall: "fail",
    headline: "ยังไม่ควรส่งพิมพ์ — ไฟล์เล็กเกินไปสำหรับพรมผืนใหญ่",
    confidence: 0.92,
    items: [
      {
        key: "dpi",
        label: "ความละเอียด (DPI)",
        result: "fail",
        detail: "96 dpi ที่ขนาด 100 × 150 ซม. — ขยายแล้วลายจะแตกชัดเจน ต้องใช้ไฟล์ใหม่",
        ruleBased: true,
      },
      {
        key: "aspect_ratio",
        label: "สัดส่วนกับขนาดพรม",
        result: "warn",
        detail: "ไฟล์เป็นจัตุรัส แต่พรมเป็น 2:3 — ต้องจัดองค์ประกอบใหม่ ไม่ใช่ยืดภาพ",
        ruleBased: true,
      },
      {
        key: "bleed",
        label: "ระยะตัดตก (bleed)",
        result: "fail",
        detail: "ไม่มีพื้นที่เผื่อขอบเลย ลายจรดขอบไฟล์พอดี",
        ruleBased: true,
      },
      {
        key: "color_mode",
        label: "โหมดสี",
        result: "pass",
        detail: "sRGB ใช้ได้",
        ruleBased: true,
      },
      {
        key: "content",
        label: "องค์ประกอบลาย",
        result: "pass",
        detail: "องค์ประกอบหลักอยู่กลางผืน ไม่มีข้อความตกขอบ",
        ruleBased: false,
      },
    ],
  },
};

/** ผลตรวจกลาง ๆ (เตือนให้คนดูเอง) สำหรับเวอร์ชันที่ยังไม่ได้เตรียมผลไว้ */
export function fallbackArtworkCheck(versionId: string): AiArtworkCheck {
  return {
    design_version_id: versionId,
    overall: "warn",
    headline: "ตรวจเบื้องต้นแล้ว — ยังต้องให้คนยืนยันก่อนส่งพิมพ์",
    confidence: 0.6,
    items: [
      {
        key: "dpi",
        label: "ความละเอียด (DPI)",
        result: "pass",
        detail: "อยู่ในเกณฑ์ที่พิมพ์ได้",
        ruleBased: true,
      },
      {
        key: "aspect_ratio",
        label: "สัดส่วนกับขนาดพรม",
        result: "warn",
        detail: "ตรวจสัดส่วนกับขนาดที่ลูกค้าสั่งอีกครั้งก่อนพิมพ์",
        ruleBased: true,
      },
      {
        key: "bleed",
        label: "ระยะตัดตก (bleed)",
        result: "warn",
        detail: "ยืนยันระยะเผื่อขอบให้พอสำหรับการเย็บโพ้ง",
        ruleBased: true,
      },
      {
        key: "color_mode",
        label: "โหมดสี",
        result: "pass",
        detail: "โหมดสีเหมาะกับงานซับลิเมชัน",
        ruleBased: true,
      },
      {
        key: "content",
        label: "องค์ประกอบลาย",
        result: "pass",
        detail: "ไม่พบองค์ประกอบตกขอบที่ชัดเจน",
        ruleBased: false,
      },
    ],
  };
}

export function aiArtworkCheckFor(versionId: string): AiArtworkCheck {
  return AI_ARTWORK_CHECKS[versionId] ?? fallbackArtworkCheck(versionId);
}

// ───────────────────────────────────────────────────────────────────────────
// §5.6 (MUST-4) สรุปฟีดแบ็ก CF → เช็กลิสต์แก้ลาย  [/design — กลุ่ม B ใช้ต่อ]
// ───────────────────────────────────────────────────────────────────────────

export interface AiCfChecklistItem {
  key: string;
  /** สิ่งที่ต้องแก้ (สั่งงานได้ทันที) */
  label: string;
  priority: "high" | "normal";
  /** ข้อความต้นฉบับของลูกค้าที่ทำให้เกิดข้อนี้ — ต้องแสดงควบเสมอ */
  evidenceQuote: string;
}

export interface AiCfChecklist {
  design_job_id: string;
  /** ฟีดแบ็กดิบจากลูกค้า (แสดงคู่กับเช็กลิสต์เสมอ) */
  sourceFeedback: string;
  items: AiCfChecklistItem[];
  confidence: number;
}

export const AI_CF_CHECKLISTS: Record<string, AiCfChecklist> = {
  "dsj-28": {
    design_job_id: "dsj-28",
    sourceFeedback:
      "ลายน่ารักมากค่ะ แต่รู้สึกว่าตัวแมวเล็กไปหน่อย อยากให้ใหญ่ขึ้นอีกนิด แล้วสีพื้นครีมอ่อนไปค่ะ ขอเข้มกว่านี้หน่อย ส่วนโลโก้ร้านขอย้ายไปมุมล่างขวาแทนได้ไหมคะ",
    confidence: 0.89,
    items: [
      {
        key: "scale-cat",
        label: "ขยายตัวแมวให้ใหญ่ขึ้นประมาณ 15–20% ของความกว้างผืน",
        priority: "high",
        evidenceQuote: "ตัวแมวเล็กไปหน่อย อยากให้ใหญ่ขึ้นอีกนิด",
      },
      {
        key: "bg-tone",
        label: "ปรับสีพื้นครีมให้เข้มขึ้น 1 ระดับ",
        priority: "high",
        evidenceQuote: "สีพื้นครีมอ่อนไปค่ะ ขอเข้มกว่านี้หน่อย",
      },
      {
        key: "logo-pos",
        label: "ย้ายโลโก้ร้านไปมุมล่างขวา (เว้นขอบปลอดภัย 2 ซม.)",
        priority: "normal",
        evidenceQuote: "โลโก้ร้านขอย้ายไปมุมล่างขวาแทนได้ไหมคะ",
      },
    ],
  },
  "dsj-10": {
    design_job_id: "dsj-10",
    sourceFeedback:
      "ขอบคุณค่ะ แต่ตัวหนังสือชื่อบ้านอ่านยากนิดนึง ขอฟอนต์หนากว่านี้ได้ไหมคะ แล้วขอบพรมอยากได้สีเทาแทนสีดำค่ะ",
    confidence: 0.84,
    items: [
      {
        key: "font-weight",
        label: "เปลี่ยนฟอนต์ชื่อบ้านเป็นน้ำหนักหนาขึ้น (bold) ให้อ่านง่ายจากระยะยืน",
        priority: "high",
        evidenceQuote: "ตัวหนังสือชื่อบ้านอ่านยากนิดนึง ขอฟอนต์หนากว่านี้",
      },
      {
        key: "edge-color",
        label: "เปลี่ยนสีขอบพรมจากดำเป็นเทา (แจ้งฝ่ายผลิตให้เปลี่ยนด้ายเย็บโพ้ง)",
        priority: "normal",
        evidenceQuote: "ขอบพรมอยากได้สีเทาแทนสีดำค่ะ",
      },
    ],
  },
};

export function fallbackCfChecklist(designJobId: string, feedback: string | null): AiCfChecklist {
  return {
    design_job_id: designJobId,
    sourceFeedback: feedback ?? "ยังไม่มีฟีดแบ็กจากลูกค้าในงานนี้",
    confidence: 0.5,
    items: feedback
      ? [
          {
            key: "review-manually",
            label: "อ่านฟีดแบ็กต้นฉบับแล้วสรุปสิ่งที่ต้องแก้ด้วยตัวเอง (AI ยังสรุปได้ไม่ชัดพอ)",
            priority: "high",
            evidenceQuote: feedback,
          },
        ]
      : [],
  };
}

export function aiCfChecklistFor(designJobId: string, feedback?: string | null): AiCfChecklist {
  return AI_CF_CHECKLISTS[designJobId] ?? fallbackCfChecklist(designJobId, feedback ?? null);
}

// ───────────────────────────────────────────────────────────────────────────
// §5.5 (must) เตือนงานเสี่ยงเลยกำหนด — สรุปเป็นภาษาคน + ควรทำอะไรก่อน  [หน้าภาพรวม]
// ───────────────────────────────────────────────────────────────────────────
//
// วิธีทำงาน (ตรงกับ guardrail §5.5 + CONTEXT §12 cost control):
//   ชั้น 1 = **rule-based** คัดงานเสี่ยงจาก metrics.ts (เลยกำหนด / ใกล้ครบกำหนด / ค้างรอ CF / วัสดุใกล้หมด)
//   ชั้น 2 = **AI** เรียบเรียงเป็นภาษาคน + จัดลำดับว่าควรทำอะไรก่อน 3 ข้อ
// prototype = canned: ประโยคเตรียมไว้ที่นี่ แล้วเติมเลขออเดอร์/จำนวนจริงจาก state ตอนเรียก
// 🔒 §2.3 ข้อ 5: ผลลัพธ์ห้ามมีตัวเลขต้นทุน/กำไร — ไฟล์นี้จึงมีแต่จำนวนงาน/เลขที่ออเดอร์/จำนวนวัน

export interface AiRiskInput {
  /** ออเดอร์ที่เลยกำหนดส่งแล้ว (เรียงงานที่เลยนานสุดก่อน) */
  overdue: { orderNo: string; customerName: string; daysLate: number; statusLabel: string }[];
  /** ใกล้ครบกำหนดภายใน 2 วัน */
  atRisk: { orderNo: string; customerName: string; daysLeft: number; statusLabel: string }[];
  /** ค้างรอลูกค้ายืนยันลาย ≥ 2 วัน */
  staleCf: { orderNo: string; customerName: string; daysWaiting: number }[];
  /** วัสดุที่ต่ำกว่าจุดสั่งซื้อ */
  lowStockNames: string[];
}

export interface AiRiskAction {
  key: string;
  /** สิ่งที่ควรทำ (สั่งงานได้ทันที) */
  label: string;
  /** เหตุผลสั้น ๆ ว่าทำไมต้องทำก่อน */
  reason: string;
  /** ออเดอร์ที่เกี่ยวข้อง (ให้ UI ลิงก์ไปหน้างานจริง) */
  orderNos: string[];
  priority: "high" | "normal";
}

export interface AiRiskBriefing {
  /** สรุปสถานการณ์ 2–3 ประโยค ภาษาคน */
  summary: string;
  actions: AiRiskAction[];
  /** 0–1 — บรรทัดรอง/tooltip เท่านั้น */
  confidence: number;
}

function joinOrderNos(list: string[], max = 3): string {
  const head = list.slice(0, max).join(" · ");
  return list.length > max ? `${head} และอีก ${list.length - max} งาน` : head;
}

/** สร้างบทสรุปงานเสี่ยงวันนี้ (canned + เติมข้อมูลจริง — ไม่เดาตัวเลขที่ไม่มีในระบบ) */
export function aiRiskBriefing(input: AiRiskInput): AiRiskBriefing {
  const { overdue, atRisk, staleCf, lowStockNames } = input;
  const actions: AiRiskAction[] = [];

  if (overdue.length > 0) {
    const worst = overdue[0];
    actions.push({
      key: "overdue",
      label: `ดัน ${joinOrderNos(overdue.map((o) => o.orderNo))} ขึ้นหัวคิวผลิตก่อนงานอื่น`,
      reason: `เลยวันที่สัญญากับลูกค้าแล้ว งานที่ช้าที่สุดคือ ${worst.orderNo} (${worst.customerName}) ช้า ${worst.daysLate} วัน ยังอยู่ขั้น “${worst.statusLabel}”`,
      orderNos: overdue.map((o) => o.orderNo),
      priority: "high",
    });
  }

  if (staleCf.length > 0) {
    const oldest = staleCf[0];
    actions.push({
      key: "stale_cf",
      label: `ตามลูกค้า ${joinOrderNos(staleCf.map((o) => o.orderNo))} ให้ยืนยันลายวันนี้`,
      reason: `รอคำยืนยันนานสุด ${oldest.daysWaiting} วัน (${oldest.customerName}) — ยิ่งรอนาน คิวพิมพ์ยิ่งกองท้ายสัปดาห์`,
      orderNos: staleCf.map((o) => o.orderNo),
      priority: "high",
    });
  }

  if (atRisk.length > 0) {
    const soonest = atRisk[0];
    actions.push({
      key: "at_risk",
      label: `จัดคิวพิมพ์ ${joinOrderNos(atRisk.map((o) => o.orderNo))} ให้จบก่อนสิ้นวัน`,
      reason: `ครบกำหนดในอีก ${soonest.daysLeft} วัน ถ้าไม่เริ่มวันนี้จะกลายเป็นงานเลยกำหนดชุดถัดไป`,
      orderNos: atRisk.map((o) => o.orderNo),
      priority: "normal",
    });
  }

  if (lowStockNames.length > 0) {
    actions.push({
      key: "low_stock",
      label: `สั่งวัสดุเพิ่ม: ${lowStockNames.slice(0, 2).join(" · ")}`,
      reason: "ต่ำกว่าจุดสั่งซื้อแล้ว ถ้าหมดกลางสายพิมพ์ งานทั้งคิวจะหยุดรอของ",
      orderNos: [],
      priority: lowStockNames.length > 1 ? "high" : "normal",
    });
  }

  const total = overdue.length + atRisk.length + staleCf.length;
  const summary =
    total === 0 && lowStockNames.length === 0
      ? "วันนี้ยังไม่พบงานเสี่ยงเลยกำหนดและวัสดุก็เพียงพอ — ใช้จังหวะนี้เคลียร์งานที่ครบกำหนดสัปดาห์หน้าล่วงหน้าได้เลย"
      : `วันนี้มีงานที่ต้องรีบ ${total} งาน: เลยกำหนดแล้ว ${overdue.length} งาน · ใกล้ครบกำหนดใน 2 วัน ${atRisk.length} งาน · ค้างรอลูกค้ายืนยันลาย ${staleCf.length} งาน${
          lowStockNames.length > 0
            ? ` และมีวัสดุต่ำกว่าจุดสั่งซื้อ ${lowStockNames.length} รายการ`
            : ""
        }. ถ้าเคลียร์ตามลำดับข้างล่างจะช่วยกันไม่ให้งานชุดถัดไปหลุดกำหนดตามกันไปด้วย`;

  return {
    summary,
    actions: actions.slice(0, 3),
    confidence: total > 0 ? 0.88 : 0.72,
  };
}
