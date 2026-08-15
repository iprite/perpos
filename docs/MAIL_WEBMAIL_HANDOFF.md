# 📬 PERPOS Mail (webmail) — ส่งต่อให้ session ถัดไป

> อัปเดต 2026-08-15 · branch **`feat/mail-webmail-read`** (commit `8466a251`, ยังไม่ push)
> เอกสารนี้ = **ทำอะไรต่อ** · สัญญาเต็มอยู่ที่ [`.claude/feature-factory/specs/mail-webmail-read.md`](../.claude/feature-factory/specs/mail-webmail-read.md) (646 บรรทัด)
> UI/UX อยู่ที่ [`MAIL_UI_SPEC.md`](MAIL_UI_SPEC.md) · เมลเซิร์ฟเวอร์อยู่ที่ [`MAIL_HANDOFF.md`](MAIL_HANDOFF.md)

## 🎯 คำสั่งล่าสุดจากเจ้าของ (2026-08-15)

**แยก PERPOS Mail เป็นผลิตภัณฑ์ที่ 3** นอกจาก Suite (ERP) และ Flow (ผู้ช่วย AI)

| เรื่อง                       | เคาะแล้ว                                                                                     |
| ---------------------------- | -------------------------------------------------------------------------------------------- |
| ผู้ใช้ต้องมีบัญชี PERPOS ไหม | **ไม่ต้อง** — ลูกค้าซื้อกล่องเมลอย่างเดียว ล็อกอินด้วยอีเมล+รหัสของกล่อง (OAuth ไป Stalwart) |
| URL ของ webmail              | **`mail.perpos.ai`**                                                                         |
| Stalwart ย้ายไป              | **`stalwart.perpos.ai`**                                                                     |
| ความสัมพันธ์กับ PERPOS       | **แยกขาดกันสนิท** — ไม่มีลิงก์เชื่อม ไม่มีปุ่มใน toggle                                      |
| ลำดับงาน                     | **ทำ B (แอป) ก่อน A (ย้ายโดเมน)**                                                            |
| อิสระในการรื้อ               | **freestyle ได้ ยังไม่มี user** — ไม่ต้องกังวลเรื่อง backward compat                         |

---

## B. แยกแอปออกจาก PERPOS (ทำก่อน — ไม่แตะเมลที่ใช้งานอยู่)

- [ ] ย้าย `app/(hydrogen)/mail/**` → route group ใหม่ (เช่น `app/(mail)/`) ที่ **ไม่มี AuthGuard ของ PERPOS**
      · layout/shell ของตัวเอง แบรนด์ "PERPOS Mail" · ไม่ใช้ sidebar/header ของ hydrogen
- [ ] หน้า login ของเมลเอง — ปุ่มเดียว → OAuth ไป Stalwart (โค้ด `lib/mail/oauth.ts` ใช้ได้เลย)
- [ ] 🧹 **ถอน diff ออกจาก shared file ให้หมด** (เพราะไม่อยู่ใน hydrogen แล้ว = ไม่ต้องมี):
      `SYSTEM_SEGMENTS` **5 จุด** (`layouts/hydrogen/{layout,menu-items,header-center,sidebar-footer}.tsx`,
      `components/sidebar-module-switcher.tsx`) · `buildMailMenuItems` + branch ใน `pickMenuContext`/`getMenuItems`
      (`menu-items.tsx`) · ลิงก์ "อีเมล" ใน `layouts/profile-menu.tsx`
      → **โค้ดจะสะอาดกว่าเดิม** และ `components/mail/mail-boxes.ts` ย้ายไป `lib/mail/` ได้
- [ ] ผูกโดเมน `mail.perpos.ai` ใน Vercel + ตั้ง env ใหม่ (`APP_BASE_URL`, `MAIL_OAUTH_ISSUER`)
- [ ] **ลงทะเบียน OAuth client ใหม่** (redirect URI เปลี่ยน) — ดูวิธีที่ §A ด้านล่าง

**ของที่ใช้ต่อได้ 100% ไม่ต้องแตะ:** `lib/mail/*` · `app/api/mail/*` · `components/mail/*`
(ออกแบบให้ auth ของเมลแยกจาก PERPOS ตั้งแต่ต้น)

---

## A. ย้าย Stalwart → `stalwart.perpos.ai` (ทำหลัง B — แตะเมลจริง เรียงตามนี้ ห้ามสลับ)

