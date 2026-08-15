# 📬 PERPOS Mail (webmail) — ส่งต่อให้ session ถัดไป

> อัปเดต 2026-08-15 (รอบ 3 — จบ B + blocker 7 ข้อ + P1 + **§A ย้ายโดเมนครบแล้ว**) · branch `feat/mail-standalone-app`
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
| ลำดับงาน                     | ทำ B (แอป) ก่อน A (ย้ายโดเมน) — **ทำครบทั้งคู่แล้ว 2026-08-15**                              |
| อิสระในการรื้อ               | **freestyle ได้ ยังไม่มี user** — ไม่ต้องกังวลเรื่อง backward compat                         |

---

## B. แยกแอปออกจาก PERPOS — ✅ **โค้ดเสร็จแล้ว (2026-08-15)** เหลือแต่งาน ops

### ทำแล้ว (อยู่ในโค้ด)

- [x] ย้าย `app/(hydrogen)/mail/**` → **`app/(mail)/`** — route group ของตัวเอง **ไม่มี AuthGuard/RouteRoleGuard
      /PresenceHeartbeat ของ PERPOS** · `(mail)/layout.tsx` อ่านแค่ cookie "เชื่อมกล่องแล้วหรือยัง" แล้วห่อด้วย
      `<MailShell>` ([components/mail/mail-shell.tsx](../apps/perpos/src/components/mail/mail-shell.tsx))
      = topbar แบรนด์ "PERPOS Mail" + **rail กล่องเมลของตัวเอง** (แทน sidebar ของ PERPOS ที่ UI_SPEC §1 เคยยืมใช้) + ชิปบัญชี/ออกจากระบบ · `(mail)/loading.tsx` + `(mail)/mail/loading.tsx` ครบ (มีเทสกันลืมใน `page-load-standard.test.ts`)
- [x] หน้า login ของเมลเอง — **`/mail/connect` → `/mail/login`** (ปุ่มเดียว → `/api/mail/oauth/start`)
      · เปลี่ยนปลายทาง redirect ครบทุกจุด (oauth callback, disconnect, workspace ตอน 401, เทส `security.test.ts`)
      · ข้อความเปลี่ยนจาก "เชื่อมกล่องเมล/ตัดการเชื่อมต่อ" → "เข้าสู่ระบบ/ออกจากระบบ" (ผลิตภัณฑ์เดี่ยว ไม่ใช่ฟีเจอร์เสริมของ PERPOS)
- [x] 🧹 ถอน diff ออกจาก shared file **หมดแล้ว**: `SYSTEM_SEGMENTS` 5 จุด · `buildMailMenuItems` + branch ใน
      `pickMenuContext`/`getMenuItems` + import ไอคอนที่ค้าง (`menu-items.tsx`) · ลิงก์ "อีเมล" + `AtSign` ใน `profile-menu.tsx`
      → **ไม่มีทางเข้าเมลจากฝั่ง PERPOS อีกแล้ว** (แยกขาดตามที่เคาะ)
- [x] ป้ายกล่องเมลรวมเป็นแหล่งเดียว **`lib/mail/boxes.ts`** (blocker 6 ปิด) — `components/mail/mail-boxes.ts`
      กับสำเนาใน `lib/mail/messages.ts` ถูกลบ · `MAIL_BOX_ORDER` ย้ายมาอยู่ที่นี่ด้วย
- [x] `app/api/mail/account` **ไม่ใช่ dead code แล้ว** (blocker 5 ปิด) — ชิปบัญชีบน topbar เรียกใช้จริง
      (session cookie จำกัด path `/api/mail` ⇒ shell อ่านฝั่ง server ไม่ได้ ต้องถามผ่าน route นี้)

ด่านคุณภาพ: `tsc` 0 error (เหลือ `lib/export/xlsx.ts` ที่พังอยู่แล้วบน main) · `lint` clean · `vitest` 1,336 ผ่าน
· เปิดจริงบน dev แล้ว: `/mail/login` = หน้าเดี่ยวไม่มี chrome ของ PERPOS · `/mail?box=sent` = rail + workspace 2 pane

