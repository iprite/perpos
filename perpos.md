# PERPOS System Overview & Architecture (คัมภีร์ระบบ PERPOS)

**PERPOS** เป็นแพลตฟอร์ม ERP และระบบบัญชีระดับพรีเมียมสำหรับธุรกิจ SME ในประเทศไทย ที่มาพร้อมกับระบบช่วยเหลืออัจฉริยะ (LINE Bot Assistant) โดยออกแบบบนสถาปัตยกรรมยุคใหม่ที่เน้นความยืดหยุ่น ความปลอดภัย และประสิทธิภาพสูงสุด

---

## 1. PERPOS คืออะไร? (What is PERPOS?)

PERPOS ไม่ใช่ระบบ SaaS (Software as a Service) สำเร็จรูปทั่วไป แต่เป็น **ERP Platform (Bespoke ERP Platform)** สำหรับการพัฒนาและสร้าง Custom ERP ให้กับแต่ละองค์กรที่ว่าจ้าง โดยที่ทุกลูกค้าจะได้รับการแยกข้อมูลและการปรับแต่งระบบอย่างเป็นอิสระ แต่รันอยู่บนโครงสร้างพื้นฐานร่วมกัน (Shared Infrastructure)

```
ลูกค้า A (TMC) ──┐
ลูกค้า B         ├──► PERPOS Platform ──► Custom ERP เฉพาะตัวของแต่ละองค์กร
ลูกค้า C         │         │
...         ─────┘    Shared Infrastructure & Codebase
```

### สิ่งที่ลูกค้าจะได้รับ:
* **Custom Subdomain/URL Path เฉพาะตัว**: ผู้ใช้งานของแต่ละองค์กรจะเข้าใช้งานระบบผ่าน URL path ของตัวเอง เช่น `perpos.ai/<org-slug>/`
* **การแยกข้อมูลโดยเด็ดขาด (Data Isolation)**: มีความปลอดภัยสูง ข้อมูลของแต่ละองค์กรถูกกั้นด้วย Row-Level Security (RLS) ทำให้ไม่สามารถมองเห็นข้อมูลขององค์กรอื่นได้
* **การปรับแต่งโมดูลเฉพาะธุรกิจ (Specific Module)**: รองรับการพัฒนาฟังก์ชันการทำงานเฉพาะสำหรับประเภทธุรกิจนั้นๆ (เช่น TMC Module สำหรับธุรกิจบริหารห้องพัก คลังสินค้า และการท่องเที่ยว)
* **โมดูลมาตรฐานที่พร้อมใช้งาน (Shared Modules)**: สามารถเปิด/ปิดใช้งานโมดูลระบบบัญชีการเงิน (Accounting), ระบบเงินเดือนพนักงาน (Payroll) และระบบผู้ช่วยอัจฉริยะ (Assistant - LINE Bot) ได้ตามความต้องการ

### สิ่งที่เป็นจุดเด่นทางวิศวกรรมของ PERPOS:
* **Single Codebase, Single Database Cluster**: พัฒนาและบำรุงรักษาง่าย ประหยัดค่าใช้จ่ายในการดำเนินงาน (Operational Cost)
* **High Reusability**: โมดูลหรือความสามารถใหม่ที่สร้างขึ้นให้ลูกค้าคนหนึ่ง สามารถนำมาปรับใช้เป็น Shared Module เพื่อเปิดใช้กับลูกค้ารายอื่นในอนาคตได้ง่าย

---

## 2. เทคโนโลยีและสถาปัตยกรรม (Technology & Architecture)

PERPOS พัฒนาขึ้นด้วยเทคโนโลยีที่ทันสมัยในรูปแบบ **Monorepo** โดยใช้เครื่องมือจัดการแพ็คเกจ `pnpm workspaces` และระบบจัดการบิลด์แบบ `Turbo`

