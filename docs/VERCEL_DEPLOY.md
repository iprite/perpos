# Vercel Deploy — Runbook

> วิธี deploy ฝั่งเว็บ (Next.js) บน Vercel + กัน build ซ้อนกินโควต้า
> หมายเหตุ: **Cloud Run workers ไม่ได้อยู่บน Vercel** — deploy ด้วย `gcloud` มือ (ดู [AGENTS.md](../AGENTS.md) §Deployment)

---

## 1. Vercel project ที่ผูก repo

| Vercel project | Root Directory | package name | คือ                     |
| -------------- | -------------- | ------------ | ----------------------- |
| **perpos**     | `apps/perpos`  | `starter`    | แอปหลัก (app.perpos.ai) |

auto-deploy เมื่อ push → main (production) และสร้าง Preview ทุก PR

> **landing ย้ายออกจาก Vercel แล้ว** — หน้า marketing (`www.perpos.ai`/perpos.ai) ตอนนี้คือ
> `apps/landing-astro` (Astro) บน **Cloudflare** (auto-deploy ผ่าน Cloudflare Git integration)
> ไม่ใช่ Vercel project แล้ว · ดู [`project-landing-astro-cloudflare`] / AGENTS.md

---

## 2. ปัญหา: ทุก push build **ทั้ง 2** project (เปลือง → ชน Hobby limit)

เพราะ 2 project ผูก repo เดียว แม้แก้แค่ `apps/perpos` ก็ build `perpos-landing` ด้วยเสมอ
= build เป็น 2 เท่า + แม้แก้แค่ `.github/`, `services/`, `docs/` ก็ยัง build → กิน build quota ฟรี

## 3. แก้: Ignored Build Step ด้วย `turbo-ignore` (per project)

ตั้งที่ **Vercel Dashboard → [project] → Settings → Git → Ignored Build Step → "Run my command"**

| project  | คำสั่ง                     |
| -------- | -------------------------- |
| `perpos` | `npx turbo-ignore starter` |

`turbo-ignore` เช็ค git diff ตั้งแต่ deploy ล่าสุด ว่า workspace นั้น **+ dependency** เปลี่ยนไหม

- ไม่เปลี่ยน → exit 0 → Vercel **skip build** (ไม่กินโควต้า)
- เปลี่ยน → build ตามปกติ

> เป็น **dashboard setting** — ไม่มี key ใน `vercel.json` ตั้งผ่านโค้ดไม่ได้

## 4. ผลลัพธ์

| เปลี่ยนอะไร                                   | perpos   |
| --------------------------------------------- | -------- |
| `apps/perpos/**`                              | ✅ build |
| `packages/*` (shared)                         | ✅ build |
| `.github/`, `services/`, `docs/`, root config | skip     |

## 5. ตรวจว่าได้ผล

push แก้เฉพาะไฟล์ใน `services/` หรือ `.github/` → Vercel ต้องขึ้น **"Build skipped"** ทั้ง 2 project
(ถ้ายัง build = Ignored Build Step ยังไม่ถูกตั้ง หรือ Root Directory ผิด)

---

## 6. Env vars (ตั้งที่ Vercel → Settings → Environment Variables, scope Production)

ของ **perpos** ที่สำคัญ (นอกจาก Supabase/LINE/Stripe ฯลฯ):

- `NEXT_PUBLIC_SENTRY_DSN` — เปิด Sentry (ไม่ใส่ = Sentry no-op)
- `ALERT_WEBHOOK_SECRET` — เปิด endpoint `/api/admin/alerts/{sentry,uptime}`
- `SENTRY_ORG` / `SENTRY_PROJECT` / `SENTRY_AUTH_TOKEN` — optional (upload source map)

ตั้ง/แก้ env แล้วต้อง **redeploy** ถึงจะมีผล

---

## เกี่ยวข้อง

- workers deploy (Cloud Run, gcloud มือ) — [AGENTS.md](../AGENTS.md) §Deployment
- CI gate (lint/typecheck/workers build) — `.github/workflows/ci.yml`
