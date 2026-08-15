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
 * ห้ามใส่ allow-scripts และ allow-same-origin เด็ดขาด ไม่ว่าด้วยเหตุผลใด
 * รวมถึง "เพื่อวัดความสูง" (สองอันคู่กัน = หลุด sandbox โดยสมบูรณ์)
 */
export const MAIL_IFRAME_SANDBOX = "allow-popups allow-popups-to-escape-sandbox";

const CSP_BASE =
  "style-src 'unsafe-inline'; font-src 'none'; form-action 'none'; base-uri 'none'; frame-src 'none'";

export function mailCsp(showImages: boolean): string {
  return showImages
    ? `default-src 'none'; img-src https: data:; ${CSP_BASE}`
    : `default-src 'none'; img-src 'none'; ${CSP_BASE}`;
}

const SRCDOC_STYLE = [
  "html,body{margin:0;padding:0;background:#ffffff;color:#3c3b3d;",
  "font-family:Sarabun,'Noto Sans Thai',ui-sans-serif,system-ui,sans-serif;",
  "font-size:14px;line-height:1.6;word-break:break-word;}",
  "img{max-width:100%;height:auto;}",
  "table{max-width:100%;}",
  "a{color:#3c3b3d;}",
  "details.quoted-toggle{margin-top:12px;}",
  "details.quoted-toggle>summary{cursor:pointer;color:#656d78;font-size:12px;",
  "list-style:none;padding:4px 8px;border:1px solid #e6e9ee;border-radius:9999px;width:fit-content;}",
].join("");

/** ประกอบ srcdoc — meta CSP ต้องเป็นบรรทัดแรกใน head เสมอ (srcdoc ไม่มี response header) */
export function buildMailSrcdoc(
  html: string | null | undefined,
  opts: { showImages: boolean },
): string {
  const body = html ?? "";
  return [
    '<!doctype html><html lang="th"><head>',
    `<meta http-equiv="Content-Security-Policy" content="${mailCsp(opts.showImages)}">`,
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<style>${SRCDOC_STYLE}</style>`,
    "</head><body>",
    body,
    "</body></html>",
  ].join("");
}
