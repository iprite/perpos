# Domain Migration — perpos.io → perpos.ai

Runbook การย้ายโดเมน · subdomain แอป = `app.perpos.ai` · landing = `www.perpos.ai`

**กลยุทธ์:** เพิ่ม `.ai` แบบ "เพิ่มไม่ลบ" — คง callback/redirect ของ `.io` ไว้คู่กันช่วงเปลี่ยนผ่าน แล้วค่อยถอดทีหลัง

**ตัดสินใจแล้ว (ห้ามเปลี่ยน):**
- ✅ **คง `SHADOW_DOMAIN = '@stt-line.perpos.io'`** — email สังเคราะห์ภายในของ LINE user เดิมทุกคนอยู่ใน DB แล้ว เปลี่ยน = login พังทั้งระบบ
- ✅ `app.perpos.ai` (แอป) + `www.perpos.ai` (landing)

---

## ค่าปัจจุบัน (อ่านจาก production แล้ว)

| ที่ | ค่าเดิม | ค่าใหม่ |
|-----|---------|---------|
| Scheduler `perpos-task-scheduler` target | `https://app.perpos.io/api/assistant/scheduler` | `https://app.perpos.ai/api/assistant/scheduler` |
| Cloud Run `perpos-stt-worker` env `APP_BASE_URL` | `https://app.perpos.io` | `https://app.perpos.ai` |

---

## ชั้น 1 — External (ทำก่อน · ส่วนใหญ่ทำผ่าน console)

> ลำดับสำคัญ: ข้อ 1–3 ต้องเสร็จก่อนถึงจะทำ 4–8 (callback ต้องมี domain จริงรองรับ)

### A. Domain + DNS + Hosting
- [ ] **1.** ยืนยันถือครอง `perpos.ai` ที่ผู้ให้บริการ domain
- [ ] **2.** ตั้ง DNS records: `app.perpos.ai`, `www.perpos.ai`, apex (`perpos.ai`) — ชี้ไป Vercel (CNAME `cname.vercel-dns.com` หรือ A record ตามที่ Vercel ระบุ)
- [ ] **3.** Vercel → เพิ่ม custom domain:
  - project `apps/perpos` → `app.perpos.ai`
  - project `apps/landing` → `www.perpos.ai` + apex
  - รอ SSL ออก (Vercel auto)

### B. Auth / OAuth callbacks (โหมดเพิ่มคู่ — ยังไม่ลบ `.io`)
- [ ] **4. LINE Login channel** — Callback URL เพิ่ม `https://app.perpos.ai/line/callback`
  - ⚠️ ต้องเป็น channel เดียวกับ Messaging (ไม่งั้น `userId` ไม่ตรง `line_user_id`)
- [ ] **5. LINE Messaging channel** — Webhook URL → `https://app.perpos.ai/api/line/webhook` (เปลี่ยนเมื่อพร้อม cutover)
- [ ] **6. Supabase Auth** (project `zftnyipifpaiqzukiyzi`) → Authentication → URL Configuration:
  - Site URL: `https://app.perpos.ai`
  - Redirect URLs: เพิ่ม `https://app.perpos.ai/**`
- [ ] **7. Google Cloud Console** (OAuth client) → Authorized redirect URIs เพิ่ม:
  - `https://app.perpos.ai/api/google-drive/callback`
  - (+ Calendar callback ถ้าแยก client)
- [ ] **8. Stripe** (ถ้ามี checkout/portal) → เพิ่ม domain / อัปเดต return URL เป็น `app.perpos.ai`

### C. Email
- [ ] **9.** Verify โดเมน `perpos.ai` ที่ email/SMTP provider — ตั้ง SPF + DKIM + DMARC สำหรับ `noreply@perpos.ai`, `support@perpos.ai`, `contact@perpos.ai`, `admin@perpos.ai`

### D. Cloud infra (สั่งด้วย gcloud ได้ — รันหลัง `.ai` live + โค้ด deploy แล้ว เท่านั้น)
- [ ] **10. Cloud Run stt-worker** — เปลี่ยน `APP_BASE_URL`:
  ```bash
  gcloud run services update perpos-stt-worker \
    --project perpos --region asia-southeast1 \
    --update-env-vars APP_BASE_URL=https://app.perpos.ai
  ```
- [ ] **11. Cloud Scheduler** — ย้าย target:
  ```bash
  gcloud scheduler jobs update http perpos-task-scheduler \
    --project perpos --location asia-southeast1 \
    --uri "https://app.perpos.ai/api/assistant/scheduler"
  ```

### E. Redirect เก่า → ใหม่
- [ ] **12.** ตั้ง 301 redirect `*.perpos.io → *.perpos.ai` (Vercel redirect หรือ DNS) — คง `.io` ไว้ ~2–4 สัปดาห์

---

## ชั้น 2 — Code (env-driven ก่อน, แล้ว hardcode) — *ทำหลังชั้น 1*

