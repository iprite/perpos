/**
 * ไฮไลต์คำค้นในเนื้อเมล — ตรรกะล้วน ไม่มี DOM จึงเทสได้และรันได้ทั้งสองฝั่ง
 *
 * ทำไมต้องทำที่ชั้นสตริง ไม่ใช่ให้สคริปต์ใน iframe แก้ DOM เอง:
 * สคริปต์ใน frame มีหน้าที่ **วัดความสูงกับเลื่อนจอ** เท่านั้น (กฎใน `srcdoc.ts`)
 * ห้ามแตะเนื้อหาของเมล ⇒ เราแทรก <mark> ตั้งแต่ตอนประกอบ srcdoc แทน
 *
 * ⚠️ ค่าที่ส่งเข้ามาเป็น HTML ที่ผ่าน sanitizer แล้ว — ฟังก์ชันนี้ **ไม่ใช่ตัวกรองความปลอดภัย**
 *    หน้าที่เดียวคือหุ้ม <mark> รอบข้อความที่ตรงคำค้น โดยไม่แตะสิ่งที่อยู่ในแท็ก
 */

/** ผลการไฮไลต์ — `count` ใช้บอกจำนวนที่เจอและคุมปุ่มถัดไป/ก่อนหน้า */
export interface HighlightResult {
  html: string;
  count: number;
}

const SKIP_TAGS = new Set(["style", "script", "title", "textarea"]);

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** แปลง entity เท่าที่จำเป็นเพื่อให้จับคู่คำค้นได้ตรงกับที่ผู้ใช้เห็น */
function decodeEntities(text: string): string {
  return text
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

/**
 * หุ้ม `<mark>` รอบทุกคำที่ตรง — ตัวที่ลำดับ `activeIndex` ได้คลาสเพิ่มเพื่อให้เลื่อนไปหาได้
 *
 * นับเฉพาะข้อความที่ผู้ใช้มองเห็น (ข้ามเนื้อในแท็กและใน `<style>`) ⇒ ตัวเลข "x/y"
 * ตรงกับที่ตาเห็นจริง ไม่ใช่จำนวนครั้งที่คำไปโผล่ในโค้ด
 */
export function highlightHtml(html: string, term: string, activeIndex = 0): HighlightResult {
  const needle = term.trim().toLowerCase();
  if (!needle || !html) return { html, count: 0 };

  const out: string[] = [];
  let count = 0;
  let skipDepth = 0;
  // แบ่งเป็นชิ้น: `<...>` คือแท็ก ที่เหลือคือข้อความ
  const parts = html.split(/(<[^>]*>)/);

  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith("<")) {
      const name = /^<\s*(\/?)\s*([a-zA-Z0-9-]+)/.exec(part);
      if (name && SKIP_TAGS.has(name[2].toLowerCase())) {
        if (name[1]) skipDepth = Math.max(0, skipDepth - 1);
        else if (!part.endsWith("/>")) skipDepth += 1;
      }
      out.push(part);
      continue;
    }
    if (skipDepth > 0) {
      out.push(part);
      continue;
    }

    const plain = decodeEntities(part);
    const lower = plain.toLowerCase();
    let from = 0;
    let piece = "";
    for (;;) {
      const at = lower.indexOf(needle, from);
      if (at === -1) break;
      const cls = count === activeIndex ? "perpos-hit perpos-hit-active" : "perpos-hit";
      piece += escapeHtml(plain.slice(from, at));
      piece += `<mark class="${cls}">${escapeHtml(plain.slice(at, at + needle.length))}</mark>`;
      from = at + needle.length;
      count += 1;
    }
    out.push(from === 0 ? part : piece + escapeHtml(plain.slice(from)));
  }

  return { html: out.join(""), count };
}
