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
│   └── pdf-renderer/               # Next.js PDF microservice (Cloud Run, port 8080)
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

# Type check
cd apps/perpos && pnpm exec tsc --noEmit
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
- **PDF Service**: Google Cloud Run (`asia-southeast1`)
- **Cron**: Google Cloud Scheduler (`asia-southeast1`) → `POST https://perpos.io/api/assistant/scheduler`