### Env vars (Vercel + Cloud Run) — ตั้งให้ครบ
- `APP_BASE_URL=https://app.perpos.ai` *(ตั้งอยู่แล้ว = .io)*
- `NEXT_PUBLIC_SITE_URL=https://app.perpos.ai` *(org/invite ใช้; ปัจจุบันไม่ได้ตั้ง)*
- `NEXT_PUBLIC_APP_URL=https://app.perpos.ai` *(reset-password ใช้)*
- `NEXT_PUBLIC_BASE_URL=https://app.perpos.ai` *(line/webhook ใช้)*
- `SMTP_FROM_EMAIL=noreply@perpos.ai`
- `GOOGLE_OAUTH_DRIVE_REDIRECT_URI=https://app.perpos.ai/api/google-drive/callback`
- ❎ `NEXT_PUBLIC_LINE_ADD_FRIEND_URL` = LINE OA id ไม่ใช่ domain → ไม่ต้องแตะ
- แก้ `.env.local.example` (template) ใน PR · `.env.local` จริง + Vercel = ทำตอน cutover

### Hardcoded fallback ในโค้ด (string `app.perpos.io` → `app.perpos.ai`)
`(auth)/line/_session.ts:19` · `line/login/route.ts:16` · `api/line/webhook/route.ts:1639,2284,2327` · `api/assistant/stt/mom-deliver/route.ts:182` · `api/just-me/_line.ts:49` · `api/admin/users/reset-password/route.ts:17` · `api/org/invite/route.ts:10` · `lib/assistant/bot-flex.ts:8` · `services/stt-worker/src/stt/stt.service.ts:283,345,779`

> ⚠️ `NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_APP_URL` / `NEXT_PUBLIC_BASE_URL` **ไม่ได้ตั้งใน .env.local** → โค้ดพึ่ง fallback hardcode จริง ⇒ ต้องแก้ string ในโค้ด ไม่ใช่แค่ env

### Hardcoded ไม่มี env / bare domain (แก้ io→ai คงรูปเดิม)
`api/crm/_notify.ts:337,386` (`https://perpos.io/${slug}/...` deep link — **bare domain**, คงรูป → `perpos.ai`; latent bug ที่ควรเป็น `app.` แยกแก้ภายหลัง) · `app/robots.ts:4` · `app/sitemap.ts:4` (fallback `www.perpos.io`) · `api/internal/audit-ship/route.ts:10` (comment)

### ❌ ห้ามแตะ — SHADOW domain (คง `@stt-line.perpos.io`)
`api/line/_provision.ts:163` (**สร้าง shadow email** — ไม่มี baseUrl ในไฟล์นี้) · `api/admin/users/list/route.ts:5,109` · `api/admin/stt-users/route.ts:13` · `api/admin/stt-stats/route.ts:59` · `api/assistant/stt/checkout/route.ts:57`
> วิธีแก้ที่ปลอดภัย: ใช้ `perl -pe 's/(?<!stt-line\.)perpos\.io/perpos.ai/g'` — negative-lookbehind กัน shadow อัตโนมัติ

### Landing app (`apps/landing`)
`BASE_URL` (layout/robots/sitemap) · `APP_URL`/`APP_SIGNIN_URL` · mailto `contact@/admin@perpos.io` · ข้อความใน `locales.ts` / `landing-content.ts`

### UI / docs
`(public)/privacy` · `(public)/terms` (support@) · `admin/onboarding` · crm `perpos.io/{slug}/` placeholder · `AGENTS.md` · `docs/*.md` · `perpos.md` · `create-manual.js`

### ❌ ห้ามแตะ
- `SHADOW_DOMAIN` + ทุก filter `.endsWith('@stt-line.perpos.io')` (`api/admin/users/list`, `stt-stats`, `stt-users`, `just-me/_line.ts`, `_provision.ts`)

---

## ชั้น 3 — ลำดับ cutover (กัน downtime)
1. DNS + Vercel domain + SSL `.ai` ขึ้น (ยังไม่ตัด `.io`)
2. เพิ่ม callback/redirect `.ai` ใน LINE / Google / Supabase / Stripe (เพิ่มคู่)
3. Merge โค้ด (ชั้น 2) → deploy
4. อัปเดต env Vercel + Cloud Run → redeploy stt-worker (ข้อ 10)
5. ย้าย Cloud Scheduler (ข้อ 11)
6. เปลี่ยน LINE webhook → `.ai` (ข้อ 5)
7. ทดสอบ E2E (ดู checklist)
8. เปิด 301 `.io → .ai` (ข้อ 12)
9. คง `.io` callback ~2–4 สัปดาห์ แล้วถอด

---

## ✅ Checklist ทดสอบหลัง cutover
- [ ] LINE login เข้าเว็บได้
- [ ] แอด OA ใหม่ → auto-provision + welcome flex
- [ ] `/mom` → stt-worker callback → ได้ PDF กลับ LINE (เช็ค `APP_BASE_URL` Cloud Run)
- [ ] Google Drive/Calendar connect (OAuth redirect)
- [ ] Stripe checkout/portal return
- [ ] Scheduler ยิงเข้า `.ai` ทุกนาที (เช็ค logs)
- [ ] อีเมล invite/reset ส่งจาก `@perpos.ai` ไม่ตก spam (DKIM)
- [ ] `.io` → `.ai` redirect ทำงาน
