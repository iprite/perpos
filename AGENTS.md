# AGENTS.md — PERPOS

คู่มือสำหรับ AI agents ที่ทำงานกับ codebase นี้

> 📘 **ผู้ช่วย AI (assistant umbrella — per-profile, B2C, kind-based):** อ่านคัมภีร์ร่มที่ [`docs/ASSISTANT.md`](docs/ASSISTANT.md) — สถาปัตยกรรม per-kind, guard, home org, onboarding, billing, วิธีเพิ่มผู้ช่วยตัวใหม่ ก่อนแตะส่วน `/assistant`
> 📘 **STT/MoM เฉพาะทาง (worker, Gemini, PDF, duration, quota):** อ่าน [`docs/STT_MOM_FEATURE.md`](docs/STT_MOM_FEATURE.md) — deploy, DB schema, code map, กับดักที่แก้แล้ว

---

## ภาพรวมโปรเจกต์

**PERPOS** — ระบบบัญชีและ ERP สำหรับธุรกิจ SME ประเทศไทย พร้อม LINE Bot assistant

- Frontend + Backend: Next.js 15 (App Router), React 19, TypeScript
- **API routes อยู่ใน `apps/perpos/src/app/api/` (Next.js Route Handlers)**
- Database: Supabase (PostgreSQL) พร้อม Row Level Security
- Auth: Supabase Auth — **LINE Login เท่านั้น** (signin มีปุ่ม LINE ปุ่มเดียว · `/line/login` → `/line/callback` bridge เข้า session ด้วย magic-link · Supabase ไม่มี LINE provider จึงทำ OAuth เอง · login แล้วเข้าแอปเลย ไม่ต้องตั้ง password). Google เป็น **admin fallback ซ่อนไว้** เปิดด้วย `/signin?admin=1` กันล็อกเอาต์ (super_admin ก็มี LINE linked จึง login ผ่าน LINE ได้). magic-link claim (`/web`) + email/password ยังมีอยู่แต่ไม่ใช่ช่องทางหลัก
  - **LINE Login channel ต้องอยู่ provider เดียวกับ Messaging channel** — `userId` ถึงตรงกับ `line_user_id` ที่เก็บไว้ (ถ้าคนละ provider จะ provision เป็นคนละคน) · callback URL ที่ต้องลงทะเบียนใน LINE console = `${APP_BASE_URL}/line/callback`
- UI: Rizzui, Tailwind CSS, Radix UI
- Monorepo: pnpm workspaces + Turbo

> **กฎสำคัญ**: API logic ทั้งหมดอยู่ใน `apps/perpos/src/app/api/` เท่านั้น — ไม่มี Nest.js backend แล้ว

---

## โครงสร้าง Monorepo

```
perpos/
├── apps/perpos/                    # Next.js app (port 3002) — Frontend + API
│   └── src/
│       ├── app/
│       │   ├── (hydrogen)/         # Protected pages (ต้อง login)
│       │   ├── (auth)/             # Login, signup
│       │   └── api/                # API Route Handlers (Next.js)
│       │       ├── admin/          # Users, Delivery, NewsAgent, Modules
│       │       ├── line/           # LINE Bot webhook, link-token, unlink
│       │       ├── assistant/      # Scheduler (cron trigger)
│       │       ├── org/            # Organization invites
│       │       ├── tmc/            # TMC Management endpoints
│       │       └── google-drive/   # Google Drive OAuth
│       ├── components/             # Shared UI components
│       └── lib/                    # Utilities, Supabase clients, actions
├── packages/
│   ├── config-tailwind/            # Shared Tailwind config
│   ├── config-typescript/
│   └── isomorphic-core/            # Shared components
├── services/
│   ├── pdf-renderer/               # PDF microservice — Express + Playwright (Cloud Run, port 8080)
│   ├── ocr-worker/                 # AI bookkeeping worker — Express + Gemini (Cloud Run, port 8080)
│   ├── stt-worker/                 # Speech-to-text worker — Express + Gemini Files API (Cloud Run, port 8080)
│   └── pdf-compress-worker/        # PDF compression worker — Express + spawn python3 (pikepdf+Pillow) (Cloud Run, port 8080)
└── supabase/
    └── migrations/                 # Migration SQL files
```

---

## คำสั่ง Development

```bash
# ติดตั้ง dependencies (จาก root)
pnpm install

# รัน Next.js app (frontend + API)
pnpm starter:dev       # port 3002

# รัน PDF microservice (services/pdf-renderer)
pnpm pdf:dev           # port 8080
# หรือ: cd services/pdf-renderer && pnpm dev

# รัน OCR worker (services/ocr-worker)
pnpm ocr-worker:dev    # port 8080
# หรือ: cd services/ocr-worker && pnpm dev

# รัน STT worker (services/stt-worker) — แกะเสียงเป็นข้อความ
pnpm stt-worker:dev    # port 8080
# หรือ: cd services/stt-worker && pnpm dev

# Type check
cd apps/perpos && pnpm exec tsc --noEmit
cd services/pdf-renderer && pnpm type-check

# Lint
pnpm lint

# Build
pnpm build

# อัปเดต Knowledge Graph (Graphify) เพื่อให้ AI Agents เข้าใจโครงสร้างโค้ดล่าสุด
.venv/bin/python3 -m graphify update .
```

---

## App Router Structure (`apps/perpos/src/app/`)

| Path                    | หน้าที่                                                   |
| ----------------------- | --------------------------------------------------------- |
| `(hydrogen)/`           | Protected routes (ต้อง login)                             |
| `(hydrogen)/assistant/` | ผู้ช่วย AI (per-profile) — แกะเสียง→MoM + usage + billing |
| `(hydrogen)/admin/`     | Admin console                                             |
| `(hydrogen)/sales/`     | ใบเสนอราคา, ใบแจ้งหนี้, ใบเสร็จ                           |
| `(hydrogen)/purchase/`  | ใบสั่งซื้อ, บันทึกค่าใช้จ่าย                              |
| `(hydrogen)/finance/`   | บัญชีธนาคาร, เช็ค, ภาษีหัก ณ ที่จ่าย                      |
| `(hydrogen)/journal/`   | สมุดรายวัน                                                |
| `(hydrogen)/accounts/`  | ผังบัญชี                                                  |
| `(hydrogen)/inventory/` | สินค้า, สต๊อก                                             |
| `(hydrogen)/payroll/`   | เงินเดือน, พนักงาน                                        |
| `(hydrogen)/tax/`       | ภาษีมูลค่าเพิ่ม, ภาษีหัก ณ ที่จ่าย                        |
| `(auth)/`               | Login, signup                                             |

---

## API Endpoints — Next.js Route Handlers (`apps/perpos/src/app/api/`)

