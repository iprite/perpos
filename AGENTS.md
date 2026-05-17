# AGENTS.md — PERPOS

คู่มือสำหรับ AI agents ที่ทำงานกับ codebase นี้

---

## ภาพรวมโปรเจกต์

**PERPOS** — ระบบบัญชีและ ERP สำหรับธุรกิจ SME ประเทศไทย พร้อม LINE Bot assistant
- Frontend: Next.js 15 (App Router), React 19, TypeScript
- **Backend: Nest.js 10 + TypeScript (ทุก API route ย้ายมาอยู่ใน `services/api/`)**
- Database: Supabase (PostgreSQL) พร้อม Row Level Security
- Auth: Supabase Auth (Google OAuth + LINE Login)
- UI: Rizzui, Tailwind CSS, Radix UI
- Monorepo: pnpm workspaces + Turbo

> **กฎสำคัญ**: ห้ามเขียน API logic ใน Next.js `app/api/` — ทุก endpoint ต้องอยู่ใน `services/api/` (Nest.js) เท่านั้น

---

## โครงสร้าง Monorepo

```
perpos/
├── apps/perpos/          # Next.js frontend (port 3002) — UI เท่านั้น ไม่มี API routes
├── packages/
│   ├── config-tailwind/  # Shared Tailwind config
│   ├── config-typescript/
│   └── isomorphic-core/  # Shared components
├── services/
│   ├── api/              # Nest.js backend (port 3001) — API ทั้งหมด
│   │   └── src/
│   │       ├── line/         # LINE Bot (webhook, link-token, unlink)
│   │       ├── assistant/    # Scheduler + TaskNotifier
│   │       ├── admin/        # Users, Delivery, NewsAgent, Modules
│   │       ├── google/       # Drive + Calendar
│   │       ├── org/          # Organization invites
│   │       ├── news/         # NewsService
│   │       ├── email/        # EmailService
│   │       └── supabase/     # SupabaseService (admin + authed clients)
│   └── pdf-renderer/     # Nest.js PDF microservice (Cloud Run, port 8080)
└── supabase/
    └── migrations/       # Migration SQL files
```

---

## คำสั่ง Development

```bash
# ติดตั้ง dependencies (จาก root)
pnpm install

# รัน frontend (apps/perpos)
pnpm starter:dev       # port 3002

# รัน Nest.js API backend (services/api)
pnpm api:dev           # port 3001
# หรือ: cd services/api && pnpm dev

# รัน PDF microservice (services/pdf-renderer)
pnpm pdf:dev           # port 8080
# หรือ: cd services/pdf-renderer && pnpm dev

# Type check (ทุก service)
cd apps/perpos && pnpm exec tsc --noEmit
cd services/api && pnpm type-check
cd services/pdf-renderer && pnpm type-check

# Lint
pnpm lint

# Build
pnpm build
```

---

## App Router Structure (`apps/perpos/src/app/`)

| Path | หน้าที่ |
|------|---------|
| `(hydrogen)/` | Protected routes (ต้อง login) |
| `(hydrogen)/assistant/` | AI Task Manager dashboard |
| `(hydrogen)/admin/` | Admin console |
| `(hydrogen)/sales/` | ใบเสนอราคา, ใบแจ้งหนี้, ใบเสร็จ |
| `(hydrogen)/purchase/` | ใบสั่งซื้อ, บันทึกค่าใช้จ่าย |
| `(hydrogen)/finance/` | บัญชีธนาคาร, เช็ค, ภาษีหัก ณ ที่จ่าย |
| `(hydrogen)/journal/` | สมุดรายวัน |
| `(hydrogen)/accounts/` | ผังบัญชี |
| `(hydrogen)/inventory/` | สินค้า, สต๊อก |
| `(hydrogen)/payroll/` | เงินเดือน, พนักงาน |
| `(hydrogen)/tax/` | ภาษีมูลค่าเพิ่ม, ภาษีหัก ณ ที่จ่าย |
| `(auth)/` | Login, signup |

---

## API Endpoints — Nest.js Backend (`services/api/` port 3001)

