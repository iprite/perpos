# AGENTS.md — PERPOS

คู่มือสำหรับ AI agents ที่ทำงานกับ codebase นี้

---

## ภาพรวมโปรเจกต์

**PERPOS** — ระบบบัญชีและ ERP สำหรับธุรกิจ SME ประเทศไทย พร้อม LINE Bot assistant
- Frontend + Backend: Next.js 15 (App Router), React 19, TypeScript
- **API routes อยู่ใน `apps/perpos/src/app/api/` (Next.js Route Handlers)**
- Database: Supabase (PostgreSQL) พร้อม Row Level Security
- Auth: Supabase Auth (Google OAuth + LINE Login)
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
│   └── stt-worker/                 # Speech-to-text worker — Express + Gemini Files API (Cloud Run, port 8080)
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

## API Endpoints — Next.js Route Handlers (`apps/perpos/src/app/api/`)

| Endpoint | Method | File | หน้าที่ |
|----------|--------|------|---------|
| `/api/line/webhook` | POST | `line/webhook/route.ts` | LINE Bot webhook หลัก |
| `/api/line/link-token` | POST | `line/link-token/route.ts` | สร้าง token ผูกบัญชี LINE |
| `/api/line/unlink` | POST | `line/unlink/route.ts` | ยกเลิกผูกบัญชี LINE |
| `/api/assistant/scheduler` | POST | `assistant/scheduler/route.ts` | Cron trigger สำหรับแจ้งเตือน task |
| `/api/admin/delivery/logs` | GET | `admin/delivery/logs/route.ts` | ดู logs การส่ง |
| `/api/admin/delivery/schedule` | PUT | `admin/delivery/schedule/route.ts` | ตั้ง cron schedule |
| `/api/admin/delivery/send-now` | POST | `admin/delivery/send-now/route.ts` | ส่งข่าวทันที |
| `/api/admin/news-agent/preview` | POST | `admin/news-agent/preview/route.ts` | Preview ข่าว |
| `/api/admin/users/list` | GET | `admin/users/list/route.ts` | รายชื่อ users |
| `/api/admin/users/invite` | POST | `admin/users/invite/route.ts` | เชิญ user |
| `/api/admin/users/delete` | POST | `admin/users/delete/route.ts` | ลบ user |
| `/api/admin/users/permissions` | GET/PUT | `admin/users/permissions/route.ts` | จัดการสิทธิ์ |
| `/api/admin/users/orgs` | GET/PUT/DELETE | `admin/users/orgs/route.ts` | จัดการ org memberships |
| `/api/admin/modules` | GET/PUT | `admin/modules/route.ts` | ตั้งค่า module ต่อ org |
| `/api/google-drive/connect` | POST | `google-drive/connect/route.ts` | เชื่อม Google Drive+Calendar |
| `/api/google-drive/callback` | GET | `google-drive/callback/route.ts` | OAuth callback |
| `/api/google-drive/disconnect` | POST | `google-drive/disconnect/route.ts` | ยกเลิกการเชื่อม |
| `/api/google-drive/status` | GET | `google-drive/status/route.ts` | ตรวจสถานะการเชื่อม |
| `/api/org/invite` | POST | `org/invite/route.ts` | เชิญเข้า organization |
| `/api/assistant/transcribe/jobs` | GET/POST | `assistant/transcribe/jobs/route.ts` | สร้าง/ดึงงานแกะเสียง (STT) |
| `/api/assistant/transcribe/jobs/process` | POST | `assistant/transcribe/jobs/process/route.ts` | claim job + ยิงไป stt-worker |
| `/api/tmc/*` | various | `tmc/*/route.ts` | TMC Management endpoints |

**Auth helpers** (`app/api/_lib/`):
- `requireAdmin(req)` — Bearer token + `profiles.role = 'admin'`
- `requireUser(req)` — Bearer token + active user
- `CronAuthGuard` — `CRON_SECRET` via `Authorization` header หรือ `x-vercel-cron-secret`

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
| `/mom` | แกะเสียงเป็นรายงานการประชุม (ส่งไฟล์เสียงตามหลัง → ได้ PDF กลับทาง LINE) | `bot.assistant.tasks` |
| `/web` | รับ magic link เข้าเว็บ (ล็อกอินอัตโนมัติ + เคลมบัญชี ตั้ง email/password) | — |
| `/t <ข้อความ>` | บันทึก task ใหม่ | `bot.assistant.tasks` |
| `/tk` | รายการ task ที่รอ | `bot.assistant.tasks` |
| `/d <N>` | ปิด task ที่ N | `bot.assistant.tasks` |
| `/a <ชื่อ> <วัน> <HH:MM>` | บันทึกนัดหมาย | `bot.assistant.tasks` |
| `/ap` | นัดวันนี้ | `bot.assistant.tasks` |