| Endpoint                         | Method         | File                                 | หน้าที่                                                               |
| -------------------------------- | -------------- | ------------------------------------ | --------------------------------------------------------------------- |
| `/api/line/webhook`              | POST           | `line/webhook/route.ts`              | LINE Bot webhook หลัก                                                 |
| `/api/line/link-token`           | POST           | `line/link-token/route.ts`           | สร้าง token ผูกบัญชี LINE                                             |
| `/api/line/unlink`               | POST           | `line/unlink/route.ts`               | ยกเลิกผูกบัญชี LINE                                                   |
| `/api/assistant/scheduler`       | POST           | `assistant/scheduler/route.ts`       | Cron trigger สำหรับแจ้งเตือน task                                     |
| `/api/admin/delivery/logs`       | GET            | `admin/delivery/logs/route.ts`       | ดู logs การส่ง                                                        |
| `/api/admin/delivery/schedule`   | PUT            | `admin/delivery/schedule/route.ts`   | ตั้ง cron schedule                                                    |
| `/api/admin/delivery/send-now`   | POST           | `admin/delivery/send-now/route.ts`   | ส่งข่าวทันที                                                          |
| `/api/admin/news-agent/preview`  | POST           | `admin/news-agent/preview/route.ts`  | Preview ข่าว                                                          |
| `/api/admin/users/list`          | GET            | `admin/users/list/route.ts`          | รายชื่อ users                                                         |
| `/api/admin/users/invite`        | POST           | `admin/users/invite/route.ts`        | เชิญ user                                                             |
| `/api/admin/users/delete`        | POST           | `admin/users/delete/route.ts`        | ลบ user                                                               |
| `/api/admin/users/permissions`   | GET/PUT        | `admin/users/permissions/route.ts`   | จัดการสิทธิ์                                                          |
| `/api/admin/users/orgs`          | GET/PUT/DELETE | `admin/users/orgs/route.ts`          | จัดการ org memberships                                                |
| `/api/admin/modules`             | GET/PUT        | `admin/modules/route.ts`             | ตั้งค่า module ต่อ org                                                |
| `/api/google-drive/connect`      | POST           | `google-drive/connect/route.ts`      | เชื่อม Google Drive+Calendar                                          |
| `/api/google-drive/callback`     | GET            | `google-drive/callback/route.ts`     | OAuth callback                                                        |
| `/api/google-drive/disconnect`   | POST           | `google-drive/disconnect/route.ts`   | ยกเลิกการเชื่อม                                                       |
| `/api/google-drive/status`       | GET            | `google-drive/status/route.ts`       | ตรวจสถานะการเชื่อม                                                    |
| `/api/org/invite`                | POST           | `org/invite/route.ts`                | เชิญเข้า organization                                                 |
| `/api/assistant/jobs`            | GET/POST       | `assistant/jobs/route.ts`            | สร้าง/ดึงงาน (generic, kind=stt)                                      |
| `/api/assistant/jobs/process`    | POST           | `assistant/jobs/process/route.ts`    | claim job + ยิงไป stt-worker                                          |
| `/api/assistant/stt/mom-deliver` | POST           | `assistant/stt/mom-deliver/route.ts` | worker callback → PDF → LINE (มี alias เดิม `transcribe/mom-deliver`) |
| `/api/tmc/*`                     | various        | `tmc/*/route.ts`                     | TMC Management endpoints                                              |

**Auth helpers** (`app/api/_lib/`):

- `requireAdmin(req)` — Bearer token + `profiles.role = 'admin'`
- `requireUser(req)` — Bearer token + active user
- `CronAuthGuard` — `CRON_SECRET` via `Authorization` header หรือ `x-vercel-cron-secret`

---

## LINE Bot Commands

ทุกคำสั่ง **ต้องขึ้นต้นด้วย `/`** · ข้อความอิสระ (ไม่ขึ้นต้น `/`) ที่ "ดูเป็นคำถาม" → **ผู้ช่วยโฟล์ (Flow RAG)** ตอบ (ดูหัวข้อด้านล่าง) · ข้อความที่ไม่เข้าเงื่อนไขถูก ignore

| คำสั่ง                    | หน้าที่                                                  | Permission Key                                       |
| ------------------------- | -------------------------------------------------------- | ---------------------------------------------------- |
| `/help`                   | แสดงคำสั่งทั้งหมด                                        | —                                                    |
| `/link <token>`           | ผูกบัญชี LINE                                            | —                                                    |
| `/ข่าว`                   | สรุปข่าว                                                 | `bot.news.request`                                   |
| `/สรุปล่าสุด`             | ข่าวล่าสุด                                               | `bot.news.latest`                                    |
| `/รายรับ <จำนวน> <โน้ต>`  | บันทึกรายรับ                                             | `bot.finance.income_add`                             |
| `/รายจ่าย <จำนวน> <โน้ต>` | บันทึกรายจ่าย                                            | `bot.finance.expense_add`                            |
| `/mom`                    | ส่งไฟล์เสียง → ได้รายงานการประชุม (MoM) PDF กลับทาง LINE | `bot.assistant.transcribe` (ผู้ช่วย AI, per-profile) |
| `/web`                    | รับ magic link เข้าเว็บผู้ช่วย AI                        | —                                                    |

**หมายเหตุ:** Admin role ข้ามการเช็ค permission ทั้งหมด · คำสั่ง Task Manager เดิม (`/t /tk /d /a /ap`) + ปฏิทิน (`/นัด /วันนี้`) **ยกเลิก/ลบโค้ดแล้ว** (module assistant เดิม + ตาราง `tasks`/`calendar_events` ไม่มีช่องทางสร้างแล้ว)

### ผู้ช่วยโฟล์ (Flow RAG) — บอทตอบคำถามสินค้าด้วย RAG

บอทตอบคำถามเกี่ยวกับ **PERPOS / Flow / Suite** แบบสนทนาบน LINE — ดึงความรู้จาก vector DB (pgvector) + ตอบด้วย Gemini