### Technology Stack
* **Frontend & BFF Backend**: Next.js 15 (App Router), React 19, และ TypeScript
* **Database**: Supabase (PostgreSQL) พร้อมสถาปัตยกรรม Row-Level Security (RLS) และระบบ Authentication
* **UI Design System**: Rizzui, Tailwind CSS, Radix UI และกลุ่ม Component สำเร็จรูปใน `@/components/ui/`
* **Heavy Workers**: Google Cloud Run (สำหรับประมวลผลงานหนัก เช่น PDF Rendering, AI analysis)
* **Cron / Scheduler**: Google Cloud Scheduler (สำหรับเรียก Cron trigger)

### สถาปัตยกรรม BFF + Serverless Workers
เพื่อหลีกเลี่ยงปัญหา Next.js API Routes ค้างหรือหมดเวลาทำงาน (Timeout) และปัญหาการใช้หน่วยความจำสูง (RAM usage) จากการทำงานหนัก PERPOS จึงเลือกใช้สถาปัตยกรรม **"BFF (Backend for Frontend) + Serverless Workers"**

```
1. [Next.js BFF] User สั่งงาน ──► INSERT row ใน job_queues (status = 'pending')
                                  │ (ตอบกลับ User ทันที ไม่ต้องรอทำงานเสร็จ)
                                  ▼
2. [Supabase Webhook] ──────────► HTTP POST ──► [Cloud Run Worker] (ทำงานหนัก)
                                                   │
                                                   ▼
3. [Supabase Realtime] ◄──────── UPDATE status ◄───┘ (อัปเดตผลลัพธ์ลง DB)
   (ปุ่มดาวน์โหลด/สถานะอัปเดตบนหน้าจอทันที)
```

* ** Next.js Core API**: ทำหน้าที่เสมือน BFF คอยจัดการ UI, Business Logic ทั่วไป, ตรวจสอบสิทธิ์ (RLS), และส่งต่องานหนักเข้าสู่คิว
* **Serverless Workers (Google Cloud Run)**: ทำหน้าที่ประมวลผลงานหนัก (เช่น การสร้างไฟล์ PDF หรือคำนวณเงินเดือนรายเดือนของพนักงานจำนวนมาก) ตัว Worker จะตื่นมาทำงานเมื่อมีทริกเกอร์และสเกลลงเหลือ 0 ทันทีเมื่อไม่มีงาน ทำให้ประหยัดค่าใช้จ่ายและปลอดภัยสูง
* **Database-Driven Job Queue**: ใช้ตาราง `job_queues` ใน Supabase เป็นตัวแจกจ่ายงาน เมื่อเกิดข้อมูลใหม่ Supabase Webhook จะส่ง HTTP POST ไปยัง Cloud Run พร้อมแนบตัวระบุผู้สั่งงาน (`triggered_by` และ `correlation_id`) เพื่อใช้ในการบันทึก Audit Log เสมอ

---

## 3. หลักการทำงานสำคัญของระบบ (Core Working Principles)

### 3.1 การแยกข้อมูลลูกค้า (Tenant Isolation & Security)
PERPOS ให้ความสำคัญกับความปลอดภัยของข้อมูลเป็นอันดับหนึ่ง โดยมีแนวทางปฏิบัติดังนี้:
* **การใช้ Row-Level Security (RLS)**: ทุกตารางในฐานข้อมูลจะต้องมีคอลัมน์ระบุบริษัท เช่น `org_id` (สำหรับโมดูลใหม่/TMC) หรือ `organization_id` (สำหรับโมดูลระบบ Core เดิม) และมีการบังคับใช้ `ALTER TABLE ENABLE ROW LEVEL SECURITY`
* **ฟังก์ชันช่วยในการตรวจสอบสิทธิ์ (RLS Helper Functions)**:
  * `is_org_member(org_id, user_id)`: ตรวจสอบว่าผู้ใช้คนดังกล่าวเป็นสมาชิกของบริษัทหรือไม่
  * `is_org_admin(org_id, user_id)`: ตรวจสอบว่าผู้ใช้มีบทบาทเป็น Admin หรือ Owner หรือไม่
