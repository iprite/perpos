// สร้างไอคอนแท็บของ **PERPOS Mail** — ซองจดหมายขาวบนกรอบมนสี BLUE JEANS (#5D9CEC)
// รัน: node scripts/mail-favicon.mjs   (จาก apps/perpos)
// ผลลัพธ์: public/brand/mail-icon-{32,180,192,512}.png → commit ไปกับ repo
// เหตุที่ต้องมีชุดแยก: โปรเจกต์ Vercel เดียวเสิร์ฟทั้ง app.perpos.ai และ mail.perpos.ai
// ถ้าใช้ไอคอน PERPOS ตัวเดียวกัน เปิดสองแท็บแล้วผู้ใช้แยกไม่ออก
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(resolve(root, "../../services/pdf-renderer/package.json"));
const { chromium } = require("playwright");

const BLUE = "#5D9CEC";

/** ขนาดเล็กต้องเส้นหนาขึ้น + กรอบซองบางลง ไม่งั้นที่ 32px กลายเป็นก้อนสีเดียว */
const svg = (size) => {
  const small = size <= 48;
  const stroke = small ? 7 : 5.5;
  const inset = small ? 17 : 19;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}">
  <rect width="100" height="100" rx="${small ? 20 : 23}" fill="${BLUE}" />
  <rect x="${inset}" y="${inset + 8}" width="${100 - inset * 2}" height="${100 - (inset + 8) * 2 + 16}"
    rx="${small ? 6 : 8}" fill="none" stroke="#fff" stroke-width="${stroke}" />
  <path d="M${inset + 5} ${inset + 16} L50 ${small ? 60 : 58} L${95 - inset} ${inset + 16}"
    fill="none" stroke="#fff" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" />
</svg>`;
};

mkdirSync(resolve(root, "public/brand"), { recursive: true });

const browser = await chromium.launch();
for (const size of [32, 180, 192, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(
    `<style>*{margin:0;padding:0}html,body{background:transparent}</style>${svg(size)}`,
    { waitUntil: "load" },
  );
  const out = resolve(root, `public/brand/mail-icon-${size}.png`);
  await page.screenshot({ path: out, omitBackground: true });
  await page.close();
  console.log("wrote", out);
}
await browser.close();
