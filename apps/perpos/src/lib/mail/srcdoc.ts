/**
 * ค่าคงที่ของ iframe เมล (sandbox + CSP + สไตล์ใน srcdoc)
 *
 * แยกออกมาจาก `sanitize.ts` **โดยตั้งใจ** เพราะไฟล์นั้น import `sanitize-html` + `cheerio`
 * ที่ระดับ module → client component ที่อยากได้แค่สตริง CSP จะลาก dependency ฝั่งเซิร์ฟเวอร์
 * เข้า bundle ทั้งก้อน · ไฟล์นี้ **ไม่มี dependency ใด ๆ** จึง import ได้ทั้งสองฝั่ง
 * ⇒ มี "แหล่งความจริงเดียว" ของ CSP/sandbox ห้ามคัดลอกไปไว้ที่ component (§7.2/§7.3)
 *
 * `sanitize.ts` re-export ทุกตัวจากไฟล์นี้ — เทสใน `sanitize.test.ts` ครอบให้อัตโนมัติ
 */

/**
 * 🔴 **`allow-same-origin` ห้ามมีเด็ดขาด ไม่ว่าด้วยเหตุผลใด** — frame จะเข้าถึง DOM/cookie
 *    ของ mail.perpos.ai ได้ และถอด sandbox ของตัวเองออกได้ (มีเทสจับข้อนี้โดยเฉพาะ)
 *
 * `allow-scripts` **เดี่ยว ๆ** ต่างจากคู่ข้างบนโดยสิ้นเชิง: frame ได้ origin ทึบ (opaque)
 * แตะหน้าเว็บเราไม่ได้เลย · เปิดไว้เพื่อให้สคริปต์ **ของเราตัวเดียว** วัดความสูงเนื้อหา
 * แล้ว `postMessage` กลับมา (ดู `MAIL_HEIGHT_MESSAGE`) — ไม่งั้นวัดไม่ได้ทั้งจากในและนอก
 * ⇒ ต้องตรึงความสูงตายตัวแล้วให้ผู้ใช้กดปุ่มขยายเอง ซึ่งเป็น UX ที่แย่กว่าเว็บเมลอื่นทุกเจ้า
 *
 * สคริปต์ของเมลเองยังรันไม่ได้อยู่ดี 2 ชั้น: sanitizer ถอด `<script>`/handler ทิ้ง
 * และ CSP เปิดเฉพาะ `'nonce-…'` ที่สุ่มใหม่ทุกครั้ง (เดาไม่ได้ + inline handler ถูกบล็อกอัตโนมัติ)
 */
export const MAIL_IFRAME_SANDBOX = "allow-popups allow-popups-to-escape-sandbox allow-scripts";

/** ชนิดข้อความที่ frame ส่งความสูงกลับมา — ผู้รับต้องตรวจ `event.source` เสมอ (origin เป็น "null") */
export const MAIL_HEIGHT_MESSAGE = "perpos-mail-height";

/**
 * หน้าเว็บขอให้ frame วัดใหม่
 *
 * 🔴 จำเป็น ไม่ใช่ของเผื่อ: `srcdoc` เริ่มโหลด**ทันทีที่ React แทรก iframe ลง DOM**
 *    ซึ่งเกิดก่อน `useEffect` ที่ไปติด listener ⇒ ความสูงใบแรกหายทุกครั้ง (เจอจริงตอนเทส)
 *    ⇒ หน้าเว็บต้อง "ถาม" ซ้ำได้เสมอ ไม่ใช่รอรับอย่างเดียว
 *    (frame ตอบแค่ความสูงของตัวเอง ใครยิง ping มาก็ไม่ได้ข้อมูลเพิ่ม — ไม่ต้องกรองผู้ส่ง)
 */
export const MAIL_HEIGHT_PING = "perpos-mail-measure";

/** ความสูงตั้งต้นก่อนวัดได้ + เพดานกัน frame ยักษ์ทำหน้าพัง (เกินเพดานให้เลื่อนในตัว) */
export const MAIL_IFRAME_MIN_HEIGHT = 320;
export const MAIL_IFRAME_MAX_HEIGHT = 20000;

/** ความสูงสำรองเมื่อวัดไม่สำเร็จ (เบราว์เซอร์บล็อกสคริปต์/ไม่รองรับ sandbox) */
export const MAIL_IFRAME_FALLBACK_HEIGHT = 900;