* **การป้องกันความลับรั่วไหลใน API**:
  * API routes ทั้งหมดจะใช้งาน `createAuthedClient(accessToken)` เป็นหลักเพื่อบังคับใช้ RLS จากตัวตนของผู้อยู่ใน Session เสมอ
  * ห้ามนำ `SUPABASE_SERVICE_ROLE_KEY` หรือ Admin Client ไปใช้ในฝั่ง Client-side หรือ API route ทั่วไปโดยไม่จำเป็น หากมีความจำเป็นต้องใช้ (เช่น Scheduled jobs หรือระบบโอนย้ายข้อมูล) จะต้องผ่านฟังก์ชันคัดกรอง เช่น `requireTmcMember()` เพื่อตรวจสอบความสัมพันธ์ระหว่างผู้ใช้กับองค์กรก่อนเสมอ และต้องระบุตัวกรอง `.eq('org_id', orgId)` ในคำสั่ง Query ทุกครั้ง

### 3.2 ระบบประวัติและการตรวจสอบที่ปฏิเสธไม่ได้ (Immutable Audit Log)
การทำธุรกรรมในระบบ ERP จำเป็นต้องมีประวัติการทำรายการที่โปร่งใสและตรวจสอบความถูกต้องย้อนหลังได้ PERPOS จึงออกแบบระบบ **Hybrid 3-Layer Audit Trail** ขึ้นมา:

```
[ Next.js API Route ]
  └── setAuditContext(req, userId, orgId) 
        └── (กำหนดค่า IP Address, User Agent และ Request ID ลงใน Session GUC)
              │
              ▼
[ PostgreSQL Database ]
  └── AFTER INSERT/UPDATE/DELETE trigger
        └── fn_audit_log_changes()
              ├── (อ่านค่าจาก Session GUC และ Row Fallback)
              ├── payload_hash = SHA-256(canonical JSON)
              ├── chain_hash = SHA-256(prev_chain_hash + payload_hash)
              └── INSERT INTO audit_logs (FORCE RLS / ห้ามแก้ไข)
```

1. **DB Trigger (Layer 1)**: ใช้ SQL function `fn_audit_log_changes()` คอยจับตาดูการเปลี่ยนแปลงของข้อมูลในตารางสำคัญ
2. **Blockchain-Style Chaining (Layer 2)**: บันทึกข้อมูลแบบอ้างอิงแฮชถัดๆ กันไปผ่านคอลัมน์ `payload_hash` และ `chain_hash` ทำให้หากมีใครแอบแก้ไขข้อมูลประวัติในอดีต (เช่น ในตาราง `audit_logs`) ตัวต่อของแฮชในแถวปัจจุบันและแถวหลังจากนั้นจะพังทันที (`verify_audit_chain` จะส่งค่า `ok = false`)
3. **External Log Shipping (Layer 3)**: มีระบบ Cron จ๊อบช่วยดึงประวัติการทำรายการล่าสุดส่งออกไปบันทึกไว้ในแหล่งภายนอก เช่น Axiom หรือ S3 Object Lock (WORM) เพื่อป้องกับการลบทำลายฐานข้อมูลทั้งหมด

### 3.3 การป้องกันธุรกรรมซ้ำซ้อน (Idempotency Engine)
เพื่อป้องกันไม่ให้ผู้ใช้งานกดปุ่มบันทึกซ้ำๆ (Double Action) ซึ่งอาจก่อให้เกิดปัญหาการลงบัญชีการเงินเบิ้ล หรือการบันทึกสต๊อกผิดพลาด PERPOS มีระบบตรวจสอบ **Idempotency Key**:
* ในคำสั่งส่งข้อมูลประเภท POST ที่มีความสำคัญสูง (เช่น การบันทึกรายรับ-รายจ่าย หรือการตัดสต๊อก) Client จะส่ง HTTP Header ชื่อ `Idempotency-Key` (UUID v4) แนบมาด้วย
* ระบบจะทำการแฮช Request Body และตรวจสอบในตาราง `idempotency_keys` หากพบว่าคีย์นี้และผู้ใช้รายนี้เพิ่งส่งเข้ามาและสำเร็จไปแล้ว ระบบจะดึงเอาผลลัพธ์เดิมที่ Cache ไว้ส่งกลับให้ทันทีโดยไม่ประมวลผลซ้ำ
* หากส่งคีย์เดิมเข้ามาแต่ข้อมูลด้านในเปลี่ยนไป ระบบจะตอบกลับด้วย `ERR_IDEMPOTENCY_MISMATCH` (HTTP 409) เพื่อป้องกันความสับสน