1. เพิ่ม `A`+`AAAA` ของ `stalwart.perpos.ai` → `46.225.14.18` / `2a01:4f8:c2c:105a::1` (DNS only)
2. เพิ่มชื่อใหม่เข้า SAN → รอ ACME ออกใบรับรองผ่าน (⚠️ SAN มี 5 ชื่อ ถ้าชื่อใดล้มทั้ง order ล้ม — ดู `MAIL_HANDOFF.md`)
3. เปลี่ยน **PTR** ที่ Hetzner + `hostname` ใน Stalwart เป็น `stalwart.perpos.ai`
4. ย้าย **MX** → `stalwart.perpos.ai` · **รอ propagate + ทดสอบรับเมลจริงก่อนไปข้อ 5**
5. เปลี่ยน `mail.perpos.ai` A/AAAA ไปชี้ Vercel

> 🔴 **ทำข้อ 5 ก่อนข้อ 4 = เมลเข้าไม่ได้ทันที** (MX ชี้ชื่อที่กลายเป็นเว็บแอปไปแล้ว)
> 🔴 PTR ต้องตรงกับชื่อที่ HELO ใช้ ไม่งั้น deliverability ตก

---

## 🐞 blocker ค้าง 7 ข้อ (ต้องแก้ ไม่ว่าจะย้ายโครงหรือไม่)

### ux-reviewer (FAIL — 4 blocker)

1. **`MailRow` ดัก `Enter`/`Space` เอง ชนกับ hotkey `enter`** (`components/mail/mail-row.tsx:62-67`)
   → กด Enter ครั้งเดียวยิงสองทาง · และ `j`/`k` **ไม่เคยย้าย DOM focus** (`mail-workspace.tsx:473-479`)
   → โฟกัสจริงค้างที่แถวที่คลิกไว้ ส่วนเคอร์เซอร์สายตาอยู่อีกแถว = **เปิด 2 ฉบับคนละใบ**
   · แก้: ถอด `onKeyDown` ออกจาก MailRow **หรือ** ทำ roving tabindex (`focused && rowRef.current?.focus()` + `tabIndex={focused?0:-1}`)
2. **มาร์คอ่านทันทีที่เปิด ไม่มี dwell ไม่มีเลิกทำ** (`mail-workspace.tsx:419`) → พลาดครั้งเดียว "ยังไม่ได้อ่าน" หายถาวร
   · แก้: dwell 1.5–2 วิ ผูกกับ `activeId` (เปลี่ยนก่อนครบ = ยกเลิก)
3. **เปิดด้วย `by=thread` แต่มาร์คอ่านด้วย `by=email`** (`mail-workspace.tsx:422` vs `api/mail/messages/bulk/route.ts:19`)
   → เธรด 3 ฉบับ อ่านครบด้วยตาแต่ค้าง unread 2 · แก้: ส่ง `by:"thread"` ตอนมาร์คอ่านจากการเปิด (คง `email` สำหรับคีย์ `u`)
4. **ตัวเลข unread บนแถบเครื่องมือค้าง** (`mail-workspace.tsx:191-203`) ดึง `/api/mail/mailboxes` ครั้งเดียวต่อกล่อง
   · แก้: แยกเป็น `loadMailboxes()` แล้วเรียกซ้ำหลัง refresh / flushQueue / setReadState (debounce ~1 วิ)

**P1 ที่ควรแก้ด้วย:** ปุ่ม ดาว/เก็บ/ลบ ในบานอ่านเป็น ghost icon เหมือนกัน 3 ปุ่มติดกัน (`mail-reader.tsx:183-213`) → คลิกพลาดง่าย (เกิดขึ้นจริงตอนเทส เมลตกถังขยะ) · `visibilitychange → flushAll()` (`mail-workspace.tsx:399`) = สลับแท็บ = ลบจริงทันที เลิกทำไม่ทัน → ใช้ `pagehide` แทน · Esc ออกจากช่องค้นหาไม่ได้ · แถวเป็น `role="button"` แต่มี `<Button>` ข้างใน (a11y)

### module-reviewer (FAIL — 2 blocker)

5. **`app/api/mail/account/route.ts` เป็น dead code** ไม่มี caller ทั้ง repo → ลบ หรือหา caller จริง
6. **ป้ายชื่อกล่องเมลซ้ำ 2 แหล่ง** — `lib/mail/messages.ts:49-57` vs `components/mail/mail-boxes.ts:19`
   → รวมเป็นแหล่งเดียว (ย้าย `mail-boxes.ts` ไป `lib/mail/` แล้วให้ `messages.ts` import)

### security-reviewer (PASS — แต่มี MEDIUM ที่ควรปิดก่อน prod)

