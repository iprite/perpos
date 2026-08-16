/**
 * เทสค่าที่ลูกค้าจะคัดลอกไปตั้ง DNS — ผิดที่นี่ = เมลลูกค้าเข้าไม่ได้/ตกสแปม
 * (โซนไฟล์ตัวอย่างคัดจากของจริงที่ Stalwart สร้างให้ perpos.ai)
 */

import { describe, expect, it } from "vitest";

import { MAIL_SERVER_HOST, buildMailDnsRecords, parseDkimRecords, spfValue } from "./dns-records";

const ZONE = `v1-ed25519-20260815._domainkey.perpos.ai. IN TXT "v=DKIM1; k=ed25519; h=sha256; p=OtLaEvIi9yN5xwwQ="
v1-rsa-20260815._domainkey.perpos.ai. IN TXT (
    "v=DKIM1; k=rsa; h=sha256; p=AAAA"
    "BBBBCCCC"
)
_443._tcp.mta-sts.perpos.ai. IN TLSA 3 1 1 70b010550c8cba8c
perpos.ai. IN MX 10 stalwart.perpos.ai.`;

describe("parseDkimRecords", () => {
  it("อ่าน DKIM ได้ทั้งแบบบรรทัดเดียวและแบบวงเล็บหลายบรรทัด", () => {
    const out = parseDkimRecords(ZONE);
    expect(out).toHaveLength(2);
    expect(out[0].host).toBe("v1-ed25519-20260815._domainkey.perpos.ai");
  });

  it("ต่อค่าที่ถูกหั่นเป็นหลายก้อนกลับให้ครบ — ตกหล่นแม้ตัวเดียว DKIM ก็ใช้ไม่ได้", () => {
    const rsa = parseDkimRecords(ZONE)[1];
    expect(rsa.value).toBe("v=DKIM1; k=rsa; h=sha256; p=AAAABBBBCCCC");
  });

  it("ไม่หยิบ record ชนิดอื่นในโซนไฟล์เดียวกันมาปนด้วย", () => {
    for (const r of parseDkimRecords(ZONE)) {
      expect(r.host).toContain("._domainkey.");
    }
  });

  it("ไม่มีโซนไฟล์ = ไม่มี DKIM (ไม่ throw)", () => {
    expect(parseDkimRecords(null)).toEqual([]);
  });
});

describe("buildMailDnsRecords", () => {
  it("MX ต้องชี้มาที่เมลเซิร์ฟเวอร์ ไม่ใช่โดเมนของเว็บแอป", () => {
    const mx = buildMailDnsRecords("acme.co.th", ZONE).find((r) => r.kind === "mx");
    expect(mx?.value).toBe(`10 ${MAIL_SERVER_HOST}`);
    expect(mx?.value).not.toContain("mail.perpos.ai");
  });

  it("SPF ต้องมีทั้ง IP ของเครื่องเราและ relay ที่ใช้ส่งออกจริง", () => {
    expect(spfValue()).toMatch(/^v=spf1 /);
    expect(spfValue()).toContain("include:spf.brevo.com");
    expect(spfValue()).toContain("ip4:");
    expect(spfValue()).toContain("~all");
  });

  it("DMARC อยู่ที่ _dmarc.<domain> และเริ่มที่ p=none เสมอ", () => {
    const dmarc = buildMailDnsRecords("acme.co.th", ZONE).find((r) => r.kind === "dmarc");
    expect(dmarc?.host).toBe("_dmarc.acme.co.th");
    expect(dmarc?.value).toContain("p=none");
    // p=reject ตั้งแต่แรก = เมลลูกค้าถูกปฏิเสธก่อนที่ SPF/DKIM จะนิ่ง
    expect(dmarc?.value).not.toContain("p=reject");
  });

  it("MX/SPF/DKIM เป็นของบังคับ · DMARC ไม่บังคับ", () => {
    const records = buildMailDnsRecords("acme.co.th", ZONE);
    expect(records.filter((r) => r.required).map((r) => r.kind)).toEqual([
      "mx",
      "spf",
      "dkim",
      "dkim",
    ]);
    expect(records.find((r) => r.kind === "dmarc")?.required).toBe(false);
  });

  it("ชื่อโดเมนถูกทำให้เป็นตัวพิมพ์เล็กและตัดจุดท้าย", () => {
    const mx = buildMailDnsRecords("ACME.CO.TH.", null).find((r) => r.kind === "mx");
    expect(mx?.host).toBe("acme.co.th");
  });
});
