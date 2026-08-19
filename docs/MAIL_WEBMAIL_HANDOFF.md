# 📬 PERPOS Mail (webmail) — ส่งต่อให้ session ถัดไป

> อัปเดต **2026-08-17** · **M3 ปิดจบแล้ว (โฟลเดอร์ + กฎกรอง)** — ป้ายกำกับ **ตัดทิ้งถาวร** (ดู §M3)
> งานถัดไป = M4 contact/ปฏิทิน (ยังไม่เร่ง) หรือแผนเมลขาออก
> สัญญาเต็ม: [`.claude/feature-factory/specs/mail-webmail-read.md`](../.claude/feature-factory/specs/mail-webmail-read.md)
> · UI/UX: [`MAIL_UI_SPEC.md`](MAIL_UI_SPEC.md) · เมลเซิร์ฟเวอร์: [`MAIL_HANDOFF.md`](MAIL_HANDOFF.md)
> · แผนเมลขาออก: [`MAIL_SELF_DELIVERY_PLAN.md`](MAIL_SELF_DELIVERY_PLAN.md)

## 🔄 ทิศทางเปลี่ยนแล้ว — อ่านก่อนตัดสินใจอะไร

**เมลไม่ใช่ผลิตภัณฑ์ขายอีกต่อไป (2026-08-17)** — เป็น **เครื่องมือภายใน** ใช้เองในบริษัท + **exworker**
ให้ตัวแทนมีอีเมลองค์กรเพื่อความน่าเชื่อถือ · โควตา 200 MB/คน · **เกณฑ์ตัดสินใจ = ต้นทุนต่ำสุด**

⇒ งานที่ **ยกเลิกแล้ว ไม่ต้องทำ**: M0 หน้าหลังบ้านลูกค้า `/[orgSlug]/mail/*` · ย้ายโฮสต์มาไทย
· ยืนยันโดเมนลูกค้ารายราย · warm-up/suppression ระดับผลิตภัณฑ์

---

## ✅ สถานะปัจจุบัน (ทำงานจริงบน prod)

| รอบ                                                               | สถานะ                 |
| ----------------------------------------------------------------- | --------------------- |
| **M1** อ่านเมล (2 pane · ค้นหา · คีย์ลัด `j/k/Enter/Esc/e/#`)     | ✅                    |
| **M2** เขียน/ตอบ/ส่งต่อ + ไฟล์แนบ + ร่างอัตโนมัติ + เลิกทำ 8 วิ   | ✅                    |
| **M3 มือถือ** ปัดแถวเก็บ/ลบ · FAB · เลขยังไม่ได้อ่านข้าง rail     | ✅                    |
| **M3 โฟลเดอร์เอง** (สร้าง/เปลี่ยนชื่อ/ลบ · ย้ายเมล · rail)        | ✅                    |
| **M3 กฎกรอง** (`/rules` — ฟอร์ม "ถ้า…ให้…" → Sieve)               | ✅                    |
| ~~M3 ป้ายกำกับ~~                                                  | 🚫 ตัดทิ้ง (ดู §M3)   |
| **M4** `/admin/mail` (ภาพรวม/โดเมน/กล่องเมล/สุขภาพระบบ)           | ✅                    |
| ↳ เพิ่ม-ลบโดเมน + **ตัวช่วยตั้ง DNS ที่ตรวจสด**                   | ✅                    |
| ↳ สร้าง-แก้-ลบกล่องเมล + ตั้งรหัสใหม่ + **นามแฝง**                | ✅                    |
| **บัญชีของฉัน** `/account` (ชื่อที่แสดง · รูปโปรไฟล์ · รหัสผ่าน)  | ✅                    |
| **มุมมองรายการ** (ซ่อนบานอ่าน) — **จำค่ารายผู้ใช้** (ดู §ความชอบ) | ✅                    |
| M4 contact/ปฏิทิน                                                 | ❌ ยังไม่ทำ (ไม่เร่ง) |

**ของจริงที่ใช้งานอยู่**: `exworker.co.th` ย้ายจาก Bangmod มาแล้วครบ (8 กล่อง · 1,157 ฉบับ ~957 MB)
· เมลเข้า → Stalwart ของเรา · เมลออก → **Resend** (perpos.ai ยังออกทาง Brevo แยกกัน)
· รหัสชั่วคราวของผู้ใช้ exworker = `exworker112233` (ต้องให้เปลี่ยนเอง)