### เหลือ (ต้องทำที่คอนโซล — เจ้าของระบบทำ)

- [ ] ผูกโดเมน `mail.perpos.ai` ใน Vercel + ตั้ง env ของโดเมนนั้น (`APP_BASE_URL`, `MAIL_OAUTH_ISSUER`)
      — ⚠️ ต้องทำ **หลัง** §A ข้อ 5 (ตอนนี้ `mail.perpos.ai` ยังชี้เมลเซิร์ฟเวอร์อยู่)
- [ ] **ลงทะเบียน OAuth client ใหม่** (redirect URI เปลี่ยนเป็น `https://mail.perpos.ai/api/mail/oauth/callback`) — วิธีอยู่ท้ายเอกสาร
- [ ] ตัดสินใจเรื่อง URL: ตอนนี้ path ยังเป็น `/mail` และ `/mail/login` (ใช้ได้ทั้งบน `app.perpos.ai` และ `mail.perpos.ai`)
      ถ้าอยากให้ `mail.perpos.ai/` ตรง ๆ = กล่องขาเข้า ต้องเพิ่ม host-based rewrite ใน `src/middleware.ts`
      (ยังไม่ทำ — ตั้งใจไม่ใส่ magic ก่อนโดเมนมีจริง)

**ของที่ใช้ต่อได้ 100% ไม่ต้องแตะ:** `lib/mail/*` · `app/api/mail/*` · `components/mail/*`
(ออกแบบให้ auth ของเมลแยกจาก PERPOS ตั้งแต่ต้น)

---

## A. ย้าย Stalwart → `stalwart.perpos.ai` — ✅ **ทำครบทั้ง 5 ขั้นแล้ว (2026-08-15)**

| ขั้น                               | ผล  | หลักฐาน                                                                                                               |
| ---------------------------------- | --- | --------------------------------------------------------------------------------------------------------------------- |
| 1. A/AAAA ของ `stalwart.perpos.ai` | ✅  | `46.225.14.18` / `2a01:4f8:c2c:105a::1` (DNS only, ttl 300)                                                           |
| 2. ใบรับรองครอบชื่อใหม่            | ✅  | Let's Encrypt ถึง 13 พ.ย. 2026 · SAN **6 ชื่อ** = 5 เดิม + `stalwart`                                                 |
| 3. PTR + hostname                  | ✅  | PTR v4/v6 = `stalwart.perpos.ai` · banner พอร์ต 25 = `220 stalwart.perpos.ai` · `hostnamectl` ตรงกัน                  |
| 4. MX → `stalwart.perpos.ai`       | ✅  | ทดสอบรับเมลจริงจากภายนอก (ผ่าน Brevo) → SPF/DKIM/DMARC **pass ทั้งสาม** → ingest เป็น ham เข้า Inbox                  |
| 5. `mail.perpos.ai` → Vercel       | ✅  | CNAME → `e89cf56474f25c59.vercel-dns-017.com` · Vercel `misconfigured:false` · ทดสอบรับเมลซ้ำหลังสลับ **ยังเข้าปกติ** |

### 🔴 กับดักที่เจอจริงตอนทำ (ห้ามลืม)

1. **Stalwart ไม่สั่งออกใบรับรองใหม่เพียงเพราะแก้รายชื่อ SAN หรือ restart** — ลองครบแล้ว
   (แก้ SAN → restart · touch `x:AcmeProvider` · สร้าง provider ใหม่ · ลบใบเก่า) ไม่มีอะไรกระตุ้นได้เลย
   เห็นแต่ `No TLS certificates available` รัวทุก 6 วิ
   · **ท่าที่ได้ผลจริง = สลับ `certificateManagement` เป็น `Manual` แล้วกลับเป็น `Automatic`**
   (ต้องเป็น _transition_ จริง — เขียนทับด้วยค่าเดิมไม่นับ) แล้ว ACME สั่ง order ทันทีใน ~1 นาที
   · ระหว่างนั้น **TLS ตกเป็น self-signed ทุกพอร์ต** ⇒ ห้ามทำในเวลาที่มีคนใช้งาน
