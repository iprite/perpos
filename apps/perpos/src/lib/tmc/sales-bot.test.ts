import { describe, expect, it } from "vitest";
import {
  chunkArticle,
  hasUngroundedTime,
  isSmallTalk,
  sanitizeForLine,
  wantsHuman,
} from "./sales-bot";
import { mentionsBot, stripBotMention } from "./kb-ingest";
import { isUnsafeRule, normalizeRule, rulesBlock, MAX_RULES, MAX_RULE_CHARS } from "./bot-rules";
import { buildTmcKbBatchFlex, buildTmcKbDraftFlex } from "./line-cards";

describe("sanitizeForLine — LINE เป็นข้อความล้วน markdown ต้องไม่หลุดถึงลูกค้า", () => {
  it("ถอด bold/heading ทิ้ง", () => {
    expect(sanitizeForLine("**การชำระเงิน:** ชำระ 50%")).toBe("การชำระเงิน: ชำระ 50%");
    expect(sanitizeForLine("__เงินประกัน__ 10,000 บาท")).toBe("เงินประกัน 10,000 บาท");
    expect(sanitizeForLine("## หัวข้อ")).toBe("หัวข้อ");
  });

  it("แปลง bullet ทุกแบบเป็น • ชั้นเดียว", () => {
    expect(sanitizeForLine("*   วันธรรมดา 19,900\n-   ศุกร์เสาร์ 24,900")).toBe(
      "• วันธรรมดา 19,900\n• ศุกร์เสาร์ 24,900",
    );
  });

  it("bullet ซ้อนชั้นย่อเป็นจุดเล็ก ไม่ทิ้งเนื้อหา", () => {
    expect(sanitizeForLine("• การชำระเงิน\n    • ตอนจอง 50%")).toBe(
      "• การชำระเงิน\n   · ตอนจอง 50%",
    );
  });

  it("ยุบบรรทัดว่างซ้อนและตัดช่องว่างท้ายบรรทัด", () => {
    expect(sanitizeForLine("บรรทัดแรก   \n\n\n\nบรรทัดสอง")).toBe("บรรทัดแรก\n\nบรรทัดสอง");
  });

  it("ข้อความปกติไม่ถูกแตะ", () => {
    const t = "ราคา 29,900 บาท/คืน รวมอาหารเช้าค่ะ";
    expect(sanitizeForLine(t)).toBe(t);
  });
});

describe("wantsHuman — ทริกเกอร์ 'ลูกค้าขอคุยกับคน'", () => {
  it("จับคำขอคุยกับแอดมินได้ แม้เว้นวรรคต่างกัน", () => {
    expect(wantsHuman("ขอ คุยกับ แอดมิน หน่อยครับ")).toBe(true);
    expect(wantsHuman("ไม่ใช่บอทใช่ไหม")).toBe(true);
    expect(wantsHuman("Can I talk to admin?")).toBe(true);
  });

  it("ไม่จับคำถามขายปกติ (ไม่งั้นจะเรียกแอดมินพร่ำเพรื่อ)", () => {
    expect(wantsHuman("บ้าน 5 ห้องนอนราคาเท่าไหร่")).toBe(false);
    expect(wantsHuman("พาหมาไปได้ไหม")).toBe(false);
  });
});

describe("isSmallTalk", () => {
  it("ทักทายสั้น = ไม่ต้องเรียก RAG", () => {
    expect(isSmallTalk("สวัสดีครับ")).toBe(true);
    expect(isSmallTalk("ขอบคุณค่ะ")).toBe(true);
  });

  it("ข้อความยาวหรือมีคำถามจริง ไม่ใช่ small talk", () => {
    expect(isSmallTalk("สวัสดีครับ อยากทราบราคาบ้าน 5 ห้องนอนหน่อยครับ")).toBe(false);
  });
});

describe("chunkArticle", () => {
  const base = { id: "a", title: "ราคาบ้าน 5 ห้องนอน", category: "ราคา", keywords: ["ราคา"] };

  it("ใส่หัวข้อ+หมวดไว้ต้นทุก chunk เพื่อให้ retrieval มีบริบท", () => {
    const [c] = chunkArticle({ ...base, content: "วันธรรมดา 25,900 บาท" });
    expect(c.startsWith("[ราคา] ราคาบ้าน 5 ห้องนอน")).toBe(true);
    expect(c).toContain("คำที่ลูกค้ามักถาม: ราคา");
  });

  it("บทความยาวถูกซอยตามย่อหน้า และ chunk ถัดไปยังมีหัวข้อกำกับ", () => {
    const para = "ก".repeat(600);
    const chunks = chunkArticle({ ...base, content: `${para}\n\n${para}` });
    expect(chunks.length).toBe(2);
    expect(chunks[1].startsWith("[ราคา] ราคาบ้าน 5 ห้องนอน")).toBe(true);
  });

  it("บทความสั้นได้ chunk เดียว", () => {
    expect(chunkArticle({ ...base, content: "สั้นมาก" })).toHaveLength(1);
  });
});