---

## 📁 M3 — โฟลเดอร์ + กฎกรอง (เสร็จ 2026-08-17)

### ขอบเขตที่ตัดสินใจแล้ว

**เอาโฟลเดอร์ + กฎกรอง · ตัด "ป้ายกำกับ" ทิ้งถาวร** — ผู้ใช้ทั่วไปสับสนระหว่างโฟลเดอร์กับป้ายเสมอ
และคนที่ย้ายมาจาก Outlook คุ้นกับโฟลเดอร์ · จะรื้อกลับมาต้องมีคนขอจริงก่อน

### สิ่งที่ยืนยันกับเซิร์ฟเวอร์จริงแล้ว (ไม่ใช่แค่เอกสาร)

| เรื่อง                            | ผลจริง                                                                                                                                         |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| โฟลเดอร์                          | `Mailbox/set` create/update/destroy ผ่าน · `parentId` ซ้อนได้                                                                                  |
| กฎกรอง                            | เนื้อสคริปต์ส่งเป็น **blob**: upload (`Content-Type: application/sieve`) → `SieveScript/set`                                                   |
| ตรวจสคริปต์                       | `SieveScript/validate` คืน `{error:{type:"invalidScript",…}}` — เรียก**ก่อนเซฟเสมอ**                                                           |
| เปิดใช้งาน                        | `onSuccessActivateScript: "#s"` (ตอน create) / `"<id>"` (ตอน update)                                                                           |
| 🔴 **ลบสคริปต์ที่ active ไม่ได้** | ตอบ `scriptIsActive` · และ `onSuccessActivateScript: null` **ไม่มีผล** ⇒ ออกแบบให้มี **สคริปต์เดียวชื่อ `perpos` แล้วอัปเดตทับตลอด ไม่ต้องลบ** |
| `fileinto` ใช้ **path ไม่ใช่ id** | ทดสอบส่งเมลจริงเข้ามา → เข้าโฟลเดอร์ทั้งชั้นเดียว (`ทดสอบ M3`) และซ้อน (`ทดสอบ M3/ย่อย`) · `setflag "\\Seen"` ทำงาน                            |

### สิ่งที่สร้างไว้

| ไฟล์                                                                | หน้าที่                                                                                             |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [`lib/mail/boxes.ts`](../apps/perpos/src/lib/mail/boxes.ts)         | เพิ่มตัวเลือกกล่อง `f:<mailboxId>` + `resolveBoxSelector` + เพดานโฟลเดอร์ (ไฟล์ pure ใช้ได้สองฝั่ง) |
| [`lib/mail/folders.ts`](../apps/perpos/src/lib/mail/folders.ts)     | CRUD โฟลเดอร์ + `buildMailFolders` (pure, คิด depth/path) + `mailboxPathById`                       |
| [`lib/mail/sieve.ts`](../apps/perpos/src/lib/mail/sieve.ts)         | **แหล่งเดียว**ที่ประกอบ/อ่านสคริปต์ Sieve (pure + 14 เทส)                                           |
| [`lib/mail/rule-meta.ts`](../apps/perpos/src/lib/mail/rule-meta.ts) | ป้าย/เพดานของกฎ — แยกจาก `sieve.ts` เพราะไฟล์นั้นใช้ `Buffer` (import เข้า client ไม่ได้)           |
| [`lib/mail/rules.ts`](../apps/perpos/src/lib/mail/rules.ts)         | คุยกับ `SieveScript/*` + `refreshMailRulesScript()`                                                 |
| `api/mail/folders/*` · `api/mail/rules`                             | REST ของสองเรื่องนี้ (รายการโฟลเดอร์อยู่ใน `GET /api/mail/mailboxes` คำขอเดียวกับกล่องระบบ)         |
| `components/mail/mail-folders-dialog.tsx` · `mail-rules-view.tsx`   | UI จัดการโฟลเดอร์ (dialog จาก rail) + หน้า `/rules`                                                 |

### 🔴 invariant ใหม่ของ M3 (ห้ามพัง)

1. **`fileinto` อ้าง path ไม่ใช่ id** ⇒ ทุกครั้งที่โฟลเดอร์ **เปลี่ยนชื่อ/ย้าย/ถูกลบ** ต้องเรียก
   `refreshMailRulesScript()` (ต่อไว้แล้วใน `PATCH`/`DELETE` ของ `/api/mail/folders/[id]`)