**หมายเหตุ:** Admin role ข้ามการเช็ค permission ทั้งหมด

**Auto-onboarding (LINE-first):** เมื่อมี `follow` event (แอด OA) → `provisionLineUser` ([api/line/_provision.ts](apps/perpos/src/app/api/line/_provision.ts)) สร้าง shadow auth user (email `line.<id>@stt-line.perpos.io`) → trigger สร้าง profile → personal org + member(owner) + org_module_settings(assistant) + personal_module_grants(assistant) + stt_quota(300นาที) + line_active_org_id → push welcome Flex. idempotent ต่อ `line_user_id` (re-follow ไม่สร้างซ้ำ). ผู้ใช้พิมพ์ `/mom` ได้ทันทีโดยไม่ต้องสมัครเว็บ

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
| `transcription_jobs` | งานแกะเสียง→MoM (profile_id, source web/line, status, transcript_json, duration_seconds) |
| `stt_quota` | โควต้าแกะเสียงต่อคน (profile_id, limit_seconds default 18000=300นาที, used_seconds) — admin ปรับ limit ได้ |
| `stt_usage_transactions` | ledger การใช้โควต้า (debit/refund) — RPC `consume_stt_quota`/`refund_stt_quota` (service role) atomic reserve+refund; quota บังคับใช้ที่ stt-worker (วัดความยาวด้วย music-metadata ก่อนเรียก Gemini) · API: `GET /api/assistant/transcribe/quota`, `GET|PUT /api/admin/stt-quota` |
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
| `OCR_WORKER_URL` | URL ของ ocr-worker (Cloud Run) สำหรับ AI bookkeeping | acc_firm |
| `STT_WORKER_URL` | URL ของ stt-worker (Cloud Run) สำหรับแกะเสียงเป็นข้อความ | assistant |
| `WORKER_SECRET` | shared secret เรียก ocr-worker/stt-worker (`x-worker-secret`) | acc_firm/assistant |
| `GEMINI_API_KEY` | Gemini OCR/classify/journal + speech-to-text (ตั้งที่ ocr-worker + stt-worker) | acc_firm/assistant |
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
- **API routes**: ใช้ `createAdminClient()` จาก `app/api/_lib/supabase.ts` เสมอ (ไม่ใช้ anon key ใน Route Handlers)
- **Permission check**: เช็คผ่าน `user_permissions` table, admin role bypass ทั้งหมด
- **LINE reply**: ใช้ `replyText()` / `replyFlex()` ใน webhook — ใช้ token ได้ครั้งเดียว
- **LINE push**: ใช้ `sendLineMessages()` จาก `lib/line/send-messages.ts`
- **Commit**: ไม่ push จนกว่าจะสั่ง

---

## Design System — UI Components

> **กฎบังคับ**: ทุก UI ใน `apps/perpos/` ต้องใช้ components จาก `@/components/ui/` เท่านั้น  
> ห้ามใช้ `rizzui`, raw `<button>`, `<input>`, `<select>`, `<label>` โดยตรง

### Components ที่ต้องใช้เสมอ

| ต้องการ | ใช้ | Import จาก |
|---------|-----|-----------|
| ปุ่ม | `<Button>` | `@/components/ui/button` |
| Text input / number | `<Input>` | `@/components/ui/input` |
| **Dropdown / Select** | `<CustomSelect>` | `@/components/ui/custom-select` |
| **Date picker** | `<ThaiDatePicker>` | `@/components/ui/thai-date-picker` |
| Label | `<Label>` | `@/components/ui/label` |
| Modal / Dialog | `<Dialog>`, `<DialogContent>`, `<DialogHeader>`, `<DialogTitle>`, `<DialogFooter>` | `@/components/ui/dialog` |
| Native select (เฉพาะ `type="month"` หรือกรณีพิเศษ) | `<NativeSelect>` | `@/components/ui/native-select` |
| Time input | `<Input type="time">` | `@/components/ui/input` |

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

