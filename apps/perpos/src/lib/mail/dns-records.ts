/**
 * รายการ DNS ที่โดเมนลูกค้าต้องตั้ง (MAIL_UI_SPEC §5.1) — ตรรกะล้วน ไม่มี I/O จึงเทสได้
 *
 * ทำไมต้องมีไฟล์นี้: ตั้ง DNS ผิด = เมลเข้าถังสแปม แล้วลูกค้าโทษเรา
 * ⇒ ค่าที่ให้ลูกค้าคัดลอกต้องมาจาก **ที่เดียว** และตรงกับที่ perpos.ai ใช้จริงอยู่ (พิสูจน์แล้วว่าส่งผ่าน)
 *
 * ⚠️ ย้ายเมลเซิร์ฟเวอร์/เปลี่ยน relay เมื่อไร ต้องแก้ค่าคงที่ในไฟล์นี้ที่เดียว
 *    (ค่าปัจจุบัน = Contabo **SG** `62.146.233.27` — เครื่องเดียวกับเว็บ 2026-08-19 · **ส่งตรงพอร์ต 25 ไม่มี relay** ที่มา: DNS ของ perpos.ai ที่ใช้งานจริง)
 */

/** โฮสต์เมลเซิร์ฟเวอร์ที่ MX ต้องชี้มา — **ไม่ใช่ `mail.perpos.ai`** (นั่นคือเว็บแอป webmail) */
export const MAIL_SERVER_HOST = "mailserver.perpos.ai";
/** IP ของเครื่องเมล — ต้องอยู่ใน SPF เพราะเมลบางส่วนออกจากเครื่องเราตรง ๆ */
export const MAIL_SERVER_IPV4 = "62.146.233.27";
export const MAIL_SERVER_IPV6 = "2407:3640:2351:7994::1";
/** ปลายทางรายงาน DMARC — กล่องของเราเอง (เลิกใช้ relay แล้วจึงไม่ผ่าน Brevo) */
export const MAIL_DMARC_RUA = "dmarc@perpos.ai";

export type MailDnsKind = "mx" | "spf" | "dkim" | "dmarc";

export interface MailDnsRecord {
  key: string;
  kind: MailDnsKind;
  /** ชื่อที่ผู้ใช้ต้องกรอกในหน้าผู้ให้บริการโดเมน (FQDN) */
  host: string;
  type: "MX" | "TXT";
  value: string;
  /** อธิบายเป็นภาษาคนว่า record นี้มีไว้ทำอะไร (§5.1 ข้อ 4 — ห้ามใช้ศัพท์เทคนิคล้วน) */
  title: string;
  description: string;
  /** ไม่มีอันนี้ = ระบบยังใช้งานไม่ได้ (ปุ่มสร้างกล่องเมลต้องถูกล็อก) */
  required: boolean;
}

export function spfValue(): string {
  return `v=spf1 ip4:${MAIL_SERVER_IPV4} ip6:${MAIL_SERVER_IPV6} ~all`;
}

export function dmarcValue(): string {
  return `v=DMARC1; p=none; rua=mailto:${MAIL_DMARC_RUA}`;
}

/**
 * แกะ DKIM ออกจาก `dnsZoneFile` ที่ Stalwart สร้างให้ต่อโดเมน
 * รูปแบบมี 2 แบบในไฟล์เดียวกัน: บรรทัดเดียวจบ และแบบวงเล็บหลายบรรทัด (RSA ที่ค่ายาว)
 * ⇒ ต้องต่อสตริงในวงเล็บกลับเป็นค่าเดียว ไม่งั้นลูกค้าคัดลอกไปได้ค่าครึ่งเดียว
 */
export function parseDkimRecords(zoneFile: string | null): { host: string; value: string }[] {
  if (!zoneFile) return [];
  const out: { host: string; value: string }[] = [];
  // รวมบล็อกวงเล็บ (RSA ที่ค่ายาวถูกหั่นหลายบรรทัด) ให้เหลือบรรทัดเดียวก่อน
  // ⚠️ ต้องยุบขึ้นบรรทัดใหม่ข้างในเป็นช่องว่างด้วย ไม่งั้นลูปที่อ่านทีละบรรทัดจะเห็นแค่ครึ่งเดียว
  const flattened = zoneFile.replace(/\(([\s\S]*?)\)/g, (_m, inner: string) =>
    inner.replace(/\s*\n\s*/g, " "),
  );
  for (const rawLine of flattened.split("\n")) {
    const line = rawLine.trim();
    if (!line || !line.includes("._domainkey.")) continue;
    const match = /^(\S+)\s+IN\s+TXT\s+(.*)$/i.exec(line);
    if (!match) continue;
    const host = match[1].replace(/\.$/, "");
    // ค่าอาจถูกหั่นเป็นหลาย "..." ติดกัน (จำกัด 255 ตัวอักษรต่อชิ้น) → ต่อกลับให้ครบ
    const chunks = match[2].match(/"([^"]*)"/g);
    if (!chunks) continue;
    const value = chunks.map((c) => c.slice(1, -1)).join("");
    if (value) out.push({ host, value });
  }
  return out;
}

/** รายการ record ทั้งหมดที่ลูกค้าต้องตั้ง เรียงตามลำดับที่ควรทำ */
export function buildMailDnsRecords(domain: string, zoneFile: string | null): MailDnsRecord[] {
  const name = domain.trim().replace(/\.$/, "").toLowerCase();
  const records: MailDnsRecord[] = [
    {
      key: "mx",
      kind: "mx",
      host: name,
      type: "MX",
      value: `10 ${MAIL_SERVER_HOST}`,
      title: "MX — รับอีเมลเข้า",
      description: `บอกอินเทอร์เน็ตว่าเมลที่ส่งถึง @${name} ให้ส่งมาที่เซิร์ฟเวอร์ของเรา · ไม่มีอันนี้ = ไม่มีเมลเข้าเลย`,
      required: true,
    },
    {
      key: "spf",
      kind: "spf",
      host: name,
      type: "TXT",
      value: spfValue(),
      title: "SPF — อนุญาตให้เราส่งแทนคุณ",
      description:
        "บอกปลายทางว่าเซิร์ฟเวอร์ไหนส่งเมลในนามโดเมนนี้ได้บ้าง · ไม่มี = เมลที่ส่งออกมักตกถังสแปม",
      required: true,
    },
  ];

  parseDkimRecords(zoneFile).forEach((dkim, i) => {
    records.push({
      key: `dkim-${i}`,
      kind: "dkim",
      host: dkim.host,
      type: "TXT",
      value: dkim.value,
      title: "DKIM — ลงลายเซ็นดิจิทัลให้อีเมล",
      description:
        "ทำให้ปลายทางตรวจได้ว่าเมลออกจากเราจริงและไม่ถูกแก้ระหว่างทาง · ค่ายาวมาก ให้กดคัดลอก ห้ามพิมพ์เอง",
      required: true,
    });
  });

  records.push({
    key: "dmarc",
    kind: "dmarc",
    host: `_dmarc.${name}`,
    type: "TXT",
    value: dmarcValue(),
    title: "DMARC — บอกปลายทางว่าให้ทำยังไงถ้าตรวจไม่ผ่าน",
    description:
      "เริ่มที่ p=none (แค่เฝ้าดู ยังไม่ปฏิเสธเมล) แล้วค่อยเข้มขึ้นเมื่อ SPF/DKIM นิ่งแล้ว",
    required: false,
  });

  return records;
}
