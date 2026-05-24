# PERPOS Payments (Stripe) — คัมภีร์

> เป้าหมาย: ให้องค์กร (บริษัทลูกค้า) ชำระค่าบริการ PERPOS ผ่าน Stripe แบบตัดบัตรอัตโนมัติรายเดือน โดย “ราคา/เงื่อนไข” ถูกกำหนดโดย super admin แบบรายองค์กร (negotiated pricing) ไม่จำเป็นต้องเท่ากันทุกบริษัท

---

## 1) ขอบเขตและหลักการ

### 1.1 สิ่งที่ต้องทำ (MVP)
- องค์กรหนึ่งมี subscription หนึ่งรายการ (1 org = 1 subscription)
- owner/admin ขององค์กรสามารถ:
  - ดูสถานะ billing ขององค์กร
  - ตั้งค่าการชำระเงินครั้งแรก (ใส่บัตร) เพื่อให้ Stripe ตัดรายเดือนอัตโนมัติ
  - เข้า Customer Portal เพื่อเปลี่ยนบัตร/ดูใบเสร็จ/ยกเลิก (ถ้าอนุญาต)
- super admin สามารถ:
  - กำหนด `monthly_price`, `currency`, `plan_tier` ต่อองค์กรแบบ manual
  - กำหนดสถานะการให้บริการ (เช่น active/overdue/cancelled) จากผล webhook ของ Stripe

### 1.2 สิ่งที่ยังไม่ทำใน MVP (ไว้ Phase ถัดไป)
- VAT/ใบกำกับภาษีเต็มรูปแบบ (ออกเอกสารภาษีไทย, เลขผู้เสียภาษี)
- หลายแพ็กเกจต่อ 1 องค์กร (add-ons, seat-based, metered usage)
- Proration ซับซ้อน (อัปเกรดกลางรอบ + คำนวณส่วนต่าง)
- การชำระเงินแบบโอน/QR (non-card)

---

## 2) สถานะปัจจุบันในระบบ (Existing)

### 2.1 ตาราง `org_billing` (มีอยู่แล้ว)
ระบบมี `org_billing` เป็นแหล่ง truth สำหรับ plan/limit และมี field ที่รองรับ “ราคาแบบต่อรอง” แล้ว:
- `plan_tier` (free/starter/pro/enterprise)
- `monthly_price` (numeric)
- `currency` (default THB)
- `payment_status` (active/overdue/cancelled/pending)

