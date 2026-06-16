# คัมภีร์: ระบบแกะเสียง → รายงานการประชุม (STT / MoM)

> เอกสารอ้างอิงฉบับเต็มสำหรับ AI agents / devs ที่ทำงานต่อกับฟีเจอร์นี้
> อัปเดตล่าสุด: 2026-06-16 · ทุกอย่างใน production แล้ว (Supabase + Cloud Run + Vercel)

---

## 1. ภาพรวม
อัปไฟล์เสียง/วิดีโอ → AI (Gemini) ถอด+สรุปเป็น **รายงานการประชุม (Minutes of Meeting)** → ได้ **PDF**
- **2 ช่องทาง:** เว็บ (app.perpos.io) + **LINE Bot** (`/mom`) ใช้ pipeline เดียวกัน
- **Quota:** จำกัดเป็น "นาที" ต่อคน (default 300 นาที, admin ปรับได้)
- **Auto-onboarding:** แอด LINE → สร้าง account อัตโนมัติ (ไม่ต้องสมัครเว็บ) + magic-link เคลมบัญชีภายหลัง
- **MoM JSON:** `meeting_title, executive_summary, key_topics[], decisions[], action_items[], recommendations[] (ข้อเสนอแนะจาก AI), speakers[]` — **ไม่มี transcript คำต่อคำ/timestamp** (เน้นสรุป → output เล็ก เร็ว ไม่ชน 64k token cap)

---

## 2. สถาปัตยกรรม
```
[เว็บ] อัป → Supabase Storage ──┐
[LINE] /mom + ส่งไฟล์ ──────────┤→ INSERT transcription_jobs → trigger stt-worker (Cloud Run)
                                 │        ├─ (LINE) โหลดไฟล์จาก LINE content API เอง
                                 │        ├─ measureDuration (music-metadata) → reserve quota
                                 │        ├─ upload Gemini Files API → generateContent (MoM, ครั้งเดียว)
                                 │        ├─ refund quota ถ้า STT ล้ม
                                 │        └─ completed → callback /api/assistant/transcribe/mom-deliver
                                 ▼                                   │
[หน้าเว็บ poll → ดู/ดาวน์โหลด PDF]          [deliver: buildMomHtml → pdf-renderer → upload → signed URL]
                                                                     └─ LINE: push Flex ปุ่มดาวน์โหลด PDF
```
**กฎเหล็ก:** quota บังคับใช้ที่ **stt-worker ที่เดียว** (มี bytes ทั้ง web+line) · webhook ตอบเร็ว ไม่โหลดไฟล์เอง

---

## 3. Infrastructure & Deployment

### stt-worker (Cloud Run `perpos-stt-worker`, asia-southeast1)
- URL: `https://perpos-stt-worker-120863058985.asia-southeast1.run.app`
- Stack: plain Express + TS · Gemini Files API (REST, fetch) · music-metadata v7 (CJS) · undici (timeout)
- Deploy:
```bash
cd services/stt-worker && gcloud run deploy perpos-stt-worker --source . \
  --region asia-southeast1 --project perpos \
  --memory 2Gi --cpu 1 --min-instances 0 --max-instances 5 --timeout 3600 --concurrency 3 \
  --no-cpu-throttling --allow-unauthenticated \
  --set-secrets "WORKER_SECRET=WORKER_SECRET:latest,GEMINI_API_KEY=GEMINI_API_KEY:latest,LINE_MESSAGING_CHANNEL_ACCESS_TOKEN=LINE_MESSAGING_CHANNEL_ACCESS_TOKEN:latest,SUPABASE_URL=SUPABASE_URL:latest,SUPABASE_SERVICE_ROLE_KEY=SUPABASE_SERVICE_ROLE_KEY:latest"
```
- **env `APP_BASE_URL=https://app.perpos.io`** ต้องตั้ง (ตั้งครั้งเดียวด้วย `--update-env-vars`, persist ข้าม deploy ที่ใช้ `--set-secrets`)
- **`--no-cpu-throttling` บังคับ** — งาน background หลังตอบ 202 ใช้เวลา 1-3 นาที ถ้า CPU throttle จะค้าง

