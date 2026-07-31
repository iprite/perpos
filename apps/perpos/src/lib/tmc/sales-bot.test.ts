import { describe, expect, it } from "vitest";
import { chunkArticle, isSmallTalk, sanitizeForLine, wantsHuman } from "./sales-bot";

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
