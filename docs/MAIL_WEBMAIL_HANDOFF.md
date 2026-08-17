# 📬 PERPOS Mail (webmail) — ส่งต่อให้ session ถัดไป

> อัปเดต **2026-08-17** · main = `0bac3618` · งานถัดไป = **M3 ที่เหลือ (โฟลเดอร์ / ป้ายกำกับ / กฎกรอง)**
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

| รอบ                                                              | สถานะ                 |
| ---------------------------------------------------------------- | --------------------- |
| **M1** อ่านเมล (2 pane · ค้นหา · คีย์ลัด `j/k/Enter/Esc/e/#`)    | ✅                    |
| **M2** เขียน/ตอบ/ส่งต่อ + ไฟล์แนบ + ร่างอัตโนมัติ + เลิกทำ 8 วิ  | ✅                    |
| **M3 มือถือ** ปัดแถวเก็บ/ลบ · FAB · เลขยังไม่ได้อ่านข้าง rail    | ✅                    |
| **M3 ที่เหลือ** โฟลเดอร์ / ป้ายกำกับ / กฎกรอง                    | ❌ **งานถัดไป**       |
| **M4** `/admin/mail` (ภาพรวม/โดเมน/กล่องเมล/สุขภาพระบบ)          | ✅                    |
| ↳ เพิ่ม-ลบโดเมน + **ตัวช่วยตั้ง DNS ที่ตรวจสด**                  | ✅                    |
| ↳ สร้าง-แก้-ลบกล่องเมล + ตั้งรหัสใหม่ + **นามแฝง**               | ✅                    |
| **บัญชีของฉัน** `/account` (ชื่อที่แสดง · รูปโปรไฟล์ · รหัสผ่าน) | ✅                    |
| **มุมมองรายการ** (ซ่อนบานอ่าน)                                   | ✅                    |
| M4 contact/ปฏิทิน                                                | ❌ ยังไม่ทำ (ไม่เร่ง) |

**ของจริงที่ใช้งานอยู่**: `exworker.co.th` ย้ายจาก Bangmod มาแล้วครบ (8 กล่อง · 1,157 ฉบับ ~957 MB)
· เมลเข้า → Stalwart ของเรา · เมลออก → **Resend** (perpos.ai ยังออกทาง Brevo แยกกัน)
· รหัสชั่วคราวของผู้ใช้ exworker = `exworker112233` (ต้องให้เปลี่ยนเอง)

---

## 🎯 งานถัดไป: M3 ที่เหลือ

### สิ่งที่ **ยืนยันแล้วว่า API รองรับ** (ทดสอบสดกับเซิร์ฟเวอร์เมื่อ 2026-08-17)

| ฟีเจอร์     | JMAP ที่ใช้                                                          | ผลทดสอบ                                        |
| ----------- | -------------------------------------------------------------------- | ---------------------------------------------- |
| โฟลเดอร์เอง | `Mailbox/set` (create/update/destroy · `parentId` ทำโฟลเดอร์ซ้อนได้) | ✅ สร้าง/ลบผ่านในนามผู้ใช้                     |
| ป้ายกำกับ   | keyword บน `Email` (`Email/set` → `keywords`)                        | ต้องเลือกชื่อ keyword เอง (ดูข้อควรตัดสินใจ)   |
| กฎกรอง      | `SieveScript/*` (capability `urn:ietf:params:jmap:sieve`)            | ✅ `SieveScript/get` ตอบปกติ (ยังไม่มีสคริปต์) |

### ข้อควรตัดสินใจก่อนลงมือ

1. **โฟลเดอร์ vs ป้ายกำกับ — เอาทั้งคู่ไหม?** ผู้ใช้ทั่วไปสับสนกับสองอย่างนี้เสมอ
   · ถ้าเอาแค่อย่างเดียว **โฟลเดอร์** ตรงกับความคุ้นเคยของคนไทยที่ย้ายมาจาก Outlook มากกว่า
2. **ป้ายกำกับใช้ keyword ชื่ออะไร** — IMAP keyword ต้องไม่ขึ้นต้น `$` ถ้าเป็นของเราเอง
   (`$seen`/`$flagged` เป็นของระบบ) · ต้องคิดเรื่องชื่อไทย (เก็บเป็น keyword ตรง ๆ หรือ map ผ่านตาราง)
3. **กฎกรองเขียน Sieve ให้ผู้ใช้** — ห้ามให้ผู้ใช้พิมพ์ Sieve ดิบ ต้องเป็นฟอร์ม "ถ้า…ให้…"
   แล้ว **generate สคริปต์ที่เดียว** (แบบเดียวกับที่ `lib/mail/dns-records.ts` เป็นแหล่งเดียวของค่า DNS)

### จุดที่ต้องแตะ

| ไฟล์                                                                                  | ทำไม                                                                                                                        |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| [`lib/mail/boxes.ts`](../apps/perpos/src/lib/mail/boxes.ts)                           | **แหล่งเดียว**ของป้าย/ลำดับกล่องระบบ 7 กล่อง — โฟลเดอร์เองต้องต่อจากตรงนี้ ห้ามฮาร์ดโค้ดที่อื่น                             |
| [`components/mail/mail-shell.tsx`](../apps/perpos/src/components/mail/mail-shell.tsx) | rail — ต้องแสดงโฟลเดอร์เองต่อท้ายกล่องระบบ (เลขยังไม่ได้อ่านมาจาก event `mail:mailboxes` ทางเดียว **rail ห้ามยิง API เอง**) |
| [`api/mail/mailboxes/route.ts`](../apps/perpos/src/app/api/mail/mailboxes/route.ts)   | ตอนนี้คืนเฉพาะกล่องระบบ — ต้องคืนโฟลเดอร์เองด้วย                                                                            |
| [`lib/mail/messages.ts`](../apps/perpos/src/lib/mail/messages.ts)                     | `box` ปัจจุบันเป็น enum — ต้องรับ mailboxId อิสระ                                                                           |
| `components/mail/mail-workspace.tsx` (~1,000 บรรทัด)                                  | ⚠️ ใหญ่แล้ว — reviewer เคยแนะให้แตกเป็น hooks ก่อนเพิ่มของใหม่                                                              |

---

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
5. HTML ของเมลอยู่ใน `<iframe srcDoc>` ที่ **ห้ามมี `allow-scripts`/`allow-same-origin`**
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