อ้างอิง migration:
- [20260523180000_org_billing.sql](file:///Users/iprite/perpos/supabase/migrations/20260523180000_org_billing.sql)
- [20260524000000_billing_pricing_fields.sql](file:///Users/iprite/perpos/supabase/migrations/20260524000000_billing_pricing_fields.sql)

มี API สำหรับอ่าน/แก้ไขแล้ว:
- org view: [org/billing route](file:///Users/iprite/perpos/apps/perpos/src/app/api/org/billing/route.ts)
- admin manage: [admin/billing route](file:///Users/iprite/perpos/apps/perpos/src/app/api/admin/billing/route.ts)

### 2.2 หลักคิด
- `org_billing` = สถานะการให้บริการ + ข้อจำกัดการใช้งาน (plan/limits)
- Stripe = ระบบ “เก็บเงิน” และเป็นแหล่ง truth สำหรับ “payment outcome”
- Webhook จะเป็นตัว sync ผลการชำระเงินจาก Stripe → `org_billing.payment_status` และข้อมูล Stripe mapping

---

## 3) แนวทาง Stripe ที่เลือกใช้

### 3.1 เลือก Stripe Billing (Subscriptions)
ใช้ Stripe Subscriptions เพื่อให้ตัดเงินอัตโนมัติรายเดือนโดยไม่ต้องทำ cron ออก invoice เอง

### 3.2 ทำไมต้องมี “ราคาแบบต่อองค์กร”
เพราะ super admin กำหนดค่าบริการแบบ manual ต่อองค์กร (negotiated pricing) จึงไม่เหมาะกับ price เดียวสำหรับทุกคน

แนวทางที่ใช้ได้:
- A) สร้าง Stripe Price ต่อองค์กร (recommended สำหรับ MVP)
  - subscription จะอ้างอิง price id ขององค์กรนั้น
  - ถ้าเปลี่ยนราคา → สร้าง price ใหม่ แล้ว update subscription item ให้ชี้ price ใหม่ (proration = none หรือ choose)
- B) ไม่สร้าง price ต่อองค์กร แต่สร้าง invoice item รายเดือนเอง (ต้องมี scheduler และ handling มากขึ้น)

MVP แนะนำ A เพราะตรงกับ recurring และง่ายต่อการดูแลผ่าน Stripe UI

---

## 4) Data Model ที่ต้องเพิ่ม (Supabase)

> หมายเหตุ: รายละเอียดนี้เป็น design; ยังไม่ลง migration จนกว่าจะเริ่มทำ code

### 4.1 ตาราง mapping ระหว่าง Org ↔ Stripe
เพิ่มตารางใหม่ (แยกจาก `org_billing` เพื่อลดความปะปนของ concerns)

**Table: `org_stripe`**
- `org_id uuid primary key references organizations(id) on delete cascade`
- `stripe_customer_id text unique`
- `stripe_subscription_id text unique`
- `stripe_price_id text` (ถ้าใช้แนวทางสร้าง price ต่อ org)
- `subscription_status text` (mirror จาก Stripe เช่น active, past_due, canceled, incomplete)
- `current_period_start timestamptz`
- `current_period_end timestamptz`
- `cancel_at_period_end boolean`
- `updated_at timestamptz default now()`

RLS:
- SELECT: org owner/admin อ่านได้
- INSERT/UPDATE/DELETE: ปิดสำหรับ client ทั้งหมด (ทำผ่าน server-only + service role)

### 4.2 ตาราง events (optional แต่แนะนำ)
เพื่อ idempotency และ debugging

**Table: `stripe_events`**
- `id text primary key` (stripe event id)
- `type text`
- `org_id uuid null`
- `created_at timestamptz`
- `payload jsonb`

ใช้เพื่อกัน webhook ซ้ำ: ถ้า event id เคยถูกประมวลผลแล้วให้ skip

---

## 5) Payment Flow (Owner)

### 5.1 เงื่อนไขก่อนชำระเงิน
- org ต้องมี `org_billing.monthly_price` ไม่เป็น null และมากกว่า 0
- ผู้ใช้งานต้องเป็น `organization_members.role in ('owner','admin')`

### 5.2 ขั้นตอน Setup การชำระเงินครั้งแรก
1) Owner ไปหน้า Billing ในแอป (บน `app.perpos.io`)
2) กด “เริ่มชำระเงิน/เพิ่มบัตร”
3) Server สร้าง Stripe Customer (ถ้ายังไม่มี) แล้วสร้าง Checkout Session แบบ `mode=subscription`
4) Redirect ไป Stripe Checkout
5) สำเร็จ → Stripe ยิง webhook `checkout.session.completed`
6) ระบบบันทึก `org_stripe.{customer_id, subscription_id}` และตั้ง `org_billing.payment_status='pending'` หรือ `active` ตามสถานะ invoice
7) รอบถัดไป Stripe จะตัดอัตโนมัติ และยิง webhook `invoice.payment_succeeded` ทุกเดือน

### 5.3 การจัดการบัตร/ใบเสร็จ
ใช้ Stripe Customer Portal:
- Owner กด “จัดการการชำระเงิน” → สร้าง portal session → redirect

---

## 6) Admin Flow (Super Admin)

### 6.1 การกำหนดราคา (Negotiated)
super admin กำหนดใน `org_billing`:
- `plan_tier`
- `monthly_price`
- `currency`

แนวคิดสำคัญ:
- ราคาใน `org_billing` คือ “ราคาที่ควรจะเป็น” (source of truth ฝั่งธุรกิจ)
- ราคาใน Stripe จะต้อง sync ให้ตรงกับ `org_billing` โดยมีกติกา:
  - ถ้า org ยังไม่มี subscription → ใช้ราคาใหม่ในการสร้าง checkout session
  - ถ้า org มี subscription แล้วและราคาเปลี่ยน → admin endpoint ทำการ “เปลี่ยน price ของ subscription” (แล้วเลือก proration behavior)

### 6.2 การหยุดให้บริการ
เมื่อ `payment_status` เป็น overdue/cancelled:
- (Phase MVP) แค่แสดง banner + จำกัดบาง action
- (Phase ถัดไป) enforce ที่ server: ถ้า plan expired → block module ที่ต้องจ่าย