| Endpoint | Method | Module | หน้าที่ |
|----------|--------|--------|---------|
| `/line/webhook` | POST | LineModule | LINE Bot webhook หลัก |
| `/line/link-token` | POST | LineModule | สร้าง token ผูกบัญชี LINE |
| `/line/unlink` | POST | LineModule | ยกเลิกผูกบัญชี LINE |
| `/assistant/scheduler` | GET/POST | AssistantModule | Cron trigger สำหรับแจ้งเตือน task |
| `/admin/delivery/logs` | GET | AdminModule | ดู logs การส่ง |
| `/admin/delivery/schedule` | PUT | AdminModule | ตั้ง cron schedule ส่งข่าว |
| `/admin/delivery/send-now` | POST | AdminModule | ส่งข่าวทันที |
| `/admin/news-agent/preview` | POST | AdminModule | Preview ข่าว |
| `/admin/users/list` | GET | AdminModule | รายชื่อ users |
| `/admin/users/invite` | POST | AdminModule | เชิญ user |
| `/admin/users/delete` | POST | AdminModule | ลบ user |
| `/admin/users/permissions` | GET/PUT | AdminModule | จัดการสิทธิ์ |
| `/admin/users/orgs` | GET/PUT/DELETE | AdminModule | จัดการ org memberships |
| `/admin/modules` | GET/PUT | AdminModule | ตั้งค่า module ต่อ org |
| `/google-drive/connect` | POST | GoogleModule | เชื่อม Google Drive+Calendar |
| `/google-drive/callback` | GET | GoogleModule | OAuth callback |
| `/google-drive/disconnect` | POST | GoogleModule | ยกเลิกการเชื่อม |
| `/google-drive/status` | GET | GoogleModule | ตรวจสถานะการเชื่อม |
| `/org/invite` | POST | OrgModule | เชิญเข้า organization |

**Auth Guards:**
- `AdminGuard` — Bearer token + `profiles.role = 'admin'`
- `ActiveUserGuard` — Bearer token + `profiles.is_active = true`
- `CronAuthGuard` — `CRON_SECRET` via header หรือ Authorization

---

## LINE Bot Commands

ทุกคำสั่ง **ต้องขึ้นต้นด้วย `/`** ข้อความที่ไม่มี `/` จะถูก ignore

| คำสั่ง | หน้าที่ | Permission Key |
|--------|---------|---------------|
| `/help` | แสดงคำสั่งทั้งหมด | — |
| `/link <token>` | ผูกบัญชี LINE | — |
| `/ข่าว` | สรุปข่าว | `bot.news.request` |
| `/สรุปล่าสุด` | ข่าวล่าสุด | `bot.news.latest` |
| `/รายรับ <จำนวน> <โน้ต>` | บันทึกรายรับ | `bot.finance.income_add` |
| `/รายจ่าย <จำนวน> <โน้ต>` | บันทึกรายจ่าย | `bot.finance.expense_add` |
| `/นัด <HH:MM> <เรื่อง>` | เพิ่มนัดวันนี้ | `bot.calendar.add` |
| `/วันนี้` | ดูนัดวันนี้ | `bot.calendar.today` |
| `/t <ข้อความ>` | บันทึก task ใหม่ | `bot.assistant.tasks` |
| `/tk` | รายการ task ที่รอ | `bot.assistant.tasks` |
| `/d <N>` | ปิด task ที่ N | `bot.assistant.tasks` |
| `/a <ชื่อ> <วัน> <HH:MM>` | บันทึกนัดหมาย | `bot.assistant.tasks` |
| `/ap` | นัดวันนี้ | `bot.assistant.tasks` |

**หมายเหตุ:** Admin role ข้ามการเช็ค permission ทั้งหมด

---

## Database Schema (Supabase)

### ตารางหลัก