- **ใครใช้ได้:** ทุกคนที่แอด OA — **ไม่ต้องผูกบัญชี** (pre-sales/ถามก่อนซื้อ) · branch วางก่อนด่าน profile ใน webhook
- **ทริกเกอร์:** free text ที่ผ่าน `isProductQuestion()` (heuristic: มีเครื่องหมาย/คำถาม หรือคำโดเมน PERPOS) เท่านั้น → กันทักทาย/สแปม + คุมต้นทุน
- **flow:** `isProductQuestion` → `incr_flow_chat_usage` (rate-limit 30/คน/วัน) → `answerFlowQuestion()` (embed query → `match_kb_chunks` → Gemini) → `replyText` **inline** (webhook `maxDuration=30`, latency ~3–5 วิ)
- **embedding:** `gemini-embedding-001` (768 มิติ, `RETRIEVAL_QUERY`/`RETRIEVAL_DOCUMENT`) · **answer:** `gemini-2.5-flash` (`thinkingBudget:0` → เร็วขึ้น ~4 เท่า) · guardrail: ตอบจาก context เท่านั้น ไม่มี→ปฏิเสธสุภาพ + ชวนติดต่อ
- **Knowledge base:** เขียนเองที่ [`docs/knowledge/*.md`](docs/knowledge/) (about/flow/suite/pricing/privacy/pdpa/security) — แก้แล้ว **ต้อง re-embed:** `pnpm kb:embed` ([scripts/kb-embed.mjs](scripts/kb-embed.mjs), อ่าน key จาก `apps/perpos/.env.local`)
- **DB:** `kb_chunks` (vector(768) + hnsw) · `flow_chat_usage` (rate-limit) · RPC `match_kb_chunks` / `upsert_kb_chunk` / `incr_flow_chat_usage` (SECURITY DEFINER, service role เท่านั้น) — migration [`flow_rag_kb.sql`](supabase/migrations/flow_rag_kb.sql)
- **code:** [`lib/assistant/flow-rag.ts`](apps/perpos/src/lib/assistant/flow-rag.ts) (`isProductQuestion`/`retrieveContext`/`answerFlowQuestion`) + `handleFlowChat()` ใน [webhook](apps/perpos/src/app/api/line/webhook/route.ts)
- **หมายเหตุ:** free-text path ยัง**ไม่มี dedup ต่อ `line_message_id`** (ต่างจาก mom/pdf) — เสี่ยง LINE redeliver → ตอบซ้ำ (ความเสี่ยงต่ำเพราะ redelivery default ปิด) ถ้าจะเปิด redelivery ให้เพิ่ม dedup ก่อน · **GEMINI_API_KEY ต้องรองรับ `gemini-embedding-001`** (text-embedding-004 ใช้ไม่ได้กับ key ปัจจุบัน)

**Auto-onboarding (LINE-first / B2C):** เมื่อมี `follow` event (แอด OA) → `provisionLineUser` ([api/line/\_provision.ts](apps/perpos/src/app/api/line/_provision.ts)) สร้าง shadow auth user (email `line.<id>@stt-line.perpos.io`) → trigger สร้าง profile → personal org (= "home org" เก็บไฟล์) + member(owner) + **`personal_module_grants('stt')` (ผู้ช่วย AI, per-profile)** + stt_quota(300นาที = trial) + line_active_org_id → push welcome Flex. idempotent. พิมพ์ `/mom` ได้ทันที — **ไม่แจกโมดูล B2B ใด ๆ**

**โมเดล B2B vs B2C (LINE login เท่านั้น):**

- **B2C = ผู้ช่วย AI (key ภายใน `stt`)** — บริการ per-profile (umbrella, ตอนนี้ = ถอดเสียง→MoM, อนาคตเพิ่มตัวช่วยอื่น). subscription แยก (฿99/เดือน, trial 300 นาที), per-profile quota. **URL top-level `/assistant`, `/assistant/usage`, `/assistant/billing` — ไม่มี [org]**. gate = `requireAssistantUser` (เว็บ) / `checkSttAccess` (LINE) = grant `stt` หรือ `bot.assistant.transcribe` หรือ super_admin · ด่านเก็บเงิน = `stt_quota` ที่ stt-worker · **ทุกคนที่แอด LINE ได้อัตโนมัติ** · guard resolve "home org" ภายในไว้เก็บไฟล์/เรียก worker (ไม่โผล่ใน URL)
- **B2B = ERP**: shared (accounting/payroll) + tailor-made (tmc/crm/acc_firm/…) — ระดับ org, **superadmin เปิดให้ต่อ org เท่านั้น** (`admin/modules` = `requireAdmin` = super_admin) · **module `assistant` เดิม (Task Manager) ถูกยกเลิกทิ้งหมดแล้ว**
- **สลับ STT ↔ ERP**: header มีปุ่ม **"ผู้ช่วย AI"** (→ `/assistant`) + org switcher (ERP) · B2C เห็นแค่ผู้ช่วย · B2B เห็นทั้งคู่ · super_admin → `/admin` (เลือกเข้า org/assistant)
- **redirect หลัง login**: ERP (B2B) > ผู้ช่วย AI (B2C) > no-org · super_admin → /admin
- **`assistant` ใน path/route group** = ผู้ช่วย AI per-profile (`(hydrogen)/assistant/*`, อยู่ใน SYSTEM_SEGMENTS — ไม่ใช่ org slug). API: generic `/api/assistant/{jobs,jobs/process,quota,stats}` + STT-เฉพาะ `/api/assistant/stt/{mom-pdf,mom-deliver,checkout,portal}` · guard per-profile (`requireAssistantUser` → kind-aware ผ่าน `ASSISTANT_KINDS` ใน [lib/assistant/kinds.ts](apps/perpos/src/lib/assistant/kinds.ts))
- หมายเหตุ: job hub = **`assistant_jobs`** (generic, มีคอลัมน์ `kind`) · ของที่เป็น STT แท้คงชื่อ `stt_*` (`stt_quota/stt_subscriptions/stt_plans`) + `stt-worker` + bucket `assistant_audio` + `kind='stt'` — user-facing = "ผู้ช่วย AI" ทั้งหมด

---

## Database Schema (Supabase)

### ตารางหลัก

