// สร้างรูปการ์ดแชร์ (og:image) ของหน้า /line — 1200x630 PNG
// รัน: node scripts/og-line-add-friend.mjs   (จาก apps/landing-astro)
// ผลลัพธ์: public/og/line-add-friend.png  → commit ไปกับ repo (build ไม่ต้องมี playwright)
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

// playwright ไม่ได้เป็น dependency ของ landing (ใช้แค่ตอนสร้างรูป) — ยืมจาก pdf-renderer
const require = createRequire(resolve(root, "../../services/pdf-renderer/package.json"));
const { chromium } = require("playwright");

const b64 = (p, mime) => `data:${mime};base64,${readFileSync(resolve(root, p)).toString("base64")}`;

const qr = b64("public/flow/line-oa-qr.png", "image/png");
const neoTech = b64("public/fonts/NeoTech.ttf", "font/ttf");
const thai = b64(
  "node_modules/@fontsource-variable/noto-sans-thai/files/noto-sans-thai-thai-wght-normal.woff2",
  "font/woff2",
);
const latin = b64(
  "node_modules/@fontsource-variable/noto-sans-thai/files/noto-sans-thai-latin-wght-normal.woff2",
  "font/woff2",
);

const html = `<!doctype html>
<meta charset="utf-8" />
<style>
  @font-face { font-family: "Noto Sans Thai"; src: url("${thai}") format("woff2"); font-weight: 100 900; }
  @font-face { font-family: "Noto Sans Thai"; src: url("${latin}") format("woff2"); font-weight: 100 900; }
  @font-face { font-family: "NeoTech"; src: url("${neoTech}") format("truetype"); }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1200px; height: 630px; display: flex; align-items: center; gap: 56px;
    padding: 0 72px; font-family: "Noto Sans Thai", sans-serif; color: #fff;
    background: radial-gradient(120% 140% at 8% 0%, #55535a 0%, #3c3b3d 46%, #262527 100%);
  }
  .glow { position: absolute; right: -140px; top: -160px; width: 620px; height: 620px;
    border-radius: 50%; background: rgba(72, 207, 173, 0.16); filter: blur(10px); }
  .left { flex: 1; position: relative; }
  .lockup { font-family: "NeoTech", sans-serif; font-size: 20px; letter-spacing: 0.18em;
    text-transform: uppercase; color: #48cfad; }
  h1 { margin-top: 26px; font-size: 66px; line-height: 1.18; font-weight: 700; letter-spacing: -0.5px; }
  h1 .oa { color: #48cfad; }
  p { margin-top: 22px; font-size: 26px; line-height: 1.55; color: rgba(255,255,255,0.68); max-width: 640px; }
  .pill { margin-top: 34px; display: inline-flex; align-items: center; gap: 12px;
    background: #06c755; border-radius: 999px; padding: 15px 30px; font-size: 25px; font-weight: 600; }
  .pill svg { width: 27px; height: 27px; fill: #fff; }
  .card { position: relative; width: 300px; background: #fff; border-radius: 30px; padding: 24px;
    box-shadow: 0 30px 70px rgba(0,0,0,0.35); text-align: center; }
  .card img { width: 100%; display: block; border-radius: 16px; }
  .card span { display: block; margin-top: 14px; font-size: 19px; font-weight: 600; color: #3c3b3d; }
  .card small { display: block; margin-top: 4px; font-size: 15px; color: #656d78; }
</style>
<div class="glow"></div>
<div class="left">
  <div class="lockup">PERPOS | FLOW</div>
  <h1>เพิ่มเพื่อน PERPOS<br />บน LINE <span class="oa">@perpos</span></h1>
  <p>ผู้ช่วย AI ในแชต — ถอดเสียงประชุม สรุปรายงาน และบีบ PDF ได้ทันที</p>
  <div class="pill">
    <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 5.64 2 10.13c0 4.02 3.55 7.39 8.35 8.03.32.07.77.21.88.49.1.25.06.64.03.9l-.14.85c-.04.25-.2.99.87.54 1.07-.45 5.76-3.39 7.86-5.81C21.27 13.49 22 11.9 22 10.13 22 5.64 17.52 2 12 2z"/></svg>
    แอดแล้วเริ่มใช้ได้เลย
  </div>
</div>
<div class="card">
  <img src="${qr}" alt="" />
  <span>สแกนเพื่อเพิ่มเพื่อน</span>
  <small>www.perpos.ai/line</small>
</div>`;

const out = resolve(root, "public/og/line-add-friend.png");
mkdirSync(dirname(out), { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: out });
await browser.close();
console.log("wrote", out);