```tsx
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';

<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent>                       {/* max-w-lg by default */}
    <DialogHeader>
      <DialogTitle>หัวข้อ</DialogTitle>
    </DialogHeader>
    {/* content */}
    <DialogFooter className="gap-2 sm:gap-2">
      <Button variant="outline" onClick={() => setOpen(false)}>ยกเลิก</Button>
      <Button onClick={handleSave}>บันทึก</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>

// Dialog ขนาดใหญ่ / scrollable
<DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
import { ThaiDatePicker } from '@/components/ui/thai-date-picker';

// value และ onChange ใช้ ISO string "YYYY-MM-DD" (CE)
<ThaiDatePicker
  value={form.date}           // "2025-01-15" หรือ ""
  onChange={(iso) => setForm(f => ({ ...f, date: iso }))}
  placeholder="เลือกวันที่"  // optional
/>
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
- **Domain**: perpos.io
- **PDF Service**: Google Cloud Run (`asia-southeast1`) — `perpos-pdf-renderer`
- **OCR Worker**: Google Cloud Run (`asia-southeast1`) — `perpos-ocr-worker`
- **STT Worker**: Google Cloud Run (`asia-southeast1`) — `perpos-stt-worker` · deploy ด้วย `--memory 2Gi --concurrency 3 --no-cpu-throttling` · secrets: `WORKER_SECRET`, `GEMINI_API_KEY`, `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` · env: `APP_BASE_URL=https://app.perpos.io` (**ต้องตั้ง** — แอปอยู่ที่ app.perpos.io ไม่ใช่ perpos.io ที่ default; ถ้าไม่ตั้ง callback mom-deliver จะ 404 → LINE ไม่ได้ PDF)
  - **ไฟล์ยาว = อัปไฟล์ทั้งก้อนเข้า Gemini Files API ตรง ๆ** (รองรับถึง 2GB / หลายชั่วโมง) — **ไม่ตัด/ไม่ใช้ ffmpeg** เพราะ Gemini เห็น global context ทั้งไฟล์ → สรุปคมกว่า. ผลลัพธ์เป็น **รายงานการประชุม (Minutes of Meeting)** JSON: meeting_title, executive_summary, key_topics, decisions (มติ), action_items, speakers (ผู้เข้าร่วม) — **ไม่มี transcript คำต่อคำ/timestamp** (เน้นสรุป → output เล็ก เร็ว ไม่ชน 64k output cap แม้ไฟล์ยาวหลายชั่วโมง) — ถ้าจะลดขนาด/เวลาอัปโหลด ให้บีบไฟล์เป็น .ogg/Opus จาก client
  - **`--no-cpu-throttling` บังคับ**: STT เป็นงาน async fire-and-forget ที่ใช้เวลา 30–90 วิหลังตอบ 202 — ถ้า CPU ถูก throttle หลังส่ง response (ค่า default ของ Cloud Run) background job จะค้างไม่จบ (job ค้าง `pending`/`processing`). ต่างจาก ocr-worker ที่งานสั้นจึงรอดด้วย default throttling
  - **GEMINI_API_KEY ต้องเป็น paid tier**: free tier — `gemini-2.5-pro` quota = 0 (ใช้ไม่ได้), `gemini-2.5-flash` มักโดน 503 high-demand. ต้องเปิด billing บน Google AI Studio / ใช้ Vertex AI
  - worker มี retry-with-backoff (429/500/503, 4 ครั้ง) + เปรียบเทียบ `WORKER_SECRET` แบบ `.trim()` (กัน secret ที่มี trailing newline ใน Secret Manager)
- **Cron**: Google Cloud Scheduler (`asia-southeast1`) → `POST https://perpos.io/api/assistant/scheduler`

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

| Layer | เทคโนโลยี | หน้าที่ |
|-------|-----------|---------|
| **Frontend + Core API** | Next.js + Supabase | UI, business logic, RLS, Trigger — พัฒนาไว ลีน ตอบสนองทันที |
| **Heavy Workers** | Google Cloud Run | งานหนัก (PDF, Payroll batch, AI analysis) — สเกลแยกอิสระ ไม่กวน Core |

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

| วิธี | แนะนำเมื่อ |
|------|-----------|
| **Google Cloud IAM (Invoke)** | Production — Supabase Webhook ใช้ Service Account ที่มี `roles/run.invoker` เท่านั้น |
| **Shared Secret Header** | Dev/Staging — Cloud Run ตรวจ `X-Worker-Secret` header ที่ตรงกับ env var `WORKER_SECRET` |

```typescript
// Cloud Run — ตรวจ secret ฝั่ง worker (ถ้าไม่ใช้ IAM)
const secret = req.headers.get('x-worker-secret');
if (secret !== process.env.WORKER_SECRET) {
  return new Response('Unauthorized', { status: 401 });
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

*   **ผลลัพธ์ของ Graph**: จะอยู่ในโฟลเดอร์ `graphify-out/` ประกอบด้วย `graph.json`, `GRAPH_REPORT.md` และ `graph.html` (สำหรับเปิดดูความสัมพันธ์เชิงแผนภาพบน browser)
*   **กฎการอัปเดต**: ทุกครั้งที่มีการสร้างโมดูลใหม่, ย้ายโครงสร้างโฟลเดอร์ หรืออัปเดตโค้ดครั้งใหญ่ **ต้องสั่งรันอัปเดต Graph เสมอ** เพื่อให้ฐานข้อมูลความรู้ของ Agent เป็นปัจจุบัน ด้วยคำสั่ง:
    ```bash
    .venv/bin/python3 -m graphify update .
    ```
    *(ไม่มีค่าใช้จ่าย API ของ LLM เนื่องจากเป็นการดึงโครงสร้างแบบ AST ท้องถิ่น)*