| Table                                        | หน้าที่                                                                                                                                                                                                                                      |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `profiles`                                   | Users (id, email, role, line_user_id, is_active)                                                                                                                                                                                             |
| `user_permissions`                           | สิทธิ์รายฟังก์ชัน (user_id, function_key, allowed)                                                                                                                                                                                           |
| `tasks`                                      | AI Task Manager (profile_id, title, status, priority, due_at, remind_at)                                                                                                                                                                     |
| `calendar_events`                            | นัดหมาย LINE Bot (profile_id, starts_at, title)                                                                                                                                                                                              |
| `finance_entries`                            | รายรับ/รายจ่าย LINE Bot (profile_id, entry_type, amount)                                                                                                                                                                                     |
| `assistant_jobs` (เดิม `transcription_jobs`) | job hub ใต้ร่ม assistant (kind, profile_id, source web/line, status, transcript_json, duration_seconds) — kind=`stt` ปัจจุบัน                                                                                                                |
| `stt_quota`                                  | โควต้าแกะเสียงต่อคน (profile_id, limit_seconds default 18000=300นาที, used_seconds) — admin ปรับ limit ได้                                                                                                                                   |
| `stt_usage_transactions`                     | ledger การใช้โควต้า (debit/refund) — RPC `consume_stt_quota`/`refund_stt_quota` (service role) atomic reserve+refund; quota บังคับใช้ที่ stt-worker (วัดความยาวด้วย music-metadata ก่อนเรียก Gemini) · API: `GET /api/assistant/quota`, `GET | PUT /api/admin/stt-quota` |
| `kb_chunks`                                  | Knowledge base ผู้ช่วยโฟล์ (RAG) — source/heading/content + embedding vector(768) + hnsw · embed ด้วย `pnpm kb:embed`                                                                                                                        |
| `flow_chat_usage`                            | rate-limit ผู้ช่วยโฟล์ (line_user_id, day, count) — RPC `incr_flow_chat_usage`                                                                                                                                                               |
| `news_agent_configs`                         | ตั้งค่า News Agent (topics, sources, summary_style)                                                                                                                                                                                          |
| `delivery_schedules`                         | cron schedule ส่งข่าว                                                                                                                                                                                                                        |
| `delivery_logs`                              | log การส่งข่าว                                                                                                                                                                                                                               |
| `line_link_tokens`                           | token ผูกบัญชี LINE (expires 10 นาที)                                                                                                                                                                                                        |
| `google_drive_tokens`                        | OAuth tokens Google Drive                                                                                                                                                                                                                    |
| `organizations`                              | บริษัท/องค์กร                                                                                                                                                                                                                                |
| `organization_members`                       | สมาชิกองค์กร                                                                                                                                                                                                                                 |
| `orders` / `order_items`                     | ออเดอร์ขาย                                                                                                                                                                                                                                   |
| `sales_quotes` / `sales_invoices`            | ใบเสนอราคา / ใบแจ้งหนี้                                                                                                                                                                                                                      |
| `customers` / `workers`                      | ลูกค้า / พนักงาน                                                                                                                                                                                                                             |

### tasks table (status values)

`pending` → `in_progress` → `completed` / `cancelled` / `postponed`

### tasks table (priority values)

`low` | `medium` | `high` | `urgent`

---

## Supabase Clients

```typescript
// Browser (client components)
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

// Server (server components, API routes)
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Admin — bypass RLS (API routes only, ใช้ service role key)
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
```

---

## Library (`apps/perpos/src/lib/`)

| Path                                    | หน้าที่                                                                      |
| --------------------------------------- | ---------------------------------------------------------------------------- |
| `lib/assistant/stt-trigger.ts`          | triggerSttWorker — atomic claim job + ยิงไป stt-worker                       |
| `lib/assistant/mom-html.ts`             | buildMomHtml + MOM_FOOTER_TEMPLATE (ใช้ร่วม mom-pdf/mom-deliver)             |
| `lib/assistant/stt-cost.ts`             | โมเดลราคา Gemini สำหรับคิดต้นทุนต่อ job                                      |
| `lib/assistant/flow-rag.ts`             | ผู้ช่วยโฟล์ (RAG) — isProductQuestion + retrieveContext + answerFlowQuestion |
| `lib/line/send-messages.ts`             | Push/multicast LINE messages                                                 |
| `lib/news/news-agent.ts`                | Fetch RSS + summarize ด้วย OpenAI                                            |
| `lib/google/drive.ts`                   | Google Drive OAuth + upload                                                  |
| `lib/supabase/{client,server,admin}.ts` | Supabase clients                                                             |

---

## Environment Variables

| Variable                              | หน้าที่                                                                        | จำเป็น             |
| ------------------------------------- | ------------------------------------------------------------------------------ | ------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`            | Supabase project URL                                                           | ✅                 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`       | Supabase anon key                                                              | ✅                 |
| `SUPABASE_SERVICE_ROLE_KEY`           | Supabase service role (server only)                                            | ✅                 |
| `LINE_MESSAGING_CHANNEL_SECRET`       | LINE webhook signature verify                                                  | ✅                 |
| `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN` | ส่งข้อความ LINE                                                                | ✅                 |
| `LINE_LOGIN_CHANNEL_ID`               | LINE Login (เข้าเว็บด้วย LINE) — channel ID                                    | LINE login         |
| `LINE_LOGIN_CHANNEL_SECRET`           | LINE Login — channel secret                                                    | LINE login         |
| `CRON_SECRET`                         | ป้องกัน scheduler endpoint                                                     | ✅                 |
| `OPENAI_API_KEY`                      | NLP task parse + news summary                                                  | optional           |
| `OPENAI_MODEL`                        | โมเดล OpenAI (default: gpt-4o-mini)                                            | optional           |
| `PDF_RENDER_URL`                      | PDF microservice URL                                                           | optional           |
| `PDF_SERVICE_SECRET`                  | PDF service auth                                                               | optional           |
| `OCR_WORKER_URL`                      | URL ของ ocr-worker (Cloud Run) สำหรับ AI bookkeeping                           | acc_firm           |
| `STT_WORKER_URL`                      | URL ของ stt-worker (Cloud Run) สำหรับแกะเสียงเป็นข้อความ                       | assistant          |
| `WORKER_SECRET`                       | shared secret เรียก ocr-worker/stt-worker (`x-worker-secret`)                  | acc_firm/assistant |
| `GEMINI_API_KEY`                      | Gemini OCR/classify/journal + speech-to-text (ตั้งที่ ocr-worker + stt-worker) | acc_firm/assistant |
| `SMTP_*`                              | Email invite                                                                   | optional           |

---

## Notification Scheduler

Endpoint: `POST /api/assistant/scheduler`

- ป้องกันด้วย `Authorization: Bearer <CRON_SECRET>` หรือ `x-vercel-cron-secret`
- ตั้ง cron ทุก 1 นาทีผ่าน **Google Cloud Scheduler** (Vercel Hobby ไม่รองรับ every-minute)
- Logic (เหลือเฉพาะงาน STT — task/briefing/follow-up เดิมถูกลบแล้ว):
  - Stuck STT jobs (`processing` ค้าง) → mark failed + refund quota + แจ้ง LINE
  - Requeue pending STT jobs (worker ไม่ว่าง/trigger พลาด) → ยิงซ้ำ, เกิน 30 นาที = ยอมแพ้
  - PDPA cleanup → ลบไฟล์เสียงดิบเมื่อ job ถึงสถานะสุดท้าย + ลบ PDF/transcript เมื่อเก่า >48 ชม.

---

## Conventions

