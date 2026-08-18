/**
 * ตรวจ DNS จริงของโดเมนลูกค้า (MAIL_UI_SPEC §5.1 ข้อ 3 และ 7)
 *
 * ใช้ DNS-over-HTTPS ของ Cloudflare เพราะ Vercel serverless ยิง UDP/53 เองไม่ได้
 *
 * กฎ:
 *  - **ต้องบอกสิ่งที่เจอจริง ไม่ใช่แค่ "ไม่ผ่าน"** — ผู้ใช้ต้องรู้ว่าตอนนี้ค่าคืออะไร ผิดตรงไหน
 *  - ตรวจไม่ได้ (เน็ตพัง/DoH ล่ม) ≠ ตั้งค่าผิด → คืนสถานะ `unknown` ห้ามบอกว่าไม่ผ่าน
 *  - ห้าม cache — ผู้ใช้กำลังนั่งแก้ DNS อยู่ ต้องเห็นผลล่าสุดเสมอ
 */

import "server-only";
import type { MailDnsRecord } from "./dns-records";
import { MAIL_SERVER_HOST, MAIL_SERVER_IPV4 } from "./dns-records";

const DOH_URL = "https://cloudflare-dns.com/dns-query";
const DOH_TIMEOUT_MS = 5_000;

export type MailDnsStatus = "ok" | "missing" | "mismatch" | "unknown";

export interface MailDnsCheck {
  key: string;
  status: MailDnsStatus;
  /** ค่าที่เจอจริงใน DNS ตอนนี้ (ไว้บอกผู้ใช้ว่าผิดตรงไหน) */
  found: string[];
  message: string | null;
}

async function dohLookup(name: string, type: "MX" | "TXT"): Promise<string[] | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOH_TIMEOUT_MS);
  try {
    const res = await fetch(`${DOH_URL}?name=${encodeURIComponent(name)}&type=${type}`, {
      headers: { accept: "application/dns-json" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { Answer?: { data?: string }[] };
    return (
      (body.Answer ?? [])
        .map((a) => (a.data ?? "").trim())
        // TXT ที่ยาวเกิน 255 ตัวถูกหั่นเป็นหลาย "..." → ต่อกลับ + ถอดเครื่องหมายคำพูด
        .map((d) =>
          d.includes('"') ? (d.match(/"([^"]*)"/g) ?? []).map((c) => c.slice(1, -1)).join("") : d,
        )
        .filter(Boolean)
    );
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").replace(/\.$/, "").trim().toLowerCase();
}

function checkOne(record: MailDnsRecord, answers: string[] | null): MailDnsCheck {
  if (answers === null) {
    return {
      key: record.key,
      status: "unknown",
      found: [],
      message: "ตรวจสอบไม่สำเร็จ ลองใหม่อีกครั้ง",
    };
  }

  switch (record.kind) {
    case "mx": {
      if (answers.length === 0) {
        return {
          key: record.key,
          status: "missing",
          found: [],
          message: "ยังไม่พบ MX ของโดเมนนี้",
        };
      }
      const hit = answers.some((a) => normalize(a).endsWith(normalize(MAIL_SERVER_HOST)));
      return {
        key: record.key,
        status: hit ? "ok" : "mismatch",
        found: answers,
        message: hit
          ? null
          : `MX ตอนนี้ชี้ไปที่อื่น (${answers.join(", ")}) ต้องชี้มาที่ ${MAIL_SERVER_HOST}`,
      };
    }
    case "spf": {
      const spf = answers.filter((a) => a.toLowerCase().startsWith("v=spf1"));
      if (spf.length === 0) {
        return {
          key: record.key,
          status: "missing",
          found: [],
          message: "ยังไม่พบ SPF (TXT ที่ขึ้นต้น v=spf1)",
        };
      }
      if (spf.length > 1) {
        return {
          key: record.key,
          status: "mismatch",
          found: spf,
          // SPF ซ้อน 2 อัน = ปลายทางถือว่า permerror ⇒ ตกสแปมทั้งที่ "ใส่ครบแล้ว"
          message: "มี SPF มากกว่า 1 บรรทัด — ต้องรวมเป็นบรรทัดเดียว ไม่งั้นถือว่าผิดทั้งหมด",
        };
      }
      const has = spf[0].toLowerCase().includes(`ip4:${MAIL_SERVER_IPV4}`);
      return {
        key: record.key,
        status: has ? "ok" : "mismatch",
        found: spf,
        message: has ? null : `พบค่า "${spf[0]}" — ต้องเพิ่ม ip4:${MAIL_SERVER_IPV4} เข้าไปด้วย`,
      };
    }
    case "dkim": {
      if (answers.length === 0) {
        return {
          key: record.key,
          status: "missing",
          found: [],
          message: "ยังไม่พบ DKIM ที่ชื่อนี้",
        };
      }
      const want = record.value.replace(/\s+/g, "");
      const hit = answers.some((a) => a.replace(/\s+/g, "") === want);
      return {
        key: record.key,
        status: hit ? "ok" : "mismatch",
        found: answers,
        message: hit ? null : "ค่า DKIM ไม่ตรง — ให้กดคัดลอกค่าใหม่ไปวางทับ (ค่ายาว ตกหล่นง่าย)",
      };
    }
    case "dmarc": {
      const dmarc = answers.filter((a) => a.toLowerCase().startsWith("v=dmarc1"));
      if (dmarc.length === 0) {
        return { key: record.key, status: "missing", found: [], message: "ยังไม่พบ DMARC" };
      }
      return { key: record.key, status: "ok", found: dmarc, message: null };
    }
  }
}

/** ตรวจทุก record พร้อมกัน — คืนผลเรียงตาม `records` ที่ส่งเข้ามา */
export async function checkMailDns(records: MailDnsRecord[]): Promise<MailDnsCheck[]> {
  return Promise.all(records.map(async (r) => checkOne(r, await dohLookup(r.host, r.type))));
}