2. **ลบใบรับรองตรง ๆ ไม่ได้ถ้ายังถูกอ้างเป็น default** — ได้ `objectIsLinked` จาก `SystemSettings`
   → ต้อง `defaultCertificateId: null` ก่อนค่อยลบ แล้ว **อย่าลืมตั้งกลับ** เมื่อใบใหม่มา
3. **`x:Certificate/get` คืน list ว่าง = ยังไม่มีใบเลย** ใช้เป็นสัญญาณตรวจได้ตรง ๆ
4. **cache ของ resolver สาธารณะไม่ตรงกันหลายนาที** — หลังแก้ MX แล้ว 8.8.8.8 เห็นชื่อใหม่
   แต่ 1.1.1.1 (ของเจ้าของ zone เอง!) ยังคืนชื่อเก่าสลับไปมา · TTL 300 หายเอง
   · ผู้ส่งที่ได้ค่าเก่าจะ **defer แล้ว retry ไม่ใช่ตีกลับ** — แต่ตอกย้ำว่าห้ามสลับข้อ 5 ก่อนข้อ 4
5. **MTA-STS ช่วยไว้**: นโยบายเป็น `mode: testing` และ **ไม่มี TXT `_mta-sts`** เผยแพร่
   ⇒ ไม่มีผู้ส่งบังคับใช้ ช่วงที่ policy ยังชี้ชื่อเก่าจึงไม่อันตราย
   · **ก่อนเปิด `enforce` ต้องเช็คว่า policy อัปเดตชื่อใหม่แล้วเสมอ**

### ค่าที่ตั้งไว้แล้วบน Vercel (โปรเจกต์ `perpos` · production + preview)

```
MAIL_JMAP_URL        = https://stalwart.perpos.ai/jmap/
MAIL_OAUTH_ISSUER    = https://stalwart.perpos.ai
MAIL_OAUTH_CLIENT_ID = swc1.yYkf…      # client ใหม่ redirect = mail.perpos.ai (+127.0.0.1 สำหรับ dev)
MAIL_APP_BASE_URL    = https://mail.perpos.ai
MAIL_SESSION_SECRET  = <สุ่มใหม่ เก็บใน keychain `perpos-mail-session-secret`>
```

- **`MAIL_APP_BASE_URL` เป็น env ใหม่** (`lib/mail/oauth.ts` fallback ไป `APP_BASE_URL` ถ้าไม่ตั้ง)
  จำเป็นเพราะโปรเจกต์ Vercel เดียวเสิร์ฟทั้ง `app.perpos.ai` (Suite/Flow) และ `mail.perpos.ai`
  — ถ้าใช้ `APP_BASE_URL` ร่วมกัน `redirect_uri` จะพาผู้ใช้ข้ามผลิตภัณฑ์แล้ว OAuth พัง
- `.env.local` ของ dev ชี้ไป `stalwart.perpos.ai` แล้วเช่นกัน

### ⏳ เหลือขั้นเดียว

`https://mail.perpos.ai/mail/login` ยัง **404** เพราะ prod ยังเป็นโค้ดเก่า —
ต้อง merge branch `feat/mail-standalone-app` ขึ้น `main` (สั่ง push เมื่อพร้อม) แล้วใช้งานได้ทันที
· หลัง deploy ตรวจ: `vercel ls --prod` = Ready → เปิด `/mail/login` → กดเข้าสู่ระบบ → เด้งกลับมาที่ `mail.perpos.ai` พร้อมกล่องเมล

---

## 🐞 blocker — ✅ **แก้ครบทั้ง 7 ข้อแล้ว (2026-08-15)**

### ux-reviewer (4 ข้อ — ปิดแล้ว)

1. ✅ **`MailRow` ชนกับ hotkey / โฟกัสไม่ตรงกับเคอร์เซอร์** → ถอด `onKeyDown` ออกจาก `MailRow` **และ**
   ทำ **roving tabindex** (`tabIndex={focused?0:-1}` + effect ย้าย DOM focus ตาม `focused`)
   · ย้ายโฟกัสเฉพาะตอนโฟกัสยังอยู่ในรายการ (เช็ค `data-mail-row`) — ไม่แย่งโฟกัสจากช่องค้นหา
   · ⇒ คีย์ลัดมาจาก registry ทางเดียว เปิดฉบับเดียวกับที่ตาเห็นเสมอ