2. **สคริปต์เดียวชื่อ `perpos` ต่อกล่องเมล** — อัปเดตทับตลอด ห้ามเปลี่ยนไปสร้างหลายใบ (ลบไม่ได้ ดูตารางบน)
3. **นิยามกฎเก็บใน `# PERPOS-RULES-V1 <base64>` บรรทัดแรกของสคริปต์** — โซน `(mail)` ห้ามมีตารางใน Supabase
   · สคริปต์ที่**ไม่มี**บรรทัดนี้ = ของคนอื่น ⇒ `foreignScript: true` และ **ห้ามเขียนทับจนกว่าผู้ใช้ยืนยัน**
   (`overwriteForeign: true`)
4. **ค่าที่ผู้ใช้พิมพ์ต้องผ่าน `escapeSieveString` เสมอ** — ไม่งั้นพิมพ์ `"; discard; #` แล้วแทรกคำสั่งลบเมลได้
   (มีเทสคุมข้อนี้โดยตรง)
5. **ลบโฟลเดอร์ = `onDestroyRemoveEmails: false` เท่านั้น** · โฟลเดอร์ที่ยังมีเมล/มีลูก ลบไม่ได้ (409)
6. rail ยังยึด **ข้อมูลชุดเดียวจาก event `mail:mailboxes`** · ยิงเองได้เฉพาะหน้าที่ไม่มี `<MailWorkspace>`
   (`/account`, `/rules`) — มี `gotEventRef` กันซ้อนไว้แล้ว

### ยังไม่ได้ทำ (ถ้าจะต่อ)

- ลากเมลไปวางในโฟลเดอร์ (ตอนนี้ย้ายผ่านปุ่ม "ย้ายไป" ในบานอ่าน/แถบเลือกหลายฉบับ)
- ย้ายโฟลเดอร์ข้ามชั้นจาก UI (API `PATCH parentId` รองรับแล้ว แต่ dialog ยังมีแค่เปลี่ยนชื่อ/ลบ)
- ปุ่ม "ใช้กฎนี้กับเมลที่มีอยู่แล้ว" (ตอนนี้กฎมีผลกับเมลใหม่เท่านั้น — บอกไว้ในหน้าแล้ว)
- `mail-workspace.tsx` ยาว ~1,100 บรรทัด — ควรแตกเป็น hooks ก่อนเพิ่มของใหญ่ชิ้นต่อไป

---

## ⚙️ ความชอบส่วนตัวของผู้ใช้ (มุมมองรายการ)

ค่าจริงเก็บเป็นไฟล์ **`perpos-prefs.json` ใน FileNode ของกล่องเมลเจ้าตัว** ([`lib/mail/prefs.ts`](../apps/perpos/src/lib/mail/prefs.ts)

- `GET|PUT /api/mail/prefs`) — ท่าเดียวกับรูปโปรไฟล์ ⇒ **ตามตัวผู้ใช้ไปทุกเครื่อง** และไม่แตะ DB ของ PERPOS

* localStorage (`perpos_mail_pane`) เหลือเป็น **แคชกันจอวูบ** เท่านั้น — ค่าจากเซิร์ฟเวอร์มาถึงเมื่อไรทับเสมอ
  · ออกจากระบบล้างแคชทิ้ง ([`prefs-storage.ts`](../apps/perpos/src/lib/mail/prefs-storage.ts)) กันเครื่องที่ใช้ร่วมกัน
* อ่านไม่ได้/ไฟล์เพี้ยน = คืนค่าเริ่มต้น (`split`) **ห้ามโยน** — ความชอบพังต้องไม่ทำให้เปิดเมลไม่ได้
* เขียนทับต้อง `destroy` ไฟล์เดิมในคำสั่งเดียวกันเสมอ ไม่งั้นไฟล์เก่าค้างกินโควตาผู้ใช้ (เทสยืนยันแล้วว่าเหลือใบเดียว)
* จะเพิ่มความชอบตัวใหม่ ให้ต่อใน `MailPrefs` + `normalizeMailPrefs` **ที่เดียว** (มีเทสคุมค่าที่อ่านมาเพี้ยน)
* `PUT /api/mail/prefs` รับ **บางช่อง** ได้ — route รวมกับค่าเดิมก่อนเขียนทับ (2026-08-19) เพราะผู้เรียกมีหลายตัว
  (workspace เขียน pane/listWidth · หน้าบัญชีเขียน locale) ถ้าเขียนทับทั้งไฟล์ ตัวหนึ่งจะรีเซ็ตช่องของอีกตัวเงียบ ๆ