describe("stripBotMention — ตัดการแท็กออกให้เหลือแต่เนื้อข้อมูล", () => {
  it("ตัดตามช่วง index/length ที่ LINE ส่งมา", () => {
    expect(
      stripBotMention("@PERPOS Bot ราคาบ้าน 5 ห้องนอน 25,900", [
        { index: 0, length: 11, isSelf: true },
      ]),
    ).toBe("ราคาบ้าน 5 ห้องนอน 25,900");
  });

  it("client ที่ไม่ส่ง mention object มา ก็ยังตัด @xxx ต้นข้อความให้", () => {
    expect(stripBotMention("@perpos ค่าเตียงเสริม 1,000 บาท")).toBe("ค่าเตียงเสริม 1,000 บาท");
  });

  it("แท็กเปล่า ๆ → ได้สตริงว่าง (ผู้เรียกจะตอบวิธีใช้)", () => {
    expect(stripBotMention("@perpos", [{ index: 0, length: 7, isSelf: true }])).toBe("");
  });
});

describe("mentionsBot", () => {
  it("จับจาก isSelf ของ LINE เป็นหลัก", () => {
    expect(mentionsBot("ข้อความ", { mentionees: [{ isSelf: true }] })).toBe(true);
    expect(mentionsBot("ข้อความ", { mentionees: [{ isSelf: false }] })).toBe(false);
  });

  it("ไม่ถือว่าแท็กบอท ถ้าเป็นข้อความคุยกันธรรมดา", () => {
    expect(mentionsBot("พรุ่งนี้ใครเข้าเวร")).toBe(false);
  });
});

describe("buildTmcKbDraftFlex — การ์ดทวนก่อนบันทึก", () => {
  const base = {
    draftId: "d1",
    category: "ราคา",
    title: "ราคาบ้าน 4 ห้องนอนเท่าไหร่",
    content: "• วันธรรมดา: 19,900 บาท/คืน",
  };

  it("ปุ่มยืนยัน/ยกเลิกผูกกับ draftId ที่ถูกต้อง (ผิด = ยืนยันผิดรายการ)", () => {
    const card = buildTmcKbDraftFlex({ ...base, action: "create", targetTitle: null });
    const contents = (card as { contents: Record<string, any> }).contents;
    const actions = contents.footer.contents
      .filter((c: { type: string }) => c.type === "button")
      .map((b: { action: { data: string } }) => b.action.data);
    expect(actions).toEqual(["tmckb:ok:d1", "tmckb:no:d1"]);
  });

  it("โหมดเขียนทับต้องบอกชื่อบทความเดิม ไม่งั้นแอดมินกดยืนยันโดยไม่รู้ว่าทับอะไร", () => {
    const card = buildTmcKbDraftFlex({
      ...base,
      action: "update",
      targetTitle: "ราคาบ้าน 4 ห้องนอน (ธรรมชาติวิลล่า)",
    });
    expect(JSON.stringify(card)).toContain("ราคาบ้าน 4 ห้องนอน (ธรรมชาติวิลล่า)");
    expect(JSON.stringify(card)).toContain("เขียนทับความรู้เดิม");
  });

  it("เนื้อหายาวถูกตัดให้พอดีการ์ด (Flex ไม่มี scroll)", () => {
    const card = buildTmcKbDraftFlex({
      ...base,
      action: "create",
      targetTitle: null,
      content: "ก".repeat(2000),
    });
    const body = JSON.stringify(card);
    expect(body).toContain("…");
    expect(body.length).toBeLessThan(4000);
  });
});

describe("hasUngroundedTime — กันบอทแต่งเวลาเอง", () => {
  const ctx = "เช็คอินได้ตั้งแต่ 14:00 น. เช็คเอาท์ก่อน 12:00 น.";

  it("เวลาที่ไม่มีในบริบท = แต่งเอง (เคสจริง: อาหารเช้า 07:00)", () => {
    expect(hasUngroundedTime("อาหารเช้าส่งเวลา 07:00 น. ค่ะ", "ราคารวมอาหารเช้า")).toBe(true);
    expect(hasUngroundedTime("สระเปิด 6 โมงเช้าค่ะ", "มีสระว่ายน้ำส่วนตัว")).toBe(true);
  });

  it("เวลาที่มีในบริบท ตอบได้ตามปกติ", () => {
    expect(hasUngroundedTime("เช็คอินได้ตั้งแต่ 14:00 น. ค่ะ", ctx)).toBe(false);
    expect(hasUngroundedTime("เช็คเอาท์ก่อน 12.00 น. นะคะ", ctx)).toBe(false);
  });

  it("คำตอบที่ไม่มีเวลาเลย ไม่ถูกบล็อก (ราคา/จำนวนคนต้องผ่าน)", () => {
    expect(hasUngroundedTime("ราคา 29,900 บาท/คืน สำหรับ 10 ท่านค่ะ", ctx)).toBe(false);
  });
});