const CSP_BASE =
  "style-src 'unsafe-inline'; font-src 'none'; form-action 'none'; base-uri 'none'; frame-src 'none'";

/**
 * `script-src 'nonce-…'` เปิดทางให้สคริปต์วัดความสูงของเราตัวเดียว
 * — ห้ามใส่ `'unsafe-inline'`/`'strict-dynamic'` เพิ่มเด็ดขาด (จะเปิดทางให้สคริปต์ในเมลด้วย)
 */
export function mailCsp(showImages: boolean, nonce: string): string {
  const img = showImages ? "img-src https: data:" : "img-src 'none'";
  return `default-src 'none'; ${img}; script-src 'nonce-${nonce}'; ${CSP_BASE}`;
}

const SRCDOC_STYLE = [
  // overflow-x:auto — เมลที่มีตารางกว้างเกินกรอบต้อง "เลื่อนในตัวเอง" ไม่ใช่ล้นออกไปตัดหน้าเว็บ
  "html,body{margin:0;padding:0;background:#ffffff;color:#3c3b3d;overflow-x:auto;",
  "font-family:Sarabun,'Noto Sans Thai',ui-sans-serif,system-ui,sans-serif;",
  "font-size:14px;line-height:1.6;word-break:break-word;}",
  "img{max-width:100%;height:auto;}",
  "table{max-width:100%;}",
  "a{color:#3c3b3d;}",
  "details.quoted-toggle{margin-top:12px;}",
  "details.quoted-toggle>summary{cursor:pointer;color:#656d78;font-size:12px;",
  "list-style:none;padding:4px 8px;border:1px solid #e6e9ee;border-radius:9999px;width:fit-content;}",
].join("");

/**
 * สคริปต์วัดความสูง — เล็กที่สุดเท่าที่ทำได้ และ**ห้ามแตะเนื้อหาของเมล**
 * ส่งซ้ำเมื่อขนาดเปลี่ยน (รูปโหลดเสร็จ / กาง `<details>` ที่ซ่อนข้อความอ้างอิง)
 */
const HEIGHT_SCRIPT = [
  "(function(){",
  "var last=0;",
  "function send(){",
  "var h=Math.max(document.documentElement.scrollHeight,document.body?document.body.scrollHeight:0);",
  "if(h===last)return;last=h;",
  `parent.postMessage({type:'${MAIL_HEIGHT_MESSAGE}',height:h},'*');`,
  "}",
  "send();",
  "addEventListener('load',send);",
  `addEventListener('message',function(e){if(e.data&&e.data.type==='${MAIL_HEIGHT_PING}'){last=0;send();}});`,
  "if(window.ResizeObserver&&document.documentElement){new ResizeObserver(send).observe(document.documentElement);}",
  // ยังเผื่อไว้สำหรับเบราว์เซอร์ที่ ResizeObserver ไม่ยิงตอนรูปมาช้า
  "setTimeout(send,400);setTimeout(send,1500);",
  "})();",
].join("");

/** ตัวอักษรที่ปลอดภัยสำหรับ nonce — ค่าที่ผิดรูปจะทำให้ CSP ทั้งบรรทัดเพี้ยน */
export function isValidCspNonce(nonce: string): boolean {
  return /^[A-Za-z0-9+/=_-]{16,128}$/.test(nonce);
}

/**
 * ประกอบ srcdoc — meta CSP ต้องเป็นบรรทัดแรกใน head เสมอ (srcdoc ไม่มี response header)
 * `nonce` ต้อง **สุ่มใหม่ทุกฉบับ/ทุกครั้งที่ประกอบ** ห้ามใช้ค่าคงที่ (ไม่งั้นเดาได้ = เปิดทางสคริปต์ในเมล)
 */
export function buildMailSrcdoc(
  html: string | null | undefined,
  opts: { showImages: boolean; nonce: string },
): string {
  if (!isValidCspNonce(opts.nonce)) throw new Error("invalid CSP nonce");
  const body = html ?? "";
  return [
    '<!doctype html><html lang="th"><head>',
    `<meta http-equiv="Content-Security-Policy" content="${mailCsp(opts.showImages, opts.nonce)}">`,
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<style>${SRCDOC_STYLE}</style>`,
    "</head><body>",
    body,
    `<script nonce="${opts.nonce}">${HEIGHT_SCRIPT}</script>`,
    "</body></html>",
  ].join("");
}