## 🌐 ภาษา th/en ของเว็บเมล (2026-08-19)

- แกน = [`lib/mail/i18n/`](../apps/perpos/src/lib/mail/i18n/) — `index.ts` (`translateMail`/`MailMessageKey`/cookie key) ·
  `define.ts` (`defineMailMessages`) · `messages/<พื้นที่>.ts` (พจนานุกรมแยกไฟล์ตามพื้นที่ · **คีย์ขึ้นต้นด้วยชื่อพื้นที่**
  `shell.` `reader.` … · ทุกคีย์มี `{ th, en }` คู่กัน — TypeScript บังคับ ลืมแปลไม่ได้ · เทส `i18n.test.ts` เช็คคีย์/ตัวแปร `{x}` ตรงกันสองภาษา)
- ฝั่ง React = [`components/mail/mail-locale.tsx`](../apps/perpos/src/components/mail/mail-locale.tsx) — `MailLocaleProvider` ห่อใน `MailShell`
  · component ใช้ `useMailT()` / `useMailLocale()` · server component (login) ใช้ `mailTranslator(locale)`
- ค่าที่เลือกเก็บ 3 ที่: **`perpos-prefs.json` ในกล่องเมล (ตัวจริง — ตามตัวไปทุกเครื่อง)** · cookie `perpos_mail_locale`
  (ให้ SSR รู้ก่อน paint แรก ไม่วูบไทย→อังกฤษ) · localStorage (แคช) — ออกจากระบบล้าง cookie+แคชทิ้ง
- ตั้งได้ที่หน้า `/account` การ์ด "ภาษา" (pill ไทย/English) · ค่าเริ่มต้น = ไทย
- ของที่ผูกภาษาผ่านพารามิเตอร์ (ไม่ใช่พจนานุกรม): `formatMailTime(iso, now, locale)` / `formatMailDateTime(iso, locale)`
  (en = ค.ศ. + เดือนอังกฤษ) · `mailBoxLabel(key, locale)` · `MAIL_RULE_*_LABELS_BY_LOCALE[locale]` · shortcuts `labelEn`
- **ห้ามแปล**: ข้อความที่ฝังลงตัวอีเมลขาออก (quote/forward header ใน `lib/mail/compose.ts` — มีเทส) · error จากเซิร์ฟเวอร์ ·
  ชื่อโฟลเดอร์ที่ผู้ใช้ตั้ง · `MAIL_PRODUCT_NAME` · เพิ่มข้อความใหม่ในเว็บเมล = ต้องเพิ่มลงพจนานุกรม ห้ามพิมพ์ไทยลง JSX ตรง ๆ

---

## ⚡ ความเร็วตอนเปิดหน้า (วัดจริง 2026-08-19)

- **ต้นเหตุที่วัดได้**: บน VPS Node ทำ request ทีละตัว · แต่ละ route ของ Next มีค่าโสหุ้ยราว 25–35 ms
  (แม้ `/api/health` เปล่า ๆ) + JMAP อีก 10–150 ms · เดิมเปิดหน้ายิง **7 request พร้อมกัน**
  (SSR + account + avatar + mailboxes + prefs ×2 + identities + messages) → ตัวท้าย ๆ ต่อคิวจนเห็น 400–900 ms
  ใน log ของ Caddy ทั้งที่ route เดี่ยว ๆ วิ่ง 50–270 ms · JMAP/Stalwart เอง**ไม่ช้า** (Mailbox/get 50 ms · list 80–140 ms)
- **แก้แล้ว**: (1) หน้าแรกของรายการขอ `withMailboxes` → ชุดกล่อง+ตัวเลขยังไม่ได้อ่านพ่วงมากับ `/api/mail/messages`
  (เซิร์ฟเวอร์ดึงกล่องอยู่แล้ว ไม่มี JMAP เพิ่ม) — rail ไม่ยิงเองบนหน้ารายการ (2) `/api/mail/prefs` แชร์คำขอเดียว
  (`fetchMailPrefsShared`) ระหว่าง provider ภาษากับ workspace (3) identities เลื่อนไป 2 วิ · avatar 1.5 วิ
  (4) middleware ไม่วิ่งบน `api/mail/*` (dev เคยเสีย getClaims ของ Supabase ทุกคำขอ) ⇒ ตอนเปิดหน้าเหลือ
  SSR + account + prefs + messages
