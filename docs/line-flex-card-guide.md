# 📖 คัมภีร์ LINE Flex Card Standard — PERPOS

> มาตรฐานบังคับสำหรับ **ทุก LINE Flex Message** ที่ส่งออกจาก PERPOS bot
> เป้าหมาย: การ์ดทุกใบหน้าตาเป็นชุดเดียวกัน — สะอาด พรีเมียม โทน **mono (CHARCOAL)** ตรงกับ brand ของแอป

> ⚠️ **เปลี่ยนทิศทางจากของเดิม (2026-06):** เลิกใช้ **gradient สีสด** (เขียว/แดง/น้ำเงินไล่เฉด) แล้ว — brand เปลี่ยนเป็น **CHARCOAL mono flat** ตาม [DESIGN.md §2](../DESIGN.md). การ์ดยุคใหม่ (บอทประชุม, ผู้ช่วย AI) เป็น **header สีพื้นเรียบ ไม่ไล่เฉด** การ์ดเก่าที่ยังเป็น gradient (`just-me/_line.ts`, `crm/_notify.ts`) = **legacy** ค่อย ๆ migrate ไม่ใช่ต้นแบบ

---

## 0. ต้นแบบ Canonical — การ์ด "ได้รับลิงก์ประชุมแล้ว"

การ์ดมาตรฐานอ้างอิงคือ [`buildLinkConfirmFlex`](../apps/perpos/src/app/api/line/webhook/route.ts#L1501) (การ์ดที่บอทตอบเมื่อได้รับลิงก์ประชุม) — **ลอกโครงนี้เป็นหลักเมื่อสร้างการ์ดใหม่**:

```
┌─────────────────────────────────┐
│  HEADER  bg #3C3B3D · ตัวขาว bold │  ← แถบ mono เรียบ ไม่ไล่เฉด
├─────────────────────────────────┤
│  📹 แพลตฟอร์ม            (ink)   │
│  ┌───────────────────────────┐  │
│  │ ⏳ สถานะ  (info chip)      │  │  ← กล่อง #E6F1FB / ตัว #0C447C
│  └───────────────────────────┘  │
│  คำอธิบายรอง            (#656D78)│
│  ⏱️ โควต้า…              (#9CA3AF)│
│  ───────── separator ─────────  │
│  🔒 fine print          (#9CA3AF)│
├─────────────────────────────────┤
│  FOOTER  [ ✕ ปุ่ม secondary ]    │
└─────────────────────────────────┘
```

โค้ดจริง (ย่อ):
```typescript
{
  type: 'flex',
  altText: '🤖 ได้รับลิงก์ประชุมแล้ว — บอทกำลังเข้าห้อง',  // ← บังคับ มีเสมอ
  contents: {
    type: 'bubble',
    header: { type: 'box', layout: 'horizontal', backgroundColor: '#3C3B3D', paddingAll: '14px',
      contents: [{ type: 'text', text: '🤖 ได้รับลิงก์ประชุมแล้ว', color: '#ffffff', weight: 'bold', size: 'md' }] },
    body: { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '18px', contents: [
      { type: 'text', text: '📹 Zoom', size: 'sm', color: '#1A1A1B' },
      { type: 'box', layout: 'horizontal', backgroundColor: '#E6F1FB', cornerRadius: '8px', paddingAll: '10px', margin: 'sm',
        contents: [{ type: 'text', text: '⏳ บอทกำลังเข้าห้องประชุม…', size: 'sm', color: '#0C447C', wrap: true }] },
      { type: 'text', text: 'บอทจะปรากฏในห้อง… เมื่อจบจะส่ง MoM กลับมาที่นี่', size: 'xs', wrap: true, color: '#656D78', margin: 'md' },
      { type: 'text', text: '⏱️ โควต้าบอทคงเหลือ 60 นาที', size: 'xs', color: '#9CA3AF', margin: 'md' },
      { type: 'separator', margin: 'md' },
      { type: 'text', text: '🔒 ผู้ส่งลิงก์รับผิดชอบ… · ไฟล์เสียงถูกลบทันทีหลังสรุปเสร็จ', size: 'xxs', wrap: true, color: '#9CA3AF', margin: 'md' },
    ] },
    footer: { type: 'box', layout: 'vertical', paddingAll: '14px',
      contents: [{ type: 'button', style: 'secondary', height: 'sm',
        action: { type: 'postback', label: '✕ ยกเลิก ให้บอทออกจากห้อง', data: `botcancel:${jobId}`, displayText: 'ยกเลิกบอท' } }] },
  },
}
```

---

## 1. กฎเหล็ก (Non-negotiable)

1. **ห้าม gradient** — `header` ใช้ `backgroundColor` สีพื้นเรียบเท่านั้น ห้าม `background: { type: 'linearGradient' }` ในการ์ดใหม่
2. **สีต้องมาจาก token ตาราง §2** — LINE JSON ใช้ Tailwind class ไม่ได้ จึงเป็น**ที่เดียวที่ฮาร์ดโค้ด hex ได้** แต่ต้องเป็นค่าที่ตรงกับ [PERPOS Palette (DESIGN.md §2)](../DESIGN.md) เท่านั้น — ห้ามคิดสีใหม่เอง
3. **ทุกการ์ดต้องมี `altText`** — ข้อความสั้นบอกว่าการ์ดนี้คืออะไร (โผล่ใน notification + accessibility)
4. **ข้อความยาวต้อง `wrap: true`** — กันข้อความหายในจอแคบ
5. **ปุ่ม destructive/cancel = `style: 'secondary'`**, ปุ่มหลัก = `style: 'primary', color: '#3C3B3D'` — **ห้ามปุ่ม primary สีแดง/เขียวสด**
6. **เช็ก type ทุกครั้งหลังเขียน**: `cd apps/perpos && pnpm exec tsc --noEmit` (อย่าลืม `as const` บน `type: 'flex'` และ field เฉพาะ)

---

## 2. Design Tokens (hex ที่อนุญาต)

> ค่าทั้งหมด = ค่า resolved ของ [PERPOS Palette](../DESIGN.md#2-color--สี). ใช้เฉพาะในตารางนี้

### Header (แถบบน) — สีพื้นเรียบ
| บทบาท | hex | ใช้เมื่อ |
| :--- | :--- | :--- |
| **Default / Info / Neutral** | `#3C3B3D` (CHARCOAL) | การ์ดทั่วไป, สำเร็จ, สถานะกำลังทำ — **เป็น default** |
| **Error / Critical** | `#D8334A` (RUBY) | ล้มเหลว, โควต้าไม่พอ, เตือนวิกฤต |
| Header text | `#ffffff` | ทุกกรณี · `weight: 'bold'`, `size: 'md'` |

> โทน mono: ส่วนใหญ่ใช้ `#3C3B3D` ทั้งหมด — สีจะไปอยู่ที่ **chip ใน body** ไม่ใช่ที่ header (สงวนแดงไว้ให้เคสผิดจริง ๆ)

### Body — ตัวอักษร
| บทบาท | hex |
| :--- | :--- |
| ข้อความหลัก (ink) | `#1A1A1B` |
| ข้อความรอง / คำอธิบาย | `#656D78` |
| Fine print / โควต้า / หมายเหตุเล็ก | `#9CA3AF` |
| ข้อความ negative (ในเนื้อหา) | `#D8334A` |

### Chip / กล่องเน้นใน body (`cornerRadius: '8px'`, `paddingAll: '10px'`)
| ชนิด | bg | text |
| :--- | :--- | :--- |
| **Info** (สถานะกำลังทำ) | `#E6F1FB` | `#0C447C` |
| **Success** (สรุปสำเร็จ) | `#F2FCF9` | `#065F46` |
| **Error** (เน้นความผิดพลาด) | `#FCF1F2` | `#D8334A` |
| Surface (กล่องข้อมูลเฉย ๆ) | `#F5F7FA` | ตัวตาม body |
| Border (ถ้าต้องการเส้น) | `#E6E9EE` | — |

### ปุ่ม (footer)
| ชนิด | spec |
| :--- | :--- |
| ปุ่มหลัก (ยืนยัน) | `style: 'primary', height: 'sm', color: '#3C3B3D'` |
| ปุ่มรอง / ยกเลิก / destructive | `style: 'secondary', height: 'sm'` |
| ลิงก์รอง (เช่น เติมโควต้า) | `style: 'link', height: 'sm'` |

---

## 3. Spacing & Layout (ค่ามาตรฐาน)

| ส่วน | ค่า |
| :--- | :--- |
| `header` paddingAll | `'14px'` |
| `body` paddingAll | `'18px'` · `spacing: 'sm'` |
| `footer` paddingAll | `'14px'` (มีหลายปุ่ม → `spacing: 'sm'`) |
| chip | `cornerRadius: '8px'`, `paddingAll: '10px'`, `margin: 'sm'` |
| ระยะ field สำคัญ | `margin: 'md'` |
| separator ก่อน fine print | `{ type: 'separator', margin: 'md' }` |
| ขนาด bubble | default (`mega`) สำหรับการ์ดเนื้อหา · `'kilo'` สำหรับการ์ด notification สั้น |

ขนาดตัวอักษร: หัวข้อ `md` bold · เนื้อหา `sm` · คำอธิบาย `xs` · fine print `xxs`

---

## 4. แม่แบบตามชนิดการ์ด (Card Recipes)

อ้างอิงโค้ดจริงเป็นต้นแบบ — อย่าประดิษฐ์ใหม่:

| ชนิดการ์ด | ต้นแบบในโค้ด | ลักษณะ |
| :--- | :--- | :--- |
| **Action / ยืนยัน** (มีปุ่ม postback/uri) | [`buildLinkConfirmFlex`](../apps/perpos/src/app/api/line/webhook/route.ts#L1501), [`buildBotConfirmFlex`](../apps/perpos/src/app/api/line/webhook/route.ts#L1533) | header CHARCOAL + info chip + footer ปุ่ม |
| **Status / แจ้งผล** (สำเร็จ/ล้มเหลว/จบงาน) | [`buildBotFlex`](../apps/perpos/src/lib/assistant/recall-events.ts#L44) | header CHARCOAL (หรือ RUBY ถ้า fatal) + ข้อความ ไม่มีปุ่ม |
| **Error / โควต้าไม่พอ** | [`buildQuotaTopupFlex`](../apps/perpos/src/app/api/line/webhook/route.ts#L1562) | header RUBY + ปุ่มเติมโควต้า |
| **Welcome / Onboarding** | webhook `~L1407` | header CHARCOAL + สรุปสิทธิ์ที่ได้ |

**กฎเลือก header:** ผิดพลาด/วิกฤตจริง → RUBY `#D8334A` · ที่เหลือทั้งหมด (รวม success) → CHARCOAL `#3C3B3D` แล้วสื่อ "สำเร็จ" ผ่าน emoji + success chip ใน body

---

## 5. ส่ง Flex อย่างไร

ใช้ helper ของระบบ — **ห้าม `fetch` LINE API ตรง**:
- **ตอบกลับข้อความ (reply token):** `replyFlex()` ใน [webhook route](../apps/perpos/src/app/api/line/webhook/route.ts) (token ใช้ได้ครั้งเดียว)
- **Push เชิงรุก (เช่น แจ้งผลทีหลัง):** [`sendLineMessages()`](../apps/perpos/src/lib/line/send-messages.ts) — `{ to, messages: [flex] }`

object ที่ build ต้องเป็นรูป `{ type: 'flex', altText, contents: { type: 'bubble', ... } }`

---

## 6. ทดสอบก่อนปล่อย

1. **TypeScript:** `cd apps/perpos && pnpm exec tsc --noEmit` — กัน type mismatch ของ flex schema (ใส่ `as const` ที่ literal type)
2. **LINE Flex Simulator:** วาง JSON ที่ [developers.line.biz/flex-simulator](https://developers.line.biz/flex-simulator/) ดูจริงก่อน
3. **Sanitize free text:** ข้อความจากผู้ใช้/AI (transcript, ชื่อ) ต้องกรอง markdown (`#`, `*`, `` ` ``) + เป็น `wrap: true` ก่อนยัดลงการ์ด กันการ์ดพัง

---

## 7. Checklist สร้างการ์ดใหม่

- [ ] มี `altText` ที่สื่อความหมาย
- [ ] header สีพื้นเรียบจาก §2 (ไม่มี gradient) · ตัวขาว bold md
- [ ] ทุก hex อยู่ในตาราง §2 (= ตรง DESIGN.md)
- [ ] paddingAll: header/footer `14px`, body `18px`
- [ ] ข้อความยาว `wrap: true`
- [ ] ปุ่มหลัก `primary + #3C3B3D` · ยกเลิก `secondary`
- [ ] ลอกโครงจาก recipe §4 ที่ตรงชนิดที่สุด
- [ ] `tsc --noEmit` ผ่าน + พรีวิวใน Simulator