- **Migration**: เพิ่มไฟล์ `.sql` ใน `supabase/migrations/` ชื่อ `YYYYMMDDHHMMSS_description.sql`
- **RLS**: ทุก table ใหม่ต้อง enable RLS และมี policy
- **API routes**: ใช้ `createAdminClient()` จาก `app/api/_lib/supabase.ts` เสมอ (ไม่ใช้ anon key ใน Route Handlers)
- **Permission check**: เช็คผ่าน `user_permissions` table, admin role bypass ทั้งหมด
- **LINE reply**: ใช้ `replyText()` / `replyFlex()` ใน webhook — ใช้ token ได้ครั้งเดียว
- **LINE push**: ใช้ `sendLineMessages()` จาก `lib/line/send-messages.ts`
- **LINE Flex Card**: ทุกการ์ดต้องตามคัมภีร์ [`docs/line-flex-card-guide.md`](docs/line-flex-card-guide.md) — header CHARCOAL `#3C3B3D` พื้นเรียบ (ห้าม gradient), token สีจาก DESIGN.md §2, ต้นแบบ = `buildLinkConfirmFlex` / `buildBotFlex`
- **Commit**: ไม่ push จนกว่าจะสั่ง

---

## Design System — UI Components

> **กฎบังคับ**: ทุก UI ใน `apps/perpos/` ต้องใช้ components จาก `@/components/ui/` เท่านั้น  
> ห้ามใช้ `rizzui`, raw `<button>`, `<input>`, `<select>`, `<label>` โดยตรง

### Components ที่ต้องใช้เสมอ

| ต้องการ                                            | ใช้                                                                                                | Import จาก                         |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------- |
| ปุ่ม                                               | `<Button>`                                                                                         | `@/components/ui/button`           |
| Text input / number                                | `<Input>`                                                                                          | `@/components/ui/input`            |
| **Form Select (value-based)**                      | `<CustomSelect>`                                                                                   | `@/components/ui/custom-select`    |
| **Navigation Dropdown (icon+list)**                | `<Dropdown>`                                                                                       | `@/components/ui/dropdown`         |
| **Rich Panel Popover**                             | `<Popover>`                                                                                        | `@/components/ui/popover`          |
| **Date picker**                                    | `<ThaiDatePicker>`                                                                                 | `@/components/ui/thai-date-picker` |
| Label                                              | `<Label>`                                                                                          | `@/components/ui/label`            |
| Modal / Dialog                                     | `<Dialog>`, `<DialogContent>`, `<DialogBody>`, `<DialogHeader>`, `<DialogTitle>`, `<DialogFooter>` | `@/components/ui/dialog`           |
| Native select (เฉพาะ `type="month"` หรือกรณีพิเศษ) | `<NativeSelect>`                                                                                   | `@/components/ui/native-select`    |
| Time input                                         | `<Input type="time">`                                                                              | `@/components/ui/input`            |
| **หัวข้อ/ข้อความ (Title/Text)**                    | `<Title>`, `<Text>`                                                                                | `@/components/ui/typography`       |
| **รูปโปรไฟล์ + fallback อักษรย่อ**                 | `<Avatar>`                                                                                         | `@/components/ui/avatar`           |
| ป้ายสถานะ                                          | `<StatusBadge tone=…>`                                                                             | `@/components/ui/badge`            |
| KPI/การ์ดสรุป                                      | `<StatCard>`                                                                                       | `@/components/ui/stat-card`        |

> **rizzui**: โค้ด/หน้าจอ**ใหม่**ห้าม import จาก `rizzui`/`rizzui/typography` ตรง ๆ — ใช้ `@/components/ui/*` เสมอ (`Button/Input/Select/Title/Text/Avatar/Badge` ฯลฯ มีครบแล้ว)
>
> **ข้อยกเว้นที่ยอมรับถาวร (ไม่ใช่ของค้างรอแก้ — อย่ารื้อโดยไม่จำเป็น):** `Collapse` ([sidebar-menu.tsx](apps/perpos/src/layouts/hydrogen/sidebar-menu.tsx)) + `Drawer` ([drawer-views/container.tsx](apps/perpos/src/app/shared/drawer-views/container.tsx)) ยังใช้ rizzui ได้ · เหตุผล: เป็น infra ที่แยกตัวชัด **ไม่หลุดพาเลตต์** (Collapse ไม่มีสีของตัวเอง — header เป็น JSX เราเอง; Drawer ใช้ `containerClassName` ของเรา) และ **ไม่ทำ UI เพี้ยน** · การถอดออกมี cost/risk สูง (กระทบ navigation หลัก) แต่ benefit ต่ำ → ถือเป็นการ coexist ที่ตั้งใจ ไม่ใช่ tech debt · จะ migrate ก็ต่อเมื่อ: ต้องแก้ดีไซน์ตัวนั้นจริง, มันเริ่มหลุดพาเลตต์, หรือ migrate `@core` (isomorphic-core ใช้ rizzui ~69 ไฟล์) ทั้งก้อน
>
> หมายเหตุ: rizzui ยังอยู่ใน `package.json` เพราะ `@core` ใช้ภายใน — **การคง dependency ไว้ไม่ถือว่าผิด standard** ตราบใดที่โค้ดแอปไม่ import ตรง

### Dropdown vs Popover — เลือกใช้อะไร?

| กรณี                                                               | ใช้                                                |
| ------------------------------------------------------------------ | -------------------------------------------------- |
| เลือกรายการจาก list (switcher, action menu) + มี icon + check mark | `<Dropdown>`                                       |
| Form select (value → label) — ไม่มี icon                           | `<CustomSelect>`                                   |
| Panel เนื้อหาเสรี (profile, card, multi-section)                   | `<Popover>`                                        |
| ห้ามใช้                                                            | `rizzui Popover`, inline dropdown `<div>` ที่ทำเอง |

### Dropdown

```tsx
import { Dropdown } from "@/components/ui/dropdown";
import type { DropdownItem } from "@/components/ui/dropdown";

// Standard: OrgSwitcher pattern — trigger button + portal item list
<Dropdown
  label={selectedOrg.name}
  leadingIcon={<Building2 className="h-4 w-4" />}
  badge="OWNER" // optional pill after label
  selectedKey={selectedOrg.id} // renders check on matching item
  placement="bottom-start" // or "bottom-end"
  className="w-full" // trigger button width
  items={orgs.map((o) => ({
    key: o.id,
    label: o.name,
    icon: <Building2 className="h-4 w-4" />,
    badge: o.role, // optional per-item pill
    onClick: () => switchOrg(o.id),
  }))}
/>;
```

- **ChevronsUpDown icon หมุน 180° เมื่อ open** — ห้ามใช้ ChevronDown
- ต้นแบบจริง: [`org-switcher.tsx`](apps/perpos/src/components/accounting/org-switcher.tsx) (ใน sidebar) ห่อ `<Dropdown>` ทั้งตัว
- `placement` รองรับ `"bottom-start" | "bottom-end" | "top-start" | "top-end"` (flip อัตโนมัติถ้าพื้นที่ไม่พอ) · panel กว้าง = ความกว้าง trigger (ใส่ `className="w-full"` เพื่อเต็มแนว)

### Popover