### pdf-renderer (Cloud Run `perpos-pdf-renderer`, asia-southeast1)
- URL: `https://perpos-pdf-renderer-120863058985.asia-southeast1.run.app`
- Express + Playwright **v1.59.1-noble** (Dockerfile base ต้องตรง version playwright npm) + ฟอนต์ไทย (fonts-noto, fonts-thai-tlwg)
- **public-invokable** (`allUsers` roles/run.invoker) + secret-gate `PDF_SERVICE_SECRET` (header `x-pdf-secret`)
- Endpoint: `POST /render { html, filename, footerHtml?, headerHtml? }` → คืน PDF binary
  - `footerHtml`/`headerHtml` (optional) → เปิด Playwright `displayHeaderFooter` = **running footer/header ทุกหน้า** (ใช้ class `pageNumber`/`totalPages` ได้). MoM ส่ง `MOM_FOOTER_TEMPLATE` (จาก mom-html.ts) = "จัดทำโดยระบบ PERPOS Assistant · หน้า X / Y" — กัน footer หลุดไปโดดบนหน้าเปล่า. template ไม่ inherit CSS body → inline style ล้วน, ฟอนต์ไทยใช้ fonts-thai-tlwg ใน image
- Deploy: `cd services/pdf-renderer && gcloud run deploy perpos-pdf-renderer --source . --region asia-southeast1 --project perpos --allow-unauthenticated`

### App (Vercel)
- โดเมน **`app.perpos.io`** (⚠️ `perpos.io` เป็น 301 redirect — อย่าใช้)
- **Vercel env ที่ต้องมี:** `STT_WORKER_URL`, `WORKER_SECRET`, `PDF_RENDER_URL`, `PDF_SERVICE_SECRET`, `APP_BASE_URL=https://app.perpos.io`, + LINE/Supabase keys เดิม
- `GEMINI_API_KEY` ต้องเป็น **paid tier** (free tier: pro quota=0, flash โดน 503)
- Cron `/api/assistant/scheduler` (Google Cloud Scheduler ทุก 1 นาที) ทำ stuck-job sweep ด้วย

---

## 4. Database (Supabase `zftnyipifpaiqzukiyzi`)
| ตาราง / RPC | หน้าที่ |
|---|---|
| `transcription_jobs` | งานแกะเสียง: org_id, profile_id, **source** (web/line), audio_url(nullable), **line_message_id**(unique idx), file_name, mime_type, file_size, model, status, transcript_json, transcript_text, **duration_seconds**, error_message, triggered_by · **token จริงจาก Gemini**: prompt_tokens, audio_input_tokens, output_tokens, thoughts_tokens, usage_metadata(jsonb) — worker เขียนตอน complete → ฝั่งอ่านคิดต้นทุนเป๊ะ |
| bucket `assistant_audio` | private, cap 200MB, allowed_mime_types (audio/video + application/pdf); PDF ผลลัพธ์เก็บที่ `<org>/mom/<jobId>.pdf` |
| `assistant_line_sessions` | state "รอไฟล์หลัง /mom" (line_user_id PK, org_id, profile_id, expires_at) |
| `stt_quota` | โควต้าต่อคน: profile_id PK, **limit_seconds** (default 18000=300นาที), used_seconds |
| `stt_usage_transactions` | ledger: kind(debit/refund), duration_seconds, source, job_id |
| `web_login_tokens` | magic-link: token PK, profile_id, expires_at(5นาที), used_at |
| RPC `consume_stt_quota(profile,sec,job,source)` | atomic reserve (`SELECT FOR UPDATE`) → คืน {ok, remaining_seconds} · service_role only |
| RPC `refund_stt_job(job_id)` | คืนโควต้า **idempotent** (เช็คว่ามี refund ของ job นี้แล้วยัง) — ใช้ทั้ง worker catch + stuck-sweep |
| RPC `refund_stt_quota(profile,sec,job)` | (เก่า, by-amount) — ปัจจุบันใช้ refund_stt_job แทน |

**สำคัญ:** `profiles.id → auth.users(id)` (สร้าง profile ลอยไม่ได้ → ต้อง shadow auth user) · `assistant` = **personal module** (สิทธิ์ผ่าน `personal_module_grants` ไม่ใช่ org module) · `organization_members` ใช้คอลัมน์ `user_id`/`role` (ไม่ใช่ profile_id/member_role)