- **วิธีวัดซ้ำ**: `docker logs deploy-caddy-1 | grep mail.perpos.ai` ดู `duration` ต่อ uri · หรือ craft cookie session
  ด้วย admin API key (accountId ใดก็ได้ — admin อ่านข้ามบัญชีได้) แล้ว `fetch` route ตรง `127.0.0.1:3005` ในคอนเทนเนอร์
- **ยังไม่ทำ (ถ้าจะไล่ต่อ)**: cache Mailbox/get ต่อ session สั้น ๆ (list ทุกหน้ายิง `fetchMailboxes` ก่อน query) ·
  รวม `/api/mail/account` เข้ากับ SSR (ติดที่ cookie session อยู่ path `/api/mail`) · ค่าโสหุ้ย 25 ms/route ของ Next
  (Sentry tracing / เครื่อง Contabo) — exapp/riekchang บนเครื่องเดียวกันก็ 13–15 ms

## 🪤 กับดักที่เจอจริง (เสียเวลาไปแล้ว — อย่าเจอซ้ำ)

1. **`ReloadSettings` หลังแก้ config ของ Stalwart เสมอ**
   ตั้ง route/strategy ถูกทุกอย่างแล้วเมลยังออกทางเดิม **เงียบ ๆ ไม่มี error ไม่มี bounce ไม่มีคิวค้าง**
   → `x:Action/set` create `{"@type":"ReloadSettings"}` (ไม่ต้อง ssh ไป restart อย่างที่เอกสารเก่าเขียน)
2. **แก้ DNS ต้องกรองด้วย `name` ไม่ใช่แค่ `type`** — สคริปต์เคยเกือบทับ MX ของ Resend (`send.` subdomain)
   และเกือบทับ `google-site-verification` ตอนแก้ SPF (Cloudflare เก็บ TXT เก่าพร้อมเครื่องหมายคำพูด
   ⇒ `startsWith("v=spf1")` หาไม่เจอ)
3. **`redirect()` ในหน้า = meta refresh 1 วินาที** (เพราะเกิดหลังเริ่ม stream) → จอขาววาบ
   ต้องทำที่ **middleware** ถึงจะได้ 307 จริง
4. **ตรวจ session ก่อนอ่าน body เสมอ** ใน route ที่รับไฟล์ — เคยแก้ที่ `/api/mail/upload` แล้วหลุดซ้ำที่ avatar
5. **Popover วัดระยะจากตัวปุ่ม** — ปุ่มที่สูงไม่เต็ม header ทำให้ panel ไปชนเส้นขอบ → ใช้ prop `offset`
6. **บานรายการกว้าง 380px คงที่ตั้งแต่ lg** — ของที่ใส่ใน toolbar เพิ่มต้องคิดเรื่องนี้เสมอ (เคยล้นกรอบมาแล้ว)
7. **โควตาต้องดูจากที่ใช้จริง** — `somjai@` เต็ม 91% ตั้งแต่วันแรก · `preawnapa@` เกินโควตาเดิมอยู่ก่อนย้าย

---

## 🔬 วิธีเทสที่ใช้ได้จริง (ทำซ้ำได้เลย)

```bash
# 1) เปิด dev server (ชื่อใน .claude/launch.json คือ perpos-dev ไม่ใช่ perpos)
#    ผ่าน preview_start ของ Browser pane

# 2) มินต์ cookie ของกล่องเมลสำหรับ dev — เพราะล็อกอินจริงต้องกรอกรหัสผ่านที่หน้า OAuth ของ Stalwart
node scripts/mail-dev-session.mjs --snippet   # ได้ JS ที่วางในคอนโซลเบราว์เซอร์ได้เลย
# (อ่าน API key จาก keychain + MAIL_JMAP_URL/MAIL_SESSION_SECRET จาก apps/perpos/.env.local
#  แล้วดึง accountId/apiUrl จาก JMAP เอง — ไม่ต้องพึ่งไฟล์ discovery ของ session เก่า)
```

