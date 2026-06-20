# PERPOS Landing Content Inventory

> Content pack for redesigning the PERPOS public website.
> Purpose: collect the product messages, proof points, use cases, visual ideas, and missing inputs needed to build the new landing pages.

---

## 1. Content Status

Prepared:

- Product architecture: PERPOS Flow and PERPOS Suite
- Core design principle: simple, low friction, easy to start
- Standard PERPOS color direction from `DESIGN.md`
- Sitemap and wireframe for `/`, `/flow`, `/suite`
- First-pass TH/EN copy
- Motion direction for low-friction animation
- Two primary Flow feature loops: PDF and STT

Still needed:

- Final wording review for privacy and file retention
- Decision on launch shape: homepage only vs `/flow` and `/suite` at launch
- Decision on whether Suite proof stays generic or can name organizations/customers

Confirmed by product owner:

- LINE OA add URL: `https://line.me/R/ti/p/@perpos`
- LINE QR asset:
  - Docs: `docs/assets/landing/line-oa-qr.png`
  - Landing public path: `apps/landing/public/flow/line-oa-qr.png`
- Flow token rates:
  - PDF compression: 100 tokens / page
  - STT / meeting summary: 100 tokens / minute
  - Meeting bot: 150 tokens / minute
- Token top-up is available in both LINE and web.
- Public file limits:
  - PDF: 500 MB
  - STT audio/video: 500 MB
- Meeting bot platforms can be marketed publicly: Google Meet, Zoom, Microsoft Teams.
- Flow hero animation should start with STT.
- Public examples can include PDF, STT, meeting bot, and tailor-made Suite workflows.
- Tailor-made Suite modules are real and actively running in multiple organizations.
- Privacy direction: PDPA-aware, audio files are not stored by PERPOS, files are not used to train AI, meeting-summary files are deleted from the server within 48 hours.
- Product lockups:
  - `PERPOS | FLOW`
  - `PERPOS | SUITE`
  - Use NeoTech font from `apps/perpos/src/app/_fonts/NeoTech.ttf` via `.font-neo-tech`.

---

## 2. Product Emphasis Matrix

| Product      | Main Message              | Main Buyer                | Pricing                       | Primary CTA  | Main Visual            |
| ------------ | ------------------------- | ------------------------- | ----------------------------- | ------------ | ---------------------- |
| PERPOS Flow  | ผู้ช่วย AI ส่วนตัวบน LINE | Individual / personal use | Token, pay as you go          | Add LINE     | LINE chat workflow     |
| PERPOS Suite | AI ERP สำหรับองค์กร       | Business / organization   | Subscription + implementation | Request Demo | Module/workflow system |

The landing should never make these two products compete as pricing plans. They are different buying motions.

---

## 3. PERPOS Flow Content Pack

### Positioning

**TH**

```text
PERPOS Flow คือผู้ช่วย AI ส่วนตัวบน LINE สำหรับจัดการ PDF เสียงประชุม และงานเอกสารประจำวัน
```

**EN**

```text
PERPOS Flow is a personal AI assistant in LINE for PDFs, meeting audio, and everyday document work.
```

### Core Message

```text
โยนเข้า LINE → กดยืนยัน → รับผลลัพธ์กลับมา
```

### Main Promise

```text
ทำงานกับไฟล์และเสียงประชุมได้ง่ายเหมือนส่งแชต
```

### Why It Matters

- ไม่ต้องเรียน software ใหม่
- ไม่ต้องเปิด dashboard เพื่อเริ่มงาน
- ไม่ต้อง subscription รายเดือน
- ใช้ผ่าน LINE ที่คนไทยคุ้นเคย
- จ่ายตามการใช้งานจริงด้วย token
- เหมาะกับงานที่อยากให้จบเร็วเมื่อต้องใช้

### Primary Feature 1: PDF Compress

User story:

```text
ฉันมีไฟล์ PDF ใหญ่เกินส่ง
ฉันส่งไฟล์เข้า LINE
Flow ถามยืนยัน
ฉันกดบีบไฟล์
Flow ส่ง PDF ที่เล็กลงกลับมา
```

Landing copy:

```text
ส่ง PDF เข้า LINE แล้วกดยืนยัน
Flow บีบไฟล์และส่ง PDF ที่เล็กลงกลับมาให้ในแชต
```

Visual content:

- LINE chat mockup
- User bubble: `contract.pdf`
- Flow bubble: `ต้องการบีบไฟล์นี้ไหม?`
- Confirm button: `บีบไฟล์`
- Progress: `กำลังบีบไฟล์...`
- Result: `contract-compressed.pdf`
- Small metric: `ลดขนาดไฟล์ xx%` if real example exists

Needed input:

- Typical compression percentage range that can be claimed safely
- Final file retention detail for compressed PDF results

### Primary Feature 2: STT / Meeting Summary