**Billing (per-profile, เชื่อม Stripe เดิม)** — `stt_plans` (catalog: subscription รายเดือน + topup เติมนาที, มี `stripe_price_id`) · `stt_subscriptions` (per-profile, mirror Stripe sub) · `stt_payments` (ledger เงินเข้า, idempotent ด้วย stripe_invoice_id/payment_intent_id) · `stt_quota` += `plan_seconds`(reset รายรอบ) + `topup_seconds`(สะสม). RPC (service_role only): `apply_stt_payment` (บันทึกเงิน+เติมโควต้า idempotent: topup→บวก, subscription→reset รอบใหม่), `upsert_stt_subscription`. Webhook reuse `stripe_events` เป็น idempotency log · **webhook handler ทำแล้ว** ใน `api/stripe/webhook` (แยก STT ด้วย metadata.kind='stt'+profile_id หรือ lookup stt_subscriptions; topup=checkout mode payment, subscription=invoice.payment_succeeded เติมรอบ; กัน race invoice มาก่อน checkout ด้วยการอ่าน sub.metadata) · **checkout** `api/assistant/transcribe/checkout` (body planCode → สร้าง Stripe price อัตโนมัติถ้ายังไม่มี + session ใส่ metadata). แยกจาก `org_billing`/`org_stripe` (per-org เดิม) คนละระบบ · **เหลือ**: หน้าซื้อ (+เมนู) + ตั้ง STRIPE_WEBHOOK_SECRET event types (checkout.session.completed, invoice.payment_succeeded, customer.subscription.*)

migrations: `2026061512..._assistant_transcription`, `..0616120000_line_mom`, `..130000_line_mom_async`, `..150000_stt_quota`, `..170000_stt_refund_job`, `..190000_web_login_tokens`

---

## 5. Code Map
**Worker:** `services/stt-worker/src/stt/stt.service.ts` (core ทั้งหมด: download web/LINE, measureDuration, quota reserve/refund, Gemini upload+generate, retry+multipart-JSON, deliver/notify) · `main.ts` (Express, x-worker-secret `.trim()`)

**Shared libs:** `apps/perpos/src/lib/assistant/mom-html.ts` (buildMomHtml + `MOM_FOOTER_TEMPLATE` — ใช้ร่วม mom-pdf + mom-deliver · page break: ทุก section ห่อด้วย `<table><thead>` → หัวข้อ repeat ตอนตัดข้ามหน้า, footer เป็น running footer ผ่าน renderer) · `stt-trigger.ts` (triggerSttWorker: atomic claim + fetch worker)

**API routes** (`apps/perpos/src/app/api/`):
- `assistant/transcribe/jobs` (POST สร้าง/GET list) · `jobs/process` (claim+trigger) · `mom-pdf` (เว็บดาวน์โหลด PDF) · `mom-deliver` (worker callback → PDF → LINE Flex, x-worker-secret) · `quota` (GET ตัวเอง) · `stats` (GET personal)
- `admin/stt-quota`, `admin/stt-users` (GET/PUT list+ปรับ+ระงับ), `admin/stt-stats` (GET ภาพรวม)
- `account/claim` (POST ตั้ง email/password)
- `line/webhook` (follow→onboard, /mom, /web, audio handling) · `line/_provision.ts` (provisionLineUser)
- `assistant/scheduler` (cron: due reminders + **stuck-job sweep** >15นาที→failed+refund+LINE + **PDPA cleanup**: ลบไฟล์เสียงดิบทันทีเมื่อ job=completed/failed (audio_url→null), ลบ PDF+transcript เมื่อเก่า >48ชม. — คง row+duration ไว้ให้ ledger ไม่เพี้ยน)

**Pages** (`apps/perpos/src/app/`):
- `(hydrogen)/[orgSlug]/assistant/transcribe/page.tsx` (อัป+poll+Dialog MoM+ดาวน์โหลด+quota banner) · `.../stats` (กราฟ personal)
- `(auth)/line/claim/route.ts` (magic-link verify→session) · `(auth)/claim-account/page.tsx` (ตั้ง email/password)
- `(hydrogen)/admin/stt-users` + `admin/stt-stats` (super admin)

**Magic-link flow:** `/web` → web_login_tokens → `/line/claim?t=` → `generateLink('magiclink')` → `verifyOtp({type:'email', token_hash})` ตั้ง SSR cookies → `/claim-account` → `updateUserById({email,password})`

---

## 6. คำสั่ง LINE
`/mom` (แกะเสียง — ส่งไฟล์ตามหลัง) · `/web` (magic link เข้าเว็บ/เคลมบัญชี) · follow event = auto-onboard

---