### 3.4 มาตรฐานการจัดการข้อผิดพลาด (Error Handling & API Envelope)
API ทุกเส้นของ PERPOS จะต้องตอบกลับในรูปแบบ Envelope มาตรฐานเดียวกัน:
* **กรณีสำเร็จ**: `{ ok: true, data: { ... } }`
* **กรณีผิดพลาด**: `{ ok: false, error: { code: 'ERR_...', message: '...' } }`
* **Global Error Codes**: ใช้สัญลักษณ์แบบตัวพิมพ์ใหญ่ทั้งหมดแยกตามประเภท เช่น `ERR_UNAUTHORIZED_TENANT` (ไม่มีสิทธิ์เข้าถึงองค์กรนี้), `ERR_PERIOD_CLOSED` (งวดบัญชีปิดแล้ว), `ERR_INSUFFICIENT_STOCK` (สินค้าในคลังไม่พอ) เพื่อให้ง่ายต่อการนำรหัสเหล่านี้ไปประยุกต์แสดงผลข้อความในหน้าจอบริการ (Frontend)

---

## 4. ความสามารถของระบบ (Core Capabilities & Features)

PERPOS ถูกสร้างขึ้นพร้อมกับโมดูลมาตรฐานระดับพรีเมียม (Shared Modules) และโครงสร้างสำหรับการปรับแต่งโมดูลส่วนต่อขยาย (Specific Modules) ดังนี้:

### 4.1 ระบบผู้ช่วยอัจฉริยะ (LINE Bot Assistant)
ผู้ช่วยอัจฉริยะของ PERPOS เป็นช่องทางการสื่อสารและการป้อนข้อมูลระดับพรีเมียมผ่านแอปพลิเคชัน LINE ที่ออกแบบเพื่อความคล่องตัวของธุรกิจ SME ในไทย โดยควบคุมผ่านการพิมพ์คำสั่งที่ขึ้นต้นด้วยเครื่องหมาย `/` เสมอ (เช่น `/ข่าว`, `/รายรับ 350 ขายกาแฟ`, `/t บันทึกนัดลูกค้าวันพรุ่งนี้`)

#### คุณลักษณะสำคัญของ LINE Bot:
* **LINE Flex Card as Default**: ทุกข้อความตอบกลับหลัก (Main Response) จะต้องแสดงผลด้วย **Flex Card** ที่มีความสวยงาม ดูทันสมัยและน่าเชื่อถือ หลีกเลี่ยงการตอบกลับเป็น Plain Text ธรรมดา
* **Curated Color Palettes**: มีการคัดสรรรหัสสีเฉพาะสำหรับการแสดงสถานะต่างๆ (เช่น สีเขียว `#059669` สำหรับสต๊อกปกติ, สีส้ม `#D97706` สำหรับการแจ้งเตือน, สีแดง `#DC2626` สำหรับของหมดคลัง)
* **NLP Task Parser**: รองรับการนำภาษาธรรมชาติ (Natural Language) มาทำการวิเคราะห์แปลผลเป็นคำสั่ง/บันทึกงานโดยใช้ปัญญาประดิษฐ์ (OpenAI, *ถ้าเปิดใช้งาน*)

```
คำสั่งเด่นใน LINE Bot:
├── /link <token>              - ผูกบัญชี LINE เข้ากับ User Profile
├── /รายรับ /รายจ่าย            - บันทึกธุรกรรมการเงินเข้าบัญชีทันที
├── /ข่าว /สรุปล่าสุด            - สรุปข่าวสารธุรกิจจาก RSS Feed (ด้วย AI)
├── /นัด /วันนี้ /ap            - จัดการและเรียกดูตารางนัดหมาย
└── /t /tk /d                  - จัดการ Task (บันทึก, เรียกดู, และปิดงาน)
```