```tsx
import { Popover } from '@/components/ui/popover';

// Standard: profile menu (sidebar footer) pattern
// trigger เป็น render-prop รับ open → หมุน ChevronsUpDown ได้
<Popover
  placement="right-end"        // เปิดด้านข้างเมื่อ trigger ชิดขอบ (เช่น ก้น sidebar)
  triggerClassName="w-full"
  trigger={(open) => (
    <button className="...">
      <Avatar ... />
      <span>iprite</span>
      <ChevronsUpDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
    </button>
  )}
>
  <div className="min-w-[200px]">
    {/* panel content — header, items, divider, etc. */}
  </div>
</Popover>

// Controlled (optional)
<Popover trigger={...} open={isOpen} onOpenChange={setIsOpen}>...</Popover>
```

- ต้นแบบจริง: [`profile-menu.tsx`](apps/perpos/src/layouts/profile-menu.tsx) (การ์ดที่ก้น sidebar) ห่อ `<Popover>`
- `placement` รองรับ 8 ทิศ: `"bottom-start|end"`, `"top-start|end"`, `"right-start|end"`, `"left-start|end"` — `right-*`/`left-*` ใช้เมื่อ trigger ชิดขอบ (เปิดด้านข้าง) · `-end` = ชิด/align ด้านล่าง, `-start` = ด้านบน
- `trigger` รับได้ทั้ง node ตรง ๆ หรือ render-prop `(open) => node` (ใช้ render-prop เมื่ออยากให้ chevron หมุนตาม state)
- ปิดเองเมื่อเปลี่ยนหน้า (route change) + คลิกนอก panel

### Button variants

```tsx
import { Button } from '@/components/ui/button';

<Button>Primary (blue)</Button>
<Button variant="outline">Outline</Button>
<Button variant="secondary">Secondary (gray)</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="destructive">Destructive (red)</Button>
<Button size="sm">Small</Button>
<Button size="lg">Large</Button>
<Button size="icon"><IconName /></Button>

// Loading state — Button ไม่มี isLoading prop ให้ใช้ disabled + text แทน
<Button disabled={saving}>{saving ? 'กำลังบันทึก…' : 'บันทึก'}</Button>
```

### Input

```tsx
import { Input } from '@/components/ui/input';

<Input placeholder="..." />
<Input type="date" />
<Input type="number" />
<Input type="time" />
```

### NativeSelect

```tsx
import { NativeSelect } from '@/components/ui/native-select';

<NativeSelect value={val} onChange={e => setVal(e.target.value)}>
  <option value="">— เลือก —</option>
  <option value="a">A</option>
</NativeSelect>

// ถ้าต้องการ width อัตโนมัติ (ไม่ full-width)
<NativeSelect className="w-auto">...</NativeSelect>
```

### Label

```tsx
import { Label } from '@/components/ui/label';

<Label htmlFor="field-id">ชื่อ *</Label>
<Input id="field-id" ... />
```

### Dialog

> **กฎเด็ดขาด**: ทุก Dialog ต้องมี `DialogBody` — header/footer sticky อัตโนมัติ, body เท่านั้นที่ scroll. ดูมาตรฐานเต็มใน [DESIGN.md §13](DESIGN.md)

```tsx
import {
  Dialog, DialogContent, DialogBody, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';

<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent size="lg">          {/* sm|md|lg|xl|2xl|3xl|full */}
    <DialogHeader>
      <DialogTitle>หัวข้อ</DialogTitle>
    </DialogHeader>
    <DialogBody>
      {/* เนื้อหา/ฟอร์ม — ส่วนเดียวที่ scroll */}
    </DialogBody>
    <DialogFooter>
      <Button variant="outline" onClick={() => setOpen(false)}>ยกเลิก</Button>
      <Button onClick={handleSave}>บันทึก</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>

// ❌ ห้าม — เลิกใช้รูปแบบนี้ทั้งหมด
<DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
// ✅ แทนด้วย
<DialogContent size="xl">
```

### CustomSelect

```tsx
import { CustomSelect } from '@/components/ui/custom-select';

// options ต้องเป็น { value: string; label: string }[]
<CustomSelect
  value={val}
  onChange={(v) => setVal(v)}
  options={[
    { value: '', label: 'ทุกสถานะ' },
    { value: 'active', label: 'ใช้งาน' },
  ]}
/>

// กำหนดความกว้าง
<CustomSelect ... className="w-36" />
```

### ThaiDatePicker

```tsx
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";

// value และ onChange ใช้ ISO string "YYYY-MM-DD" (CE)
<ThaiDatePicker
  value={form.date} // "2025-01-15" หรือ ""
  onChange={(iso) => setForm((f) => ({ ...f, date: iso }))}
  placeholder="เลือกวันที่" // optional
/>;
```

### ห้ามใช้เด็ดขาด

```tsx
// ❌ ห้าม
import { Button } from 'rizzui';
<button className="...">Click</button>
<input className="border rounded-lg ..." />
<select className="border rounded-lg ...">
<label className="text-xs ...">
<input type="date" ...>   // ❌ ใช้ ThaiDatePicker แทน

// ✅ ถูกต้อง
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CustomSelect } from '@/components/ui/custom-select';
import { ThaiDatePicker } from '@/components/ui/thai-date-picker';
import { Label } from '@/components/ui/label';
```

---

## Supabase Project

- **Project ID**: `zftnyipifpaiqzukiyzi`
- **Region**: ap-southeast-1 (Singapore)
- **URL**: `https://zftnyipifpaiqzukiyzi.supabase.co`

---

## Deployment