- **ยืนยันด้วยของจริงเสมอ ไม่ใช่แค่ดู UI** — ตรวจซ้ำที่เซิร์ฟเวอร์ผ่าน JMAP admin (API key ใน keychain
  `perpos-stalwart-apikey`) · ส่งเมลจริงแล้วอ่าน `Received:`/`Return-Path:` เพื่อดูว่าเดินเส้นทางไหน
- กล่องทดสอบที่ใช้ได้: **`dmarc@exworker.co.th`** (ว่าง ไม่มีใครใช้ · รหัส `exworker112233`)
  — ทดสอบโฟลเดอร์/ป้าย/Sieve ที่นี่ แล้วลบทิ้ง **อย่าทดลองกับกล่องที่มีคนใช้จริง**

---

## 🔑 ของลับที่อยู่ใน keychain ของเครื่อง dev

| ชื่อ                      | ใช้ทำอะไร                                                        |
| ------------------------- | ---------------------------------------------------------------- |
| `perpos-stalwart-apikey`  | JMAP admin ของ Stalwart (`/admin/mail`, สคริปต์ตรวจสอบ)          |
| `resend-exworker-apikey`  | SMTP relay ของ exworker (send-only)                              |
| `resend-exworker-fullkey` | จัดการโดเมน/อ่าน log ของ Resend                                  |
| `perpos-cf-token`         | Cloudflare DNS (**หมดอายุ 22 ส.ค. 2026** — ขอใหม่เมื่อใช้ไม่ได้) |
| `perpos-hcloud-token`     | Hetzner Cloud                                                    |

---

## 🚫 invariant ที่ห้ามพัง (ย้ำ — มีเทส/รีวิวจับมาแล้วทั้งนั้น)

1. โซน `(mail)` **ห้ามผูกกับ DB/บัญชีของ PERPOS** — รูปโปรไฟล์ยังเก็บใน FileNode ของกล่องเมลเอง
   ด้วยเหตุผลนี้ · โฟลเดอร์/ป้าย/กฎกรองก็ต้องอยู่ที่เมลเซิร์ฟเวอร์ทั้งหมด **ห้ามสร้างตารางใน Supabase**
2. `lib/mail/jmap.ts` = เส้นทางของลูกค้า (token จาก cookie) · `lib/mail/admin-api.ts` = เส้นทางแอดมิน
   (API key) — **ห้ามข้ามฝั่งกัน**
3. แถวรายการ = **เธรด** ⇒ ลบ/เก็บ/อ่านแล้วต้องส่ง `by:"thread"`
4. ลบ/เก็บ = optimistic + คิวเลิกทำ 8 วิ · flush ด้วย `pagehide` เท่านั้น (**ห้าม `visibilitychange`**)
5. HTML ของเมลอยู่ใน `<iframe srcDoc>` ที่ **ห้ามมี `allow-same-origin` เด็ดขาด** — `allow-scripts`
   เดี่ยว ๆ เปิดไว้ (2026-08-17) ให้สคริปต์วัดความสูงของเรา `postMessage` กลับ (ไม่มีปุ่ม "ขยายความสูง" แล้ว)
   · frame เป็น opaque origin แตะหน้าเว็บเราไม่ได้ · สคริปต์ของเมลยังรันไม่ได้ 2 ชั้น (sanitizer + CSP
   `script-src 'nonce-…'` สุ่มใหม่ทุกฉบับ) · ผู้รับ postMessage ต้องตรวจ `event.source` เสมอ (origin เป็น "null")
6. ทุก route `dynamic = "force-dynamic"` + `Cache-Control: private, no-store`
7. `/admin/mail` เห็นได้แค่ metadata — `ADMIN_OBJECTS` ห้ามเพิ่ม `Email/*`/`Mailbox/*`/`MessageContents`

---

## 🧾 ด่านคุณภาพก่อน push (ทำใน `apps/perpos`)

```bash
pnpm exec tsc --noEmit     # ⚠️ มี 3 error เดิมที่ lib/export/xlsx.ts อยู่ก่อนแล้วบน main
pnpm lint                  # ต้อง 0 error
pnpm exec vitest run       # ปัจจุบัน 1,384 เทสผ่าน (47 ไฟล์)
```

merge ได้เลยหลัง push (`gh pr create` + `gh pr merge --squash --delete-branch`) — ไม่ต้องรอ CI