### 4.2 ระบบจัดการโมดูลบัญชีและการเงิน (Accounting & Finance)
* **Chart of Accounts (ผังบัญชี)**: จัดการประเภทสินทรัพย์ หนี้สิน ทุน รายได้ และค่าใช้จ่ายของแต่ละองค์กร
* **Journal Entry (สมุดรายวัน)**: บันทึกรายการบัญชีเดบิตและเครดิตที่ผ่านการตรวจสอบสมดุล (Journal Imbalanced Verification)
* **Sales / Purchase Documents**: ออกใบเสนอราคา (Quotes), ใบแจ้งหนี้ (Invoices), ใบเสร็จรับเงิน (Receipts) และใบสั่งซื้อ (Purchase Orders)
* **Financial Reporting & Taxes**: รายงานภาษีมูลค่าเพิ่ม (VAT), ภาษีหัก ณ ที่จ่าย (Withholding Tax) และระบบออกรายงาน PDF ผ่าน Microservice

### 4.3 ระบบจัดการพนักงานและเงินเดือน (Payroll)
* **Employee Management (พนักงาน)**: เก็บข้อมูลและสิทธิ์การเข้าใช้งานภายในองค์กร
* **Payroll Calculation**: คำนวณรายรับ รายจ่าย ค่าล่วงเวลา (OT) ภาษีหัก ณ ที่จ่าย และเงินสมทบประกันสังคมรายบุคคล
* **Payslip Generation**: สร้างสลิปเงินเดือนรูปแบบไฟล์ PDF และส่งออกข้อมูลการทำรายการอย่างปลอดภัย

### 4.4 ระบบควบคุมสำหรับผู้ดูแลระบบ (Super Admin Console)
Super Admin ใน PERPOS เปรียบเสมือน **Orchestrator** คอยดูแลและควบคุมสถาปัตยกรรมของทุก Tenant จากที่เดียว:
* **Tenant Onboarding Wizard**: UI สำหรับสร้างองค์กรใหม่, กำหนด slug หน้าเว็บ, เลือกโมดูลตั้งต้น และส่งคำเชิญให้ผู้ถือสิทธิ์ (Owner) ได้ภายในหน้าเดียว
* **Module Provisioning**: เปิด/ปิดการใช้งาน Shared/Specific Module ของแต่ละองค์กร และกำหนดบทบาทผู้ใช้งานที่ได้รับอนุญาตให้ใช้เมนูดังกล่าวได้ทันที พร้อมเก็บประวัติการเปิด-ปิดอย่างเป็นระบบ
* **Impersonation Tool (เครื่องมือสวมรอย)**: ช่วยให้ Super Admin สามารถเข้าสู่หน้าจอของลูกค้าเพื่อช่วยตรวจสอบหน้าจอและแก้ไขปัญหาเชิงลึกได้ โดยมีระบบรักษาความปลอดภัยบังคับแสดงแถบสีแดงขนาดใหญ่ด้านบนศีรษะหน้าจอ และจะบันทึกรอยเท้าของผู้ใช้งาน (Actor ID = Super Admin, Target User ID = ลูกค้า) ลงในระบบ Audit Trail อย่างชัดเจนทุกขั้นตอน
* **Tenant Resource Monitor**: คอนโซลคอยเฝ้าระวังความเร็วในการประมวลผล (Duration) และปริมาณการขอใช้งาน (Requests Per Minute) ของแต่ละองค์กร เพื่อตรวจหาสภาวะ "Noisy Neighbor" (ลูกค้าองค์กรหนึ่งทำงานหนักมากจนไปดึงทรัพยากรของเครื่องแม่ข่ายทำให้องค์กรอื่นช้าลง)
* **Custom Fields Manager**: เครื่องมือเพิ่มฟิลด์ป้อนข้อมูลแบบพลวัตให้กับแต่ละองค์กรโดยไม่ต้องรันคำสั่ง Migration ปรับฐานข้อมูลจริง (อาศัยแนวทาง EAV-lite เก็บค่าลงในคอลัมน์ JSONB ชื่อ `custom_properties`)
* **Label Override Manager**: ปรับแต่งคำศัพท์ภาษาไทย-อังกฤษที่แสดงในระบบเมนูให้เข้ากับแต่ละองค์กร (เช่น เปลี่ยนคำว่า "รายรับ" เป็น "ค่าเช่า" ในระบบของ TMC)