- **Platform**: Vercel (Hobby plan)
- **Domain**: perpos.ai
- **PDF Service**: Google Cloud Run (`asia-southeast1`) — `perpos-pdf-renderer`
- **OCR Worker**: Google Cloud Run (`asia-southeast1`) — `perpos-ocr-worker`
- **STT Worker**: Google Cloud Run (`asia-southeast1`) — `perpos-stt-worker` · deploy ด้วย `--memory 2Gi --concurrency 3 --no-cpu-throttling` · secrets: `WORKER_SECRET`, `GEMINI_API_KEY`, `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` · env: `APP_BASE_URL=https://app.perpos.ai` (**ต้องตั้ง** — แอปอยู่ที่ app.perpos.ai ไม่ใช่ perpos.ai ที่ default; ถ้าไม่ตั้ง callback mom-deliver จะ 404 → LINE ไม่ได้ PDF)
  - **ไฟล์ยาว = อัปไฟล์ทั้งก้อนเข้า Gemini Files API ตรง ๆ** (รองรับถึง 2GB / หลายชั่วโมง) — **ไม่ตัด/ไม่ใช้ ffmpeg** เพราะ Gemini เห็น global context ทั้งไฟล์ → สรุปคมกว่า. ผลลัพธ์เป็น **รายงานการประชุม (Minutes of Meeting)** JSON: meeting_title, executive_summary, key_topics, decisions (มติ), action_items, speakers (ผู้เข้าร่วม) — **ไม่มี transcript คำต่อคำ/timestamp** (เน้นสรุป → output เล็ก เร็ว ไม่ชน 64k output cap แม้ไฟล์ยาวหลายชั่วโมง) — ถ้าจะลดขนาด/เวลาอัปโหลด ให้บีบไฟล์เป็น .ogg/Opus จาก client
  - **`--no-cpu-throttling` บังคับ**: STT เป็นงาน async fire-and-forget ที่ใช้เวลา 30–90 วิหลังตอบ 202 — ถ้า CPU ถูก throttle หลังส่ง response (ค่า default ของ Cloud Run) background job จะค้างไม่จบ (job ค้าง `pending`/`processing`). ต่างจาก ocr-worker ที่งานสั้นจึงรอดด้วย default throttling
  - **GEMINI_API_KEY ต้องเป็น paid tier**: free tier — `gemini-2.5-pro` quota = 0 (ใช้ไม่ได้), `gemini-2.5-flash` มักโดน 503 high-demand. ต้องเปิด billing บน Google AI Studio / ใช้ Vertex AI
  - worker มี retry-with-backoff (429/500/503, 4 ครั้ง) + เปรียบเทียบ `WORKER_SECRET` แบบ `.trim()` (กัน secret ที่มี trailing newline ใน Secret Manager)
- **PDF Compress Worker**: Google Cloud Run (`asia-southeast1`) — `perpos-pdf-compress-worker` · deploy ด้วย `--memory 4Gi --cpu 2 --concurrency 2 --no-cpu-throttling` (concurrency ต่ำกัน OOM — แต่ละ req ถือ buffer) · engine = **pikepdf + Pillow** spawn `python3 compress.py` (surgical, **ไม่ใช้ ghostscript**) · secrets: `WORKER_SECRET`, `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (ไม่มี GEMINI) · env: `APP_BASE_URL=https://app.perpos.ai`, `PDF_MAX_MB=100`, `PDF_MAX_PAGES=500` · ดูคัมภีร์ [`docs/PDF_COMPRESS_FEATURE.md`](docs/PDF_COMPRESS_FEATURE.md)
- **Cron**: Google Cloud Scheduler (`asia-southeast1`) → `POST https://perpos.ai/api/assistant/scheduler`

### Cloud Run Workers — กฎบังคับ

> **Stack**: ทุก Cloud Run worker ใช้ **plain Express + TypeScript** เท่านั้น — ห้ามใช้ NestJS, Fastify, หรือ framework อื่น
> Worker มีแค่ 2 endpoints: `GET /healthz` และ `POST /<action>` ตรวจ `x-worker-secret` header

**โครงสร้าง worker มาตรฐาน:**

```
services/<worker-name>/
├── src/
│   ├── main.ts          # Express server (healthz + action endpoint)
│   └── <name>.service.ts # plain functions — ไม่มี class/decorator
├── Dockerfile
├── .gcloudignore        # ← ต้องมีเสมอ (ดูด้านล่าง)
├── package.json         # deps: express + domain libs เท่านั้น
└── tsconfig.json        # ไม่มี experimentalDecorators
```

**`.gcloudignore` — ต้องมีทุก service** (ถ้าไม่มี `node_modules` จะถูก upload ทั้งหมด ทำให้ deploy ช้ามาก):

```
.gcloudignore
.git
.gitignore
node_modules/
dist/
*.log
.env*
!.env.example
README.md
```

**Deploy = `gcloud` มือเท่านั้น — ไม่มี CI auto-deploy สำหรับ workers** (workflow `deploy-workers.yml` ถูกลบแล้ว เพราะ `GCP_SA_KEY` ไม่เคยตั้ง + เงื่อนไขไม่ match squash merge → ใช้ไม่ได้จริง) · deploy ทุกครั้งรัน `gcloud run deploy --source` จาก `services/<worker>/` เอง

- เครื่อง dev ถ้า gcloud ฟ้อง _"Python 3.9 no longer supported"_ → `export CLOUDSDK_PYTHON=$(command -v python3.14 || command -v python3.13)` ก่อน
- 4 services: `perpos-pdf-renderer` (2Gi, timeout 120, concurrency 5) · `perpos-ocr-worker` (1Gi) · `perpos-stt-worker` (2Gi, concurrency 3, `--no-cpu-throttling`, `APP_BASE_URL`) · `perpos-pdf-compress-worker` (4Gi, cpu 2, concurrency 2, `--no-cpu-throttling`, `APP_BASE_URL`,`PDF_MAX_MB`,`PDF_MAX_PAGES`) · ทุกตัวมี secret `SENTRY_DSN` ด้วย

**Deploy command มาตรฐาน** (ห้ามใส่ `--set-env-vars PORT=8080` — Cloud Run inject ให้อัตโนมัติ):

```bash
gcloud run deploy <service-name> \
  --source . \
  --region asia-southeast1 \
  --project perpos \
  --memory <RAM> \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 5 \
  --timeout 540 \
  --concurrency 10 \
  --allow-unauthenticated \
  --set-secrets "WORKER_SECRET=WORKER_SECRET:latest,..."
```

---

## สถาปัตยกรรม — BFF + Serverless Workers

PERPOS ใช้รูปแบบ **"BFF (Backend for Frontend) + Serverless Workers"** ซึ่งเป็นท่ามาตรฐานของ Tech Startup ยุคใหม่ที่ได้ข้อดีของสองโลกรวมกัน:

| Layer                   | เทคโนโลยี          | หน้าที่                                                              |
| ----------------------- | ------------------ | -------------------------------------------------------------------- |
| **Frontend + Core API** | Next.js + Supabase | UI, business logic, RLS, Trigger — พัฒนาไว ลีน ตอบสนองทันที          |
| **Heavy Workers**       | Google Cloud Run   | งานหนัก (PDF, Payroll batch, AI analysis) — สเกลแยกอิสระ ไม่กวน Core |

### ทำไมต้องแยก Heavy Jobs ออกไป Cloud Run?

- **PDF / Puppeteer กิน RAM หนักมาก** — บางครั้งซด 1–2 GB ต่อ session ถ้าไม่แยกออกไป Next.js Core จะค้าง
- **Pay-per-use 100%** — Cloud Run สเกลลงเหลือ 0 instance เมื่อไม่มีงาน ไม่ต้องจ่ายค่าเซิร์ฟเวอร์ทิ้งตลอดเดือน
- **ไม่ติด Timeout** — Next.js Route Handler อยู่ที่ 10–60 วินาที, Cloud Run รันได้สูงสุด 60 นาที เหมาะกับ batch ปิดงบ/คำนวณ payroll