7. **รูป inline `cid:` โหลดทั้งก้อนก่อนตัดงบ** (`lib/mail/messages.ts:525-556`) — ไม่ดู `part.size` เลย
   → ผู้ส่งภายนอกแนบ PNG 300MB × 3 ใบ = แค่ "เปิดอ่าน" ก็ทำ serverless หมด memory และเมลใบนั้นอ่านไม่ได้ถาวร
   · แก้: กรอง `part.size` (>4MB ข้าม) + ตัดยอดสะสมก่อนเรียก `fetchBlob` (`size` มีอยู่แล้วใน `bodyProperties`)
   · **[LOW]** ถอด `'data'` ออกจาก `allowedSchemesByTag.img` (`sanitize.ts:132`) — เราแทน `cid:`→`data:` **หลัง** sanitize อยู่แล้ว

---

## ✅ สิ่งที่ทดสอบแล้วว่าใช้ได้จริง (ไม่ต้องเทสซ้ำ)

- **sanitizer ผ่านครบ** — ยัด HTML อันตราย 12 ชนิด (`<script>` `<svg onload>` `<iframe>` `<form>` `<base>`
  `<meta refresh>` `onload=` `onclick=` `javascript:` `<link>` `<video poster>` tracking pixel `background-image`)
  → กรองออกหมด เหลือข้อความ+ลิงก์ปกติ+`rel="noopener"`
- `sandbox="allow-popups allow-popups-to-escape-sandbox"` (ไม่มี `allow-scripts`/`allow-same-origin`)
  · CSP `default-src 'none'; img-src 'none'; …` อยู่ใน srcdoc ทุก iframe
- 2-pane · ยุบ pane เดียวเมื่อ `<lg` · แถว **64px เป๊ะ** · เธรดยุบขึ้น `(3)` · empty state · `loading.tsx`
- OAuth: PKCE S256 · state · `redirect_uri` จาก `APP_BASE_URL` เท่านั้น
- `tsc` 0 error (ยกเว้น `lib/export/xlsx.ts` = error เดิมบน main) · `lint` 0 · `vitest` **1,336 เทสผ่าน**

## 🔧 สภาพแวดล้อมที่ตั้งไว้แล้ว

`apps/perpos/.env.local` (gitignored):

```
MAIL_JMAP_URL=https://mail.perpos.ai/jmap/
MAIL_OAUTH_ISSUER=https://mail.perpos.ai
MAIL_OAUTH_CLIENT_ID=swc1.9sg5…       # public client + PKCE
MAIL_SESSION_SECRET=<สุ่ม 32 byte>
APP_BASE_URL=http://127.0.0.1:3005    # ⚠️ เดิมเป็น https://app.perpos.io ซึ่งทำ OAuth พัง
```

- ⚠️ **Stalwart ปฏิเสธ `localhost`** ใน redirect_uri (ต้อง `127.0.0.1` หรือ https) — dev ต้องเปิดที่ `http://127.0.0.1:3005`
- ⚠️ **เช็ค `APP_BASE_URL` บน Vercel prod ด้วย** — ถ้าเป็น `.io` OAuth จะพังแบบเดียวกัน
- ลงทะเบียน OAuth client ใหม่: `POST https://<issuer>/auth/register` (ไม่ต้อง auth) ด้วย
  `{"client_name":…,"redirect_uris":[…],"grant_types":["authorization_code","refresh_token"],"token_endpoint_auth_method":"none"}`

## 📮 กล่องทดสอบ

`admin@perpos.ai` มีเมล **10 ฉบับครบทุกรูปแบบ** (หัวเรื่องขึ้นต้น `[SEED]`): HTML+รูปนอก · ไฟล์แนบ PDF+PNG ·
**ฉบับยัด XSS 12 ชนิด** · เมลไทยยาว · อ่านแล้ว+ติดดาว · เธรด 3 ฉบับ · สคริปต์ seed อยู่ที่ scratchpad ของ session เดิม
(สร้างใหม่ได้ด้วย JMAP `Email/set` ลง Inbox ตรง ๆ)

## 📚 อ่านก่อนเริ่ม

1. `.claude/feature-factory/specs/mail-webmail-read.md` — สัญญาทั้งหมด (naming lock, API, กฎ security 12 ข้อ)
2. `docs/MAIL_UI_SPEC.md` — UI/UX
3. `docs/MAIL_HANDOFF.md` §G — วิธีเรียก JMAP admin API ของ Stalwart (capability `urn:stalwart:jmap`, prefix `x:`,
   `/api/schema` = เอกสารตัวจริง)