2. ✅ **มาร์คอ่านทันที** → **dwell 1.8 วิ** (`MARK_READ_DWELL_MS`) ผูกกับ `activeId` ใน `useEffect`
   เปลี่ยนฉบับ/ปิดบานอ่านก่อนครบ = cleanup ยกเลิกให้เอง
3. ✅ **เปิด `by=thread` แต่มาร์ค `by=email`** → `setReadState(ids, false, "thread")` ตอนเปิดอ่าน
   (`runBulk` รับ `by` แล้วส่งต่อ API ซึ่งรองรับอยู่แล้ว) · คีย์ `u` ยังเป็น `email` ตามเจตนา
4. ✅ **ตัวเลข unread ค้าง** → แยก `loadMailboxes()` + `scheduleMailboxRefresh()` (debounce 1 วิ)
   เรียกซ้ำหลัง อ่าน/ติดดาว (`runBulk`) · ลบ/เก็บจริง (`flushQueue`) · กดรีเฟรช · poll เจอเมลใหม่

### module-reviewer (2 ข้อ — ปิดไปพร้อมหัวข้อ B)

5. ✅ `app/api/mail/account` มี caller จริงแล้ว = ชิปบัญชีบน topbar ของ PERPOS Mail
6. ✅ ป้ายชื่อกล่องเมลรวมที่ `lib/mail/boxes.ts` แหล่งเดียว

### security-reviewer (1 MEDIUM + 1 LOW — ปิดแล้ว)

7. ✅ **รูป inline `cid:` โหลดทั้งก้อนก่อนตัดงบ** → ตัดสินจาก `part.size` **ก่อน** `fetchBlob` เสมอ:
   เพดานต่อรูป `MAX_INLINE_IMAGE_BYTES` = 4MB · งบรวมไบต์ดิบ `INLINE_FETCH_BUDGET_BYTES`
   = ¾ ของ `INLINE_BUDGET_BYTES` (base64 พอง 4/3) · **ไม่มี `size` = ไม่โหลด** (ยังเปิดเป็นไฟล์แนบได้)
   · ✅ **[LOW]** ถอด `"data"` ออกจาก `allowedSchemesByTag.img` — `cid:`→`data:` เกิดที่ชั้นโครงสร้าง
   **หลัง** sanitize อยู่แล้ว ⇒ ผู้ส่งยัด `data:` เองไม่ได้ (มีเทสคุมใน `sanitize.test.ts`)

### รอบเก็บกวาดหลัง merge (2026-08-15) — ปิด 2 MEDIUM + บั๊กไฟล์แนบ

- ✅ **[MEDIUM] Sentry ไม่ตัดข้อมูลส่วนบุคคลของเมล** → `lib/observability/scrub-mail.ts` (pure, มีเทส)
  ต่อเป็น `beforeSend` + `beforeSendTransaction` ครบทั้ง server/client/edge ·
  ตัด query (ชื่อไฟล์แนบ) · body (คำค้น) · header/cookie · **และ breadcrumb ของ fetch/xhr ที่พก url เต็ม**
- ✅ **[MEDIUM] เธรดยาวไม่มีเพดาน** → `MAX_THREAD_MESSAGES = 30` (`selectThreadWindow`, มีเทส —
  **ฉบับที่ผู้ใช้กดเปิดต้องอยู่ในผลลัพธ์เสมอ** แม้เป็นฉบับเก่ากลางเธรด) ·
  งบรูป inline เปลี่ยนเป็น **ต่อคำขอ** (`InlineBudget` ส่งเป็น reference) ไม่ใช่ต่อฉบับอีกต่อไป ·
  ไม่ตัดเงียบ — บานอ่านขึ้นแถบ "เธรดนี้มี N ฉบับ — แสดง M ฉบับล่าสุด" (`totalMessages` ใน DTO)
