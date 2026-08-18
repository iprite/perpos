// สร้างการ์ดแชร์ (og:image) ของ app.perpos.ai — 1200x630 PNG
// รัน: node scripts/og-app-card.mjs   (จาก apps/perpos)
// ผลลัพธ์: public/og/app.png → commit ไปกับ repo (build ไม่ต้องมี playwright)
import { readFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

// playwright ไม่ใช่ dependency ของแอป (ใช้แค่ตอนสร้างรูป) — ยืมจาก pdf-renderer
const require = createRequire(resolve(root, "../../services/pdf-renderer/package.json"));
const { chromium } = require("playwright");

const b64 = (p, mime) => `data:${mime};base64,${readFileSync(resolve(root, p)).toString("base64")}`;

const neoTech = b64("src/app/_fonts/NeoTech.ttf", "font/ttf");
// ฟอนต์ไทยแบบ variable weight (หัวข้อต้องหนาจริง ไม่ใช่ตัวหนาสังเคราะห์) — มาจาก
// @fontsource-variable ที่ pnpm hoist ไว้ที่ root · ไม่มีก็ตกไปใช้ .ttf ใน public/fonts
const fontsourceFile = (name) => {
  for (const base of ["node_modules", "../../node_modules"]) {
    const p = `${base}/@fontsource-variable/noto-sans-thai/files/${name}`;
    if (existsSync(resolve(root, p))) return b64(p, "font/woff2");
  }
  return b64("public/fonts/NotoSansThai-Regular.ttf", "font/ttf");
};
const thai = fontsourceFile("noto-sans-thai-thai-wght-normal.woff2");
const latin = fontsourceFile("noto-sans-thai-latin-wght-normal.woff2");

const html = `<!doctype html>
<meta charset="utf-8" />
<style>
  @font-face { font-family: "Noto Sans Thai"; src: url("${thai}") format("woff2"); font-weight: 100 900; }
  @font-face { font-family: "Noto Sans Thai"; src: url("${latin}") format("woff2"); font-weight: 100 900; }
  @font-face { font-family: "NeoTech"; src: url("${neoTech}") format("truetype"); }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1200px; height: 630px; padding: 76px 80px; position: relative; overflow: hidden;
    display: flex; flex-direction: column; justify-content: space-between;
    font-family: "Noto Sans Thai", sans-serif; color: #fff;
    background: radial-gradient(115% 130% at 6% 0%, #55535a 0%, #3c3b3d 48%, #262527 100%);
  }
  .glow { position: absolute; right: -220px; bottom: -300px; width: 860px; height: 860px;
    background: radial-gradient(circle, rgba(72,207,173,0.22) 0%, rgba(72,207,173,0.10) 42%, rgba(72,207,173,0) 68%); }
  .brand { font-family: "NeoTech", sans-serif; font-size: 34px; letter-spacing: 0.2em; }
  .brand .bar { color: rgba(255,255,255,0.3); margin: 0 14px; }
  .brand .sub { color: #48cfad; }
  h1 { position: relative; font-size: 62px; line-height: 1.22; font-weight: 700; letter-spacing: -0.5px; max-width: 940px; }
  h1 .hl { color: #48cfad; }
  .chips { position: relative; display: flex; gap: 14px; }
  .chip { border: 1px solid rgba(255,255,255,0.18); background: rgba(255,255,255,0.06);
    border-radius: 999px; padding: 13px 26px; font-size: 23px; }
  .chip b { font-weight: 700; }
  .chip span { color: rgba(255,255,255,0.6); }
  .foot { position: relative; display: flex; align-items: center; justify-content: space-between;
    font-size: 24px; color: rgba(255,255,255,0.62); }
  .foot .url { color: #fff; font-weight: 600; }
</style>
<div class="glow"></div>
<div class="brand">PERPOS<span class="bar">|</span><span class="sub">SUITE &amp; FLOW</span></div>
<h1>ระบบบัญชี ERP และ<span class="hl"> ผู้ช่วย AI</span><br />สำหรับธุรกิจไทย</h1>
<div class="chips">
  <div class="chip"><b>Suite</b> <span>· ERP ทั้งองค์กร</span></div>
  <div class="chip"><b>Flow</b> <span>· ผู้ช่วย AI บน LINE</span></div>
</div>
<div class="foot"><span>เข้าใช้งานระบบ</span><span class="url">app.perpos.ai</span></div>`;

const out = resolve(root, "public/og/app.png");
mkdirSync(dirname(out), { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: out });
await browser.close();
console.log("wrote", out);