User story:

```text
ฉันมีไฟล์เสียงประชุม
ฉันส่งเข้า LINE
Flow ถามยืนยัน
ฉันกดถอดเสียง
Flow ส่งสรุปรายงานการประชุมกลับมา
```

Landing copy:

```text
ส่งไฟล์เสียงหรือวิดีโอการประชุม
Flow ช่วยถอดและสรุปเป็นรายงานการประชุมให้
```

Visual content:

- LINE chat mockup
- User bubble: `meeting-audio.m4a`
- Flow bubble: `ต้องการถอดเสียงไฟล์นี้ไหม?`
- Confirm button: `ถอดเสียง`
- Progress: `กำลังสรุปประชุม...`
- Result: `รายงานการประชุมพร้อมแล้ว`
- Optional result card: meeting title, decisions, action items

Needed input:

- Whether output should be described as transcript, MoM, summary, or all
- Average processing time claim, if any

### Secondary Feature: Meeting Bot

Keep this as a supporting feature at launch.

Landing copy:

```text
ส่ง link ประชุม แล้วให้ Flow ช่วยส่งบอทเข้าไปบันทึกและสรุปให้
```

Visual content:

- Meeting link card
- Bot scheduled/joining status
- MoM result card

Public platforms:

- Google Meet
- Zoom
- Microsoft Teams

Needed input:

- Final consent/PDPA wording for bot participation

### Token Model Content

Known:

```text
เริ่มต้น 99 บาท
1 บาท = 100 token
เติมเท่าที่ใช้
ไม่มี subscription รายเดือน
token ไม่หมดอายุ ถ้ามีการเติมอย่างน้อย 1 ครั้งภายใน 1 ปี
```

Feature rates:

```text
PDF: 100 token / หน้า
ถอดเสียงประชุม: 100 token / นาที
บอทเข้าประชุม: 150 token / นาที
```

English:

```text
PDF compression: 100 tokens / page
Speech-to-text: 100 tokens / minute
Meeting bot: 150 tokens / minute
```

Suggested section title:

```text
เติม token เท่าที่ใช้
```

Supporting copy:

```text
เติมไว้ครั้งเดียว แล้วใช้กับหลายฟีเจอร์ของ Flow ได้ตามต้องการ
เหมาะกับงานที่ไม่ได้ใช้ทุกวัน แต่อยากให้จบเร็วเมื่อจำเป็น
```

Needed input:

- Final UI path for top-up in LINE and web (button/link labels, deep links, checkout route)

---

## 4. PERPOS Suite Content Pack

### Positioning

**TH**

```text
PERPOS Suite คือ AI ERP สำหรับองค์กร ทีม และ workflow เฉพาะธุรกิจ
```

**EN**

```text
PERPOS Suite is an AI ERP for organizations, teams, and custom business workflows.
```

### Core Message

```text
ERP พื้นฐาน + workflow เฉพาะองค์กร + AI automation
```

### Main Promise

```text
วางระบบให้เข้ากับวิธีทำงานจริงขององค์กร ไม่ใช่บังคับให้องค์กรทำงานตาม software
```

### Why It Matters

- ธุรกิจแต่ละแบบมี workflow ไม่เหมือนกัน
- ERP สำเร็จรูปมักพอดีกับบางส่วน แต่ไม่พอดีกับ operation จริงทั้งหมด
- Suite วาง core modules ก่อน แล้วต่อยอดด้วย tailor-made modules
- AI ช่วยอ่านเอกสาร สรุปข้อมูล แจ้งเตือน และลดงานซ้ำ

### Core ERP Modules

Use softer language for broad core ERP modules unless product owner confirms each one for public production-ready claims.

Suggested public framing:

```text
Core ERP foundation + tailor-made modules
```

Possible core module labels:

- Accounting
- Finance
- HR
- Sales
- Purchase
- Inventory / Operations

Production-ready emphasis:

- Tailor-made ERP modules are real and currently running in multiple organizations.

### Tailor-Made ERP Modules

Suggested copy:

```text
ทุกองค์กรมี workflow ที่ไม่เหมือนกัน
PERPOS Suite สามารถออกแบบ module เฉพาะสำหรับงานที่ระบบสำเร็จรูปรองรับไม่พอ
```

Possible example categories:

- Property / stay management
- CRM and field operations
- Accounting firm workflow
- Approval and document workflow
- LINE-based operations
- Executive dashboards

Public-safe claim:

```text
Tailor-made workflows are already running in real organizations.
```

Use generic industry/workflow categories unless specific customer names are approved.

### AI Automation Content

Suggested copy:

```text
AI ใน PERPOS Suite ไม่ใช่แค่ chatbot
แต่ช่วยอ่านเอกสาร สรุปข้อมูล ตรวจงาน แจ้งเตือน และเชื่อมขั้นตอนระหว่างทีม
```