## 7. ⚠️ บทเรียน/กับดักที่แก้ไปแล้ว (อย่าทำซ้ำ)
1. **LINE ส่งไฟล์ PDF แนบตรงไม่ได้** → ส่ง signed-URL link (Flex button) เท่านั้น
2. **APP_BASE_URL ต้อง app.perpos.io** — perpos.io 301 redirect ทำให้ callback mom-deliver ได้ 404
3. **WORKER_SECRET ใน Secret Manager มี trailing newline** → ต้อง `.trim()` ทั้งสองฝั่ง
4. **Cloud Run CPU throttling** ฆ่างาน background หลังตอบ 202 → stt-worker ต้อง `--no-cpu-throttling`
5. **Gemini output cap = 65,536 tokens** (ขยายไม่ได้) → MoM เป็นสรุป ไม่ถอด verbatim
6. **ไฟล์ยาว = อัปทั้งก้อนเข้า Gemini Files API** ไม่ chunk (Gemini เห็น global context)
7. **music-metadata ต้อง v7** (CommonJS) — v10 เป็น ESM-only พังใน worker (module:commonjs)
8. **app target = es5** → ห้าม regex `\p{}` flag u, ห้าม spread Map iterator (ใช้ `Array.from`)
9. **Vercel build** lint error จากไฟล์ `acc-firm/ocr/jobs/approve/route.ts` (WIP พังค้างใน working tree ของ dev — commit ใช้ `--no-verify` + อย่า stage ไฟล์นั้น)
10. **Quota race** → atomic `consume_stt_quota` (FOR UPDATE) + reserve ก่อน Gemini + **refund idempotent** (`refund_stt_job`) เรียกจาก worker catch **และ** stuck-sweep (กันรั่วตอน worker crash)
11. **gemini-2.5-flash อย่างเดียว** (ALLOWED_MODELS=[flash]) — pro free-tier quota=0
12. **pdf-renderer** เคยพัง (deploy เป็น NestJS เก่า + Playwright version mismatch) → แก้เป็น Express + base image ตรง playwright version
13. **🔒 RPC SECURITY_DEFINER ต้อง REVOKE จาก `anon`+`authenticated` ตรง ๆ** — `REVOKE FROM PUBLIC` อย่างเดียว**ไม่พอ** (Supabase grant EXECUTE ให้ anon/authenticated เป็น default). ถ้าลืม = ใครก็ตามมี anon key (เปิดเผยใน frontend) ยิง `/rest/v1/rpc/<fn>` ได้ → เคยทำให้ `refund_stt_quota` เพิ่มโควต้าตัวเองไม่จำกัด. ตรวจทุก RPC ใหม่ด้วย `has_function_privilege('authenticated', oid, 'EXECUTE')` ต้อง false + รัน `get_advisors(security)` หลังเพิ่ม RPC

---

## 8. การทดสอบ (manual trigger worker ตรง ๆ)
```bash
SECRET=$(gcloud secrets versions access latest --secret=WORKER_SECRET --project perpos | tr -d '\n')
curl -X POST <STT_WORKER_URL>/process -H "x-worker-secret: $SECRET" \
  -H 'Content-Type: application/json' -d '{"jobId":"<id>","orgId":"<org>"}'
# reset job ก่อน: UPDATE transcription_jobs SET status='pending', transcript_json=NULL ... (worker ข้าม completed)
```
ตรวจผล/quota ด้วย Supabase `execute_sql` (transcription_jobs, stt_quota, stt_usage_transactions)

---

## 9. งานที่ยังเหลือ / ไอเดียต่อ
- เทสต์ follow event จริงด้วย LINE ใหม่ (provisioning logic verify แล้ว แต่ event wiring ยังไม่เห็นของจริง)
- ✅ **ต้นทุน Gemini** — หน้า `/admin/stt-cost` + API `/api/admin/stt-cost` + `scripts/stt-cost-report.mjs` · โมเดลราคา `lib/assistant/stt-cost.ts` (ราคาผ่าน env `STT_GEMINI_*`) · worker เก็บ token จริง (usageMetadata) ลง `transcription_jobs` → คิดเป๊ะ; งานเก่าไม่มี token = ประมาณจาก duration · **ต้อง redeploy stt-worker ให้เริ่มเก็บ token** · export CSV · filter ช่วงวันที่ (ยังไม่ทำ)
- (ถ้าโต) rate-limit/invite-code กัน abuse จากการสร้าง LINE ใหม่เรื่อย ๆ · monthly quota reset
- client-side audio compression (ogg/opus) ก่อนอัป (ลด bandwidth)