---

## 5. โครงสร้างซอร์สโค้ด (Monorepo Directory Structure)

ซอร์สโค้ดของระบบจัดสรรโครงสร้างอย่างเป็นระบบตามแนวทางของ Next.js 15 Monorepo:

```
perpos/
├── apps/perpos/                    # Next.js Application (Frontend + BFF APIs)
│   └── src/
│       ├── app/
│       │   ├── (auth)/             # ระบบลงชื่อเข้าใช้งาน
│       │   ├── (hydrogen)/         # ส่วนการแสดงผลหลักของ ERP (ต้องล็อกอิน)
│       │   │     └── [orgSlug]/    # Dynamic routing สำหรับแยกหน้าการทำงานแต่ละบริษัท
│       │   └── api/                # API Route Handlers (Next.js BFF)
│       │         ├── _lib/         # Auth helpers (requireUser, requireAdmin, etc.)
│       │         ├── line/         # LINE Bot Webhooks & Link Token
│       │         ├── assistant/    # AI Task scheduler (cron)
│       │         ├── admin/        # ระบบควบคุมหลังบ้านของ Super Admin
│       │         └── org/          # บริหารจัดการคำเชิญพนักงานภายในองค์กร
│       ├── components/             # Component การแสดงผลหน้าจอ
│       │     └── ui/               # Design System component พื้นฐาน (ปุ่ม, ฟอร์ม)
│       └── lib/                    # ฟังก์ชันช่วยเหลือ, Supabase Clients, actions
├── packages/
│   ├── config-tailwind/            # การกำหนดค่า Tailwind CSS ส่วนกลาง
│   ├── config-typescript/          # การกำหนดค่า TypeScript สำหรับทั้งโปรเจกต์
│   └── isomorphic-core/            # Component หรือโค้ดส่วนกลางที่ใช้ร่วมกันได้
├── services/
│   └── pdf-renderer/               # Microservice สำหรับจัดการไฟล์ PDF (ใช้ Puppeteer)
└── supabase/
    └── migrations/                 # ไฟล์ประวัติการพัฒนาฐานข้อมูล SQL (DB Schema)
```

---

## 6. แนวทางการพัฒนาและข้อพึงระวัง (Development Guidelines)

1. **ห้ามนำ Component ภายนอกมาใช้โดยพลการ**: ทุกส่วนการแสดงผล (UI) ภายใน `apps/perpos/` จะต้องใช้ปุ่ม ช่องกรอกข้อมูล หรือกล่องโต้ตอบจากกลุ่ม Component ใน `@/components/ui/` เสมอ (เช่น `<Button>`, `<Input>`, `<ThaiDatePicker>`, `<CustomSelect>`) เพื่อคุมมาตรฐานดีไซน์และโทนสีพรีเมียม
2. **คุมเข้ม Security Context เสมอ**: การแก้ไขข้อมูลใดๆ ใน API Route จะต้องเรียกใช้งาน `setAuditContext()` เพื่อลงทะเบียนการทำรายการของผู้ใช้เสมอ และตรวจสอบให้แน่ใจว่าการสืบค้นข้อมูลมีเงื่อนไขขององค์กร (`org_id` หรือ `organization_id`) เข้าไปกรองด้วยเสมอ เพื่อรักษาความเป็นส่วนตัวของข้อมูลองค์กร (Tenant Isolation)
3. **การออกแบบ Flex Card**: ในการพัฒนา LINE Bot หากมีการแก้ไขหรือสร้าง Flex Card ชุดใหม่ จะต้องระวังไม่ให้ใช้ `align: "center"` ลงบน layout component ประเภท `box` เด็ดขาด (เนื่องจากขัดต่อนโยบาย JSON schema ของ LINE API และจะส่งผลให้การ์ดไม่แสดงผล) ให้เปลี่ยนไปใช้งานตัวระบุตำแหน่งแนวตั้ง `alignItems` หรือแนวนอน `justifyContent` แทน