Possible proof examples:

- OCR for accounting documents
- LINE notifications and command workflows
- Google Drive and Calendar integration
- Scheduler and automated job processing
- Admin dashboards and audit logs

Needed input:

- Which AI features should be marketed now versus kept for sales conversations

### Suite Buying Journey

Suggested section:

```text
ออกแบบระบบจาก workflow จริงขององค์กร

1. คุย workflow และปัญหาที่เกิดขึ้นจริง
2. เลือก core modules ที่ต้องใช้
3. ออกแบบ tailor-made modules
4. ทดสอบกับทีมจริง
5. เปิดใช้งานและปรับต่อเนื่อง
```

This should replace generic enterprise buzzwords.

---

## 5. Homepage Content Pack

Homepage should not fully sell both products. It should help visitors choose.

### Hero

```text
PERPOS
เครื่องมือ AI และระบบ ERP สำหรับงานยุคใหม่ของธุรกิจไทย

เลือกวิธีทำงานที่เหมาะกับคุณ
```

### Product Router Cards

Flow card:

```text
PERPOS Flow
ผู้ช่วย AI ส่วนตัวบน LINE

ส่ง PDF หรือเสียงประชุมเข้า LINE
Flow ถามยืนยัน ประมวลผล และส่งผลลัพธ์กลับให้ในแชต
```

Suite card:

```text
PERPOS Suite
AI ERP สำหรับองค์กร

ระบบ ERP และ workflow automation สำหรับทีม บัญชี HR operations และงานเฉพาะธุรกิจ
```

### Comparison Content

| User Need                    | Product |
| ---------------------------- | ------- |
| บีบ PDF หรือสรุปเสียงประชุม  | Flow    |
| ใช้งานผ่าน LINE              | Flow    |
| ต้องการ ERP สำหรับทีม        | Suite   |
| ต้องการ workflow เฉพาะธุรกิจ | Suite   |

---

## 6. Proof & Trust Content

Potential proof types:

### Product Proof

Flow:

- PDF before/after file size example
- STT summary output example
- LINE chat demo
- Token balance example

Suite:

- Module map
- Workflow before/after
- Dashboard preview
- Implementation path

### Technical Trust

Use sparingly on public pages.

Possible copy:

```text
สร้างบน cloud infrastructure ที่รองรับระบบ production จริง
ออกแบบด้วย privacy, permission และ data separation ตั้งแต่ระดับระบบ
```

Avoid leading with:

- Cloud Run
- Supabase RLS
- pgvector
- worker architecture

These are useful for technical buyers but too much for first-screen messaging.

### Privacy Trust

Flow:

```text
PERPOS Flow คำนึงถึง PDPA
ไฟล์ของคุณถูกใช้เพื่อประมวลผลงานที่คุณสั่งเท่านั้น
ไฟล์เสียงไม่ถูกเก็บไว้ที่ PERPOS และไม่นำไปใช้เทรน AI ต่อ
ไฟล์รายงานสรุปประชุมจะถูกลบออกจาก server ภายใน 48 ชั่วโมง
```

Suite:

```text
ข้อมูลของแต่ละองค์กรถูกแยกสิทธิ์และออกแบบให้ใช้งานตาม role ของทีม
```

Need final legal review before publishing, but this is the product-owner-approved direction.

---

## 7. Visual Asset Checklist

Needed for design:

### Shared

- PERPOS logo lockup
- Flow sub-brand lockup: `PERPOS | FLOW` using NeoTech
- Suite sub-brand lockup: `PERPOS | SUITE` using NeoTech
- Product icon direction
- Standard color tokens from `DESIGN.md`

### Flow

- LINE chat mockup
- PDF compression chat sequence
- STT chat sequence
- Token balance card
- Confirmation card/button
- Result file card
- QR/add LINE visual from `apps/landing/public/flow/line-oa-qr.png`

### Suite

- Module map
- Workflow timeline
- Dashboard/module surface
- Core module icons
- Tailor-made module examples
- Implementation process visual

---

## 8. Content Gaps To Ask Owner

Highest priority:

1. Confirm final Flow CTA label: "เพิ่มเพื่อนใน LINE", "เริ่มใช้ Flow", or both
2. Confirm final top-up button/link labels for LINE and web
3. Confirm whether specific organization/customer names can be shown
4. Confirm exact output wording: "รายงานการประชุม", "สรุปประชุม", "transcript", or combined
5. Confirm whether launch includes `/flow` and `/suite` immediately or starts with homepage only

Nice to have:

1. Real PDF compression before/after example
2. Real MoM output sample with fake/anonymized content
3. Real Suite dashboard screenshot or anonymized mock
4. Customer segment priority: freelancers, SME owners, managers, accounting teams, etc.
5. Whether English page is required at launch or Thai-first is enough