| Table | หน้าที่ |
|-------|---------|
| `profiles` | Users (id, email, role, line_user_id, is_active) |
| `user_permissions` | สิทธิ์รายฟังก์ชัน (user_id, function_key, allowed) |
| `tasks` | AI Task Manager (profile_id, title, status, priority, due_at, remind_at) |
| `calendar_events` | นัดหมาย LINE Bot (profile_id, starts_at, title) |
| `finance_entries` | รายรับ/รายจ่าย LINE Bot (profile_id, entry_type, amount) |
| `news_agent_configs` | ตั้งค่า News Agent (topics, sources, summary_style) |
| `delivery_schedules` | cron schedule ส่งข่าว |
| `delivery_logs` | log การส่งข่าว |
| `line_link_tokens` | token ผูกบัญชี LINE (expires 10 นาที) |
| `google_drive_tokens` | OAuth tokens Google Drive |
| `organizations` | บริษัท/องค์กร |
| `organization_members` | สมาชิกองค์กร |
| `orders` / `order_items` | ออเดอร์ขาย |
| `sales_quotes` / `sales_invoices` | ใบเสนอราคา / ใบแจ้งหนี้ |
| `customers` / `workers` | ลูกค้า / พนักงาน |

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

| Path | หน้าที่ |
|------|---------|
| `lib/assistant/task-parser.ts` | NLP parse ข้อความเป็น task (OpenAI, optional) |
| `lib/assistant/task-notifier.ts` | ส่งแจ้งเตือน due/daily briefing/follow-up |
| `lib/line/send-messages.ts` | Push/multicast LINE messages |
| `lib/news/news-agent.ts` | Fetch RSS + summarize ด้วย OpenAI |
| `lib/google/drive.ts` | Google Drive OAuth + upload |
| `lib/supabase/{client,server,admin}.ts` | Supabase clients |

---

## Environment Variables

| Variable | หน้าที่ | จำเป็น |
|----------|---------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role (server only) | ✅ |
| `LINE_MESSAGING_CHANNEL_SECRET` | LINE webhook signature verify | ✅ |
| `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN` | ส่งข้อความ LINE | ✅ |
| `CRON_SECRET` | ป้องกัน scheduler endpoint | ✅ |
| `OPENAI_API_KEY` | NLP task parse + news summary | optional |
| `OPENAI_MODEL` | โมเดล OpenAI (default: gpt-4o-mini) | optional |
| `PDF_RENDER_URL` | PDF microservice URL | optional |
| `PDF_SERVICE_SECRET` | PDF service auth | optional |
| `SMTP_*` | Email invite | optional |

---

## Notification Scheduler

Endpoint: `POST /api/assistant/scheduler`
- ป้องกันด้วย `Authorization: Bearer <CRON_SECRET>` หรือ `x-vercel-cron-secret`
- ตั้ง cron ทุก 1 นาทีผ่าน **Google Cloud Scheduler** (Vercel Hobby ไม่รองรับ every-minute)
- Logic:
  - ทุก run → ส่ง due reminders (remind_at ≤ now ≤ now-5min)
  - 08:28–08:32 BKK → Daily Briefing
  - 17:00–17:04 BKK → Follow-up งานค้าง

---

## Conventions

- **Migration**: เพิ่มไฟล์ `.sql` ใน `supabase/migrations/` ชื่อ `YYYYMMDDHHMMSS_description.sql`
- **RLS**: ทุก table ใหม่ต้อง enable RLS และมี policy
- **API routes**: ใช้ `createSupabaseAdminClient()` เสมอ (ไม่ใช้ anon key ใน server)
- **Permission check**: เช็คผ่าน `user_permissions` table, admin role bypass ทั้งหมด
- **LINE reply**: ใช้ `replyText()` / `replyFlex()` ใน webhook — ใช้ token ได้ครั้งเดียว
- **LINE push**: ใช้ `sendLineMessages()` จาก `lib/line/send-messages.ts`
- **Commit**: ไม่ push จนกว่าจะสั่ง

---

## Supabase Project

- **Project ID**: `zftnyipifpaiqzukiyzi`
- **Region**: ap-southeast-1 (Singapore)
- **URL**: `https://zftnyipifpaiqzukiyzi.supabase.co`

---

## Deployment

- **Platform**: Vercel (Hobby plan)
- **Domain**: perpos.io
- **PDF Service**: Google Cloud Run (`asia-southeast1`)
- **Cron**: Google Cloud Scheduler (`asia-southeast1`) → `POST https://perpos.io/api/assistant/scheduler`
