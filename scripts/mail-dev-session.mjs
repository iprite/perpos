/**
 * มินต์ cookie เซสชันของ PERPOS Mail สำหรับ **ทดสอบบนเครื่อง dev เท่านั้น**
 *
 * ทำไมต้องมี: ล็อกอินจริงต้องกรอกรหัสผ่านกล่องเมลที่หน้า OAuth ของ Stalwart ซึ่ง agent ทำแทนไม่ได้
 * (และไม่ควรทำ) → สคริปต์นี้ใช้ **API key ของแอดมิน** ที่อยู่ใน keychain เป็น access token แทน
 * แล้วเข้ารหัสด้วยรูปแบบเดียวกับ `lib/mail/session.ts` เพื่อให้เปิด `/mail` บน localhost ได้
 *
 * 🔴 ห้ามใช้กับโดเมน prod · ห้าม commit ค่า cookie ที่ได้ · ลบ cookie ทิ้งหลังทดสอบ
 *
 * ใช้:  node scripts/mail-dev-session.mjs            # พิมพ์ค่า cookie
 *      node scripts/mail-dev-session.mjs --snippet  # พิมพ์ JS ที่วางในคอนโซลเบราว์เซอร์ได้เลย
 */
import { createCipheriv, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ENV_PATH = new URL("../apps/perpos/.env.local", import.meta.url);
const env = readFileSync(ENV_PATH, "utf8");
const readEnv = (key) => env.match(new RegExp(`^${key}=(.*)$`, "m"))?.[1]?.trim();

const jmapUrl = readEnv("MAIL_JMAP_URL");
const secretRaw = readEnv("MAIL_SESSION_SECRET");
if (!jmapUrl || !secretRaw) throw new Error("ต้องมี MAIL_JMAP_URL และ MAIL_SESSION_SECRET ใน .env.local");

const key = Buffer.from(secretRaw.split(",")[0].trim(), "base64");
if (key.length !== 32) throw new Error(`MAIL_SESSION_SECRET ต้องเป็น base64 ของ 32 ไบต์ (ได้ ${key.length})`);

const apiKey = execFileSync("security", [
  "find-generic-password",
  "-a",
  process.env.USER,
  "-s",
  "perpos-stalwart-apikey",
  "-w",
])
  .toString()
  .trim();

// ดึงข้อมูล session จาก JMAP เอง — ไม่ต้องพึ่งไฟล์ discovery ที่ค้างอยู่ในเครื่องใคร
const sessionUrl = new URL("session", jmapUrl.endsWith("/") ? jmapUrl : `${jmapUrl}/`).toString();
const res = await fetch(sessionUrl, { headers: { Authorization: `Bearer ${apiKey}` } });
if (!res.ok) throw new Error(`ขอ JMAP session ไม่สำเร็จ (${res.status}) — กุญแจแอดมินหมดอายุหรือยัง?`);
const s = await res.json();

const accountId = s.primaryAccounts["urn:ietf:params:jmap:mail"];
const now = Date.now();
const payload = {
  v: 1,
  accessToken: apiKey,
  refreshToken: "dev-no-refresh",
  expiresAt: now + 2 * 60 * 60 * 1000,
  issuedAt: now,
  email: s.accounts?.[accountId]?.name ?? "admin@perpos.ai",
  accountId,
  apiUrl: s.apiUrl,
  downloadUrl: s.downloadUrl,
  uploadUrl: s.uploadUrl,
};

const iv = randomBytes(12);
const cipher = createCipheriv("aes-256-gcm", key, iv);
const data = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(payload), "utf8")), cipher.final()]);
const cookie = ["v1", iv.toString("base64url"), data.toString("base64url"), cipher.getAuthTag().toString("base64url")].join(".");

if (process.argv.includes("--snippet")) {
  console.log(
    `document.cookie="perpos_mail_session=${cookie}; path=/api/mail";` +
      `document.cookie="perpos_mail_connected=1; path=/";location.href="/mail";`,
  );
} else {
  console.log(cookie);
}