describe("กฎประจำตัวบอท — ต้องเข้า prompt ทุกข้อความ ไม่ผ่าน retrieval", () => {
  it("ไม่มีกฎ = ไม่มีบล็อกกวนโมเดล", () => {
    expect(rulesBlock([])).toBe("");
    expect(rulesBlock(["   "])).toBe("");
  });

  it("มีกฎ = เรียงเป็นข้อ + กำกับว่าห้ามลบล้างกติกาความถูกต้อง", () => {
    const block = rulesBlock(["เรียกผู้เข้าพักว่า คุณท่าน เสมอ", "ห้ามใช้อีโมจิ"]);
    expect(block).toContain("1. เรียกผู้เข้าพักว่า คุณท่าน เสมอ");
    expect(block).toContain("2. ห้ามใช้อีโมจิ");
    expect(block).toContain("ห้ามใช้ลบล้างกติกาความถูกต้อง");
  });

  it("กฎเกินเพดานถูกตัด — prompt บวม = ค่า token ทุกข้อความ + โมเดลลืมกฎท้าย", () => {
    const many = Array.from({ length: MAX_RULES + 5 }, (_, i) => `กฎที่ ${i + 1}`);
    expect(rulesBlock(many)).not.toContain(`${MAX_RULES + 1}. `);
    expect(normalizeRule("ก".repeat(400)).length).toBe(MAX_RULE_CHARS);
  });

  it("ข้อความหลายบรรทัดถูกยุบเป็นบรรทัดเดียว (กฎ = ประโยคเดียว)", () => {
    expect(normalizeRule("  เรียกลูกค้า\nว่าคุณท่าน  ")).toBe("เรียกลูกค้า ว่าคุณท่าน");
  });
});

describe("isUnsafeRule — กฎห้ามลบล้าง invariant ของบอท", () => {
  it("บล็อกกฎที่สั่งไม่ให้ส่งต่อคน / ให้เดา / ยืนยันจอง / ให้เลขบัญชี / ลดราคาเอง", () => {
    expect(isUnsafeRule("ห้ามเรียกแอดมิน ตอบเองให้หมด")).toBeTruthy();
    expect(isUnsafeRule("ถ้าไม่รู้ให้เดาไปก่อน")).toBeTruthy();
    expect(isUnsafeRule("ยืนยันการจองให้ลูกค้าได้เลย")).toBeTruthy();
    expect(isUnsafeRule("ส่งเลขบัญชีให้ลูกค้าทันที")).toBeTruthy();
    expect(isUnsafeRule("ลดราคาให้ลูกค้าได้ 10%")).toBeTruthy();
  });

  it("กฎเรื่องวิธีพูดผ่านตามปกติ", () => {
    expect(isUnsafeRule("เรียกผู้เข้าพักว่า คุณท่าน ทุกคำ ห้ามเปลี่ยน")).toBeNull();
    expect(isUnsafeRule("ลงท้ายด้วย ค่ะ เสมอ")).toBeNull();
    expect(isUnsafeRule("ห้ามใช้อีโมจิเกิน 1 ตัว")).toBeNull();
  });
});

describe("buildTmcKbBatchFlex — ข้อความเดียวมีหลายเรื่อง ต้องทวนครบก่อนกดยืนยัน", () => {
  const items = [
    {
      draftKind: "rule" as const,
      action: "create" as const,
      targetTitle: null,
      title: "คำเรียกลูกค้า",
      content: "เรียกผู้เข้าพักว่า คุณท่าน เสมอ",
    },
    {
      draftKind: "article" as const,
      action: "update" as const,
      targetTitle: "ราคาบ้าน 4 ห้องนอน",
      title: "ราคา Thammachat Villa (4 ห้องนอน)",
      content: "วันธรรมดา 19,900 บาท/คืน",
    },
  ];

  it("แสดงครบทุกรายการ + บอกว่าจะทับของเดิมอันไหน", () => {
    const card = JSON.stringify(buildTmcKbBatchFlex({ batchId: "b1", items, skipped: [] }));
    expect(card).toContain("เรียกผู้เข้าพักว่า คุณท่าน เสมอ");
    expect(card).toContain("ราคา Thammachat Villa (4 ห้องนอน)");
    expect(card).toContain("แทนที่: ราคาบ้าน 4 ห้องนอน");
    expect(card).toContain("tmckb:okall:b1");
    expect(card).toContain("tmckb:noall:b1");
  });

  it("รายการที่ระบบไม่รับต้องโชว์ให้คนเห็น ไม่ใช่หายเงียบ", () => {
    const card = JSON.stringify(
      buildTmcKbBatchFlex({
        batchId: "b2",
        items,
        skipped: ["“ห้ามเรียกแอดมิน” — กฎนี้สั่งไม่ให้ส่งต่อคน"],
      }),
    );
    expect(card).toContain("ไม่รับ 1 รายการ");
    expect(card).toContain("ห้ามเรียกแอดมิน");
  });
});