### Database-Driven Job Queue (ท่าที่ใช้ใน PERPOS)

ไม่ต้องตั้ง messaging queue เพิ่ม — ใช้ Supabase ที่มีอยู่แล้วเป็นตัวแจกงาน:

```
1. [Next.js] User กดสั่งงาน
        → INSERT job_queues (status = 'pending', triggered_by = user_id, correlation_id)
        → ตอบ User ทันทีว่า "กำลังปั่นเอกสาร..."

2. [Supabase Webhook] ตรวจเจอ row ใหม่ใน job_queues
        → HTTP POST → Cloud Run URL (payload: job_id, org_id, correlation_id)
        → Auth: Verify JWT หรือ Google Cloud IAM

3. [Cloud Run] ตื่นขึ้นมาประมวลผล
        → ดึงข้อมูลจาก Supabase
        → รันงานหนัก (render PDF, คำนวณ payroll, ฯลฯ)
        → อัปโหลดผลลัพธ์ขึ้น Object Storage → ได้ URL

4. [Cloud Run → Supabase] อัปเดตสถานะ
        → UPDATE job_queues SET status = 'completed', output_url = '...', completed_at = now()

5. [Supabase Realtime → Next.js] แจ้ง User ทันที
        → ปุ่มดาวน์โหลดเด้งขึ้นหน้าจอโดยอัตโนมัติ
```

### Schema ตาราง job_queues (แนวทาง)

```sql
CREATE TABLE job_queues (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  job_type      text NOT NULL,           -- 'pdf_report' | 'payroll_run' | 'batch_close'
  status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','processing','completed','failed')),
  payload       jsonb NOT NULL DEFAULT '{}',
  output_url    text,
  error_message text,
  -- Audit / tracing
  triggered_by  uuid REFERENCES profiles(id),  -- user ที่กดสั่ง
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  started_at    timestamptz,
  completed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
```

---

## Audit Log — กฎสำหรับ Cloud Run Workers

เมื่อ Cloud Run เขียนข้อมูลกลับมายัง Supabase **ต้องส่ง Correlation ID** ของ user ที่สั่งงานตั้งแต่แรกข้ามมาด้วยเสมอ เพื่อให้ Audit Log ระบุได้ว่า "Cloud Run เป็นคนเขียน แต่ใครเป็นคนสั่ง"

```typescript
// ตัวอย่าง payload ที่ Next.js ส่งไปให้ Cloud Run
const jobPayload = {
  job_id:         jobId,
  org_id:         orgId,
  correlation_id: job.correlation_id,   // ← UUID ของ job นั้น
  triggered_by:   auth.userId,           // ← user ที่กดสั่ง
  triggered_by_email: auth.email,
};

// Cloud Run ใช้ค่าเหล่านี้เขียน audit log
await supabase.from('audit_logs').insert({
  actor_type:     'cloud_run_worker',
  actor_id:       jobPayload.triggered_by,        // user ต้นทาง
  actor_email:    jobPayload.triggered_by_email,
  correlation_id: jobPayload.correlation_id,
  action:         'pdf.generated',
  ...
});
```

**กฎเด็ดขาด**:

- Cloud Run ต้องรับ `triggered_by` + `correlation_id` ใน payload เสมอ
- ห้ามใช้ service account ID เป็น `actor_id` ใน audit log — ต้องใช้ user จริงที่กดสั่ง
- ถ้า job ล้มเหลว ให้ UPDATE `job_queues.status = 'failed'` + บันทึก `error_message` ก่อน ค่อย throw

---

## Security — Cloud Run Service-to-Service Auth

การเปิด Cloud Run ให้ Supabase Webhook เรียกได้ **ต้องล็อกสิทธิ์** ด้วยวิธีใดวิธีหนึ่ง:

| วิธี                          | แนะนำเมื่อ                                                                              |
| ----------------------------- | --------------------------------------------------------------------------------------- |
| **Google Cloud IAM (Invoke)** | Production — Supabase Webhook ใช้ Service Account ที่มี `roles/run.invoker` เท่านั้น    |
| **Shared Secret Header**      | Dev/Staging — Cloud Run ตรวจ `X-Worker-Secret` header ที่ตรงกับ env var `WORKER_SECRET` |

```typescript
// Cloud Run — ตรวจ secret ฝั่ง worker (ถ้าไม่ใช้ IAM)
const secret = req.headers.get("x-worker-secret");
if (secret !== process.env.WORKER_SECRET) {
  return new Response("Unauthorized", { status: 401 });
}
```

**Scoped Permission สำหรับ AI Workers**: ถ้าใช้ AI บน Cloud Run วิเคราะห์บัญชีและเขียนผลลัพธ์กลับ ให้สร้าง Supabase Service Token แบบ Scoped — เขียนได้เฉพาะตารางรายงาน ห้ามแตะตาราง `profiles`, `user_permissions`, `organizations`, หรือตารางสิทธิ์ใดๆ

```sql
-- ตัวอย่าง RLS policy สำหรับ AI worker service role (scoped)
CREATE POLICY "ai_worker_write_reports_only"
  ON report_outputs FOR INSERT
  WITH CHECK (true);  -- service role ของ AI worker เขียนได้เฉพาะตารางนี้
-- ตารางอื่นไม่มี policy เปิด → INSERT/UPDATE/DELETE ถูก deny อัตโนมัติ
```

---

## Knowledge Graph (Graphify)

โปรเจกต์นี้ใช้ **Graphify** ในการสร้างแผนภาพความสัมพันธ์และโครงสร้างของ codebase เพื่อช่วยให้ AI Agents (เช่น Antigravity) สามารถวิเคราะห์ ทำความเข้าใจ และแก้ไขระบบ Monorepo ได้อย่างถูกต้อง แม่นยำ และประหยัด token

- **ผลลัพธ์ของ Graph**: จะอยู่ในโฟลเดอร์ `graphify-out/` ประกอบด้วย `graph.json`, `GRAPH_REPORT.md` และ `graph.html` (สำหรับเปิดดูความสัมพันธ์เชิงแผนภาพบน browser)
- **กฎการอัปเดต**: ทุกครั้งที่มีการสร้างโมดูลใหม่, ย้ายโครงสร้างโฟลเดอร์ หรืออัปเดตโค้ดครั้งใหญ่ **ต้องสั่งรันอัปเดต Graph เสมอ** เพื่อให้ฐานข้อมูลความรู้ของ Agent เป็นปัจจุบัน ด้วยคำสั่ง:
  ```bash
  .venv/bin/python3 -m graphify update .
  ```
  _(ไม่มีค่าใช้จ่าย API ของ LLM เนื่องจากเป็นการดึงโครงสร้างแบบ AST ท้องถิ่น)_