- ✅ **[บั๊ก] ปุ่ม "ดู" รูปแนบเปิดไม่ขึ้น** → `attachmentUrl()` ส่ง `type` ไปด้วย
  (ไม่งั้น route ตกเป็น `application/octet-stream` → `attachment` + `nosniff` → รูปไม่ขึ้น)
- ✅ **[เจอตอน deploy จริง] `MAIL_SESSION_SECRET` ผิดรูปแบบ = 500 เปล่า ๆ** — ต้องเป็น **base64 ของ 32 ไบต์**
  (ตั้งเป็น hex แล้ว `parseSessionSecrets` กรองทิ้งหมด → คีย์ว่าง → throw ที่ `/api/mail/oauth/start`)
  · แก้ 2 ชั้น: ตั้งค่าใหม่บน Vercel **และ** `readMailConfig()` เช็ค "ใช้ได้จริง" ไม่ใช่แค่ "มีค่า"
  → ผิดเมื่อไรได้หน้า "ยังไม่ได้ตั้งค่าระบบอีเมล" แทน 500 · กติกาคีย์ย้ายไป `lib/mail/secret.ts` แหล่งเดียว

### 3 LOW สุดท้ายของ security review — ปิดแล้ว (2026-08-15)

- ✅ **`oauth/disconnect` ไม่เช็ค origin** (route เดียวที่ทำงานได้โดยไม่ต้องมี session ⇒ ไม่มีเกราะ
  `SameSite=strict` เหมือน route อื่น) → `isSameOriginRequest()` ใน `api/mail/_lib.ts` (pure + มีเทส)
  · ตรวจจริงแล้ว: cross-site / origin ปลอม / ไม่มี origin = **403** · หน้าเว็บเราเอง = 200
- ✅ **อ่าน blob รูป inline โดยเชื่อ `part.size`** → `readBlobCapped()` นับ byte จริงระหว่างสตรีม
  เกินเพดานเมื่อไร `reader.cancel()` ทิ้งทันที (ท่าเดียวกับ route ไฟล์แนบ) · ขนาดไม่ตรง metadata = ข้ามรูปนั้น
- ✅ **refresh สำเร็จแล้ว handler พังทีหลัง → cookie ใหม่หาย** (refresh token ที่ถูกหมุนแล้วใช้ไม่ได้อีก
  = ผู้ใช้หลุดถาวรเพราะ error ชั่วคราวครั้งเดียว) → `withMailSession` เขียน session ลง error response ด้วย
  **ยกเว้น `MailUnauthorizedError`** ที่ session ตายจริงและ cookie ถูกลบไปแล้ว

**P1 ที่ยังไม่ได้แก้ (ไม่ใช่ blocker):** ปุ่ม ดาว/เก็บ/ลบ ในบานอ่านเป็น ghost icon เหมือนกัน 3 ปุ่มติดกัน
(`mail-reader.tsx:183-213`) คลิกพลาดง่าย · `visibilitychange → flushAll()` (สลับแท็บ = ลบจริงทันที
เลิกทำไม่ทัน) ควรเหลือแค่ `pagehide` · Esc ออกจากช่องค้นหาไม่ได้ · แถวเป็น `role="button"` แต่มี `<Button>` ข้างใน

> ⚠️ ข้อ 1–4 **ยังไม่ได้ทดสอบกับกล่องเมลจริง** (ต้องล็อกอินด้วยรหัสผ่านของกล่อง) — ผ่าน tsc/lint/vitest
> และเปิดหน้าจริงแล้วว่า render/effect ไม่พัง · ให้ทดสอบมือ 4 เคสนี้ตอนมีเซสชัน: กด j/k แล้ว Enter ต้องเปิด
> ฉบับที่เคอร์เซอร์อยู่ · กด j ผ่านเมลยังไม่อ่านเร็ว ๆ ต้องไม่กลายเป็นอ่านแล้ว · เปิดเธรด 3 ฉบับแล้วกลับมา
> ต้องไม่ค้าง unread · ตัวเลข unread ต้องลดหลังอ่าน/ลบ

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