---

## 7) API Endpoints ที่จะเพิ่ม (Next.js Route Handlers)

> ยึดแนวคิด “API อยู่ใน `apps/perpos/src/app/api/*` เท่านั้น”

### 7.1 Org endpoints
- `POST /api/org/billing/checkout`
  - input: `{ orgId }`
  - output: `{ url }` (Stripe Checkout URL)
- `POST /api/org/billing/portal`
  - input: `{ orgId }`
  - output: `{ url }` (Stripe Portal URL)

### 7.2 Stripe webhook
- `POST /api/stripe/webhook`
  - verify signature ด้วย `STRIPE_WEBHOOK_SECRET`
  - process events แบบ idempotent (อาศัย `stripe_events`)

### 7.3 Admin sync (optional)
- `POST /api/admin/billing/sync-stripe`
  - ใช้ตอน super admin เปลี่ยนราคา แล้วต้องการ push ไป Stripe (update subscription/price)

---

## 8) Webhook Events ที่ต้องรองรับ

ขั้นต่ำที่ควรทำ:
- `checkout.session.completed`
  - map org ผ่าน `client_reference_id` หรือ `metadata.org_id`
  - เก็บ `customer`, `subscription`
- `invoice.payment_succeeded`
  - set `org_billing.payment_status='active'`
  - update `org_stripe.current_period_end`
- `invoice.payment_failed`
  - set `org_billing.payment_status='overdue'` (หรือ past_due)
- `customer.subscription.updated`
  - sync `subscription_status`, `cancel_at_period_end`, period dates
- `customer.subscription.deleted`
  - set `org_billing.payment_status='cancelled'`

กติกา mapping org:
- ทุก object ที่สร้างจากระบบต้องแนบ `metadata.org_id=<uuid>`
- ทุก webhook ต้อง verify และต้องเชื่อ org จาก metadata เท่านั้น (ไม่รับ org จาก client)

---

## 9) Security / Compliance

### 9.1 Secrets / Env
ต้องเพิ่ม env ฝั่ง server:
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRODUCT_ID` (optional แต่แนะนำเพื่อจัดกลุ่ม price)
- `STRIPE_PORTAL_CONFIGURATION_ID` (บังคับสำหรับปิดการยกเลิก subscription ใน portal)
- `APP_BASE_URL` (เช่น https://app.perpos.io) สำหรับ return URL

### 9.2 ไม่เก็บข้อมูลบัตรในระบบ
- ใช้ Stripe Checkout/Portal เท่านั้น
- ระบบเก็บแค่ ids และสถานะ

### 9.3 RLS / Permission
- Owner/admin ของ org เท่านั้นที่เรียก checkout/portal ได้
- Webhook endpoint เปิดสาธารณะ แต่ต้อง verify signature ทุกครั้ง

---

## 10) Operational Notes

### 10.1 โหมดทดสอบและโปรดักชัน
- ใช้ Stripe Test mode สำหรับ dev
- แยก webhook secret ตาม environment

### 10.2 Idempotency
- Store `stripe event id` ใน `stripe_events`
- ถ้า event id เคยประมวลผลแล้ว → return 200 ทันที

---

## 11) Decisions ที่ต้องคอนเฟิร์มก่อนเริ่มทำโค้ด

ตัดสินใจแล้ว:
1) Owner ยกเลิก subscription เองไม่ได้ ต้องติดต่อ admin เท่านั้น
2) ค้างชำระ (overdue/past_due) ให้ระบบเข้าโหมด read-only สำหรับองค์กรนั้น
3) เปลี่ยนราคาให้มีผล “รอบถัดไป” เท่านั้น (no proration)
4) รองรับ THB อย่างเดียว

ผลกระทบที่ต้องทำตาม:
- Stripe Customer Portal: ปิดการยกเลิก subscription โดยลูกค้า (อนุญาตเฉพาะอัปเดตวิธีชำระเงิน/ดูใบเสร็จ)
- Enforcement: เพิ่ม guard ฝั่ง server ให้เขียนข้อมูลไม่ได้เมื่อ `org_billing.payment_status = 'overdue'` (แต่ยังอ่านได้)
- Admin price change: เวลาอัปเดตราคาให้ set proration behavior เป็น none และใช้ราคาใหม่ในรอบถัดไป
