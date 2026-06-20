# PERPOS Landing Sitemap & Wireframe

> Draft information architecture and text-first wireframe for the new PERPOS public website.
> This document follows [`LANDING_REDESIGN_BRIEF.md`](./LANDING_REDESIGN_BRIEF.md).

---

## 1. Phase 1 Sitemap

Phase 1 should stay small and clear.

```text
/
  Brand homepage and product router

/flow
  PERPOS Flow landing page
  B2C, LINE-first AI assistant, token-based

/suite
  PERPOS Suite landing page
  B2B AI ERP, subscription and tailor-made workflows

/privacy
/terms
```

Do not launch too many pages before the core split is clear.

---

## 2. Global Navigation

Desktop:

```text
PERPOS logo / product lockup
Flow
Suite
Pricing
Sign in
[Add LINE] or [Request Demo] depending on page context
```

Mobile:

```text
PERPOS logo
[Menu]

Menu:
- PERPOS Flow
- PERPOS Suite
- Pricing
- Sign in
- Add Flow on LINE
- Request Suite Demo
```

Navigation rules:

- On `/`, show both CTAs but keep them visually distinct.
- On `/flow`, primary CTA = Add LINE.
- On `/suite`, primary CTA = Request Demo.
- Keep nav labels short. Avoid "AI Agents" as the main nav category because it does not explain the product split.

---

## 3. Homepage Wireframe (`/`)

Homepage role: explain PERPOS as a product family and route visitors to Flow or Suite.

### Section 1: Hero

Goal: make the split obvious within the first screen.

Suggested copy:

```text
PERPOS
AI tools and ERP systems for modern Thai work.

Choose the way you want to work.
```

Thai:

```text
PERPOS
เครื่องมือ AI และระบบ ERP สำหรับงานยุคใหม่ของธุรกิจไทย

เลือกวิธีทำงานที่เหมาะกับคุณ
```

Hero layout:

- Left: headline + short description
- Right: two product cards or split panel
- No complex dashboard mockup in homepage hero
- Use product lockups as text: `PERPOS | FLOW` and `PERPOS | SUITE`.
- Product lockups should use the NeoTech font from `apps/perpos`.

Product cards:

```text
PERPOS Flow
ผู้ช่วย AI ส่วนตัวบน LINE

ส่งไฟล์ PDF หรือเสียงประชุมเข้า LINE
Flow ถามยืนยันและส่งผลลัพธ์กลับให้ในแชต

[Add LINE]
[ดู Flow]
```

```text
PERPOS Suite
AI ERP สำหรับองค์กร

ระบบ ERP + workflow เฉพาะธุรกิจ
สำหรับทีม บัญชี HR operations และงานองค์กร

[Request Demo]
[ดู Suite]
```

Design note:

- Flow and Suite cards should feel equal as siblings.
- Do not make Flow look like a small add-on under Suite.

---

### Section 2: Quick Comparison

Goal: help visitors self-select.

```text
คุณกำลังมองหาอะไร?
```

| Need                                   | Choose       |
| -------------------------------------- | ------------ |
| ใช้ AI ช่วยบีบ PDF หรือสรุปเสียงประชุม | PERPOS Flow  |
| ใช้งานผ่าน LINE ไม่อยากเรียนระบบใหม่   | PERPOS Flow  |
| ต้องการระบบ ERP ให้ทีม/องค์กร          | PERPOS Suite |
| ต้องการ module เฉพาะ workflow ธุรกิจ   | PERPOS Suite |

Alternative desktop layout:

- Two columns
- Each column has 3 "best for" bullets

---

### Section 3: How The Products Work Together

Goal: show ecosystem without mixing pricing.

Suggested copy:

```text
Flow helps individuals get work done instantly in LINE.
Suite helps organizations run workflows, modules, and operations at scale.
Both are built on the same PERPOS philosophy: simple, practical, low-friction software.
```

Thai:

```text
Flow ช่วยให้แต่ละคนทำงานจบเร็วใน LINE
Suite ช่วยให้องค์กรจัดการ workflow, module และ operation ได้เป็นระบบ
ทั้งสองตัวอยู่บนแนวคิดเดียวกัน: ซอฟต์แวร์ที่เรียบ ใช้ง่าย และลดขั้นตอนจริง
```

---

### Section 4: Final Split CTA

```text
Start with the product that fits your work.

[Use PERPOS Flow in LINE]
[Request PERPOS Suite Demo]
```

Thai:

```text
เริ่มจากแบบที่เหมาะกับงานของคุณ

[ใช้ PERPOS Flow บน LINE]
[ขอเดโม PERPOS Suite]
```

---

## 4. Flow Page Wireframe (`/flow`)

Flow role: convert B2C users to LINE add / token top-up.

### Section 1: Flow Hero

Goal: instantly explain LINE-first workflow.

Suggested copy:

```text
PERPOS Flow
ผู้ช่วย AI ส่วนตัวบน LINE

โยนเสียงประชุมหรือ PDF เข้า LINE
Flow ถามยืนยัน ประมวลผล และส่งผลลัพธ์กลับให้ในแชต
```

Shorter hero alternative:

```text
โยนเข้า LINE
กดยืนยัน
รับผลลัพธ์กลับมา
```

Primary CTA:

```text
Add Flow on LINE
```

Secondary CTA:

```text
เริ่มใช้ด้วย 99 บาท
```

Hero visual:

- LINE chat mockup
- Default loop: user sends meeting audio
- Flow asks for STT/summary confirmation
- User taps confirm
- Flow returns a meeting summary card
- Secondary loop can switch to PDF compression
- Include the official LINE QR asset where useful:
  - `/flow/line-oa-qr.png` in the landing app
  - source file: `docs/assets/landing/line-oa-qr.png`

This visual should be more important than a dashboard.

---

### Section 2: Two Core Flows

Goal: explain the two primary PERPOS Flow features as simple low-friction loops.

Card 1:

```text
บีบ PDF
ส่งไฟล์ PDF เข้า LINE แล้วกดยืนยัน
Flow ส่งไฟล์ที่เล็กลงกลับมาให้
```

Card 2:

```text
ถอดเสียงประชุม
ส่งไฟล์เสียงหรือวิดีโอ
Flow สรุปเป็นรายงานการประชุมให้
```

Secondary feature note:

```text
ส่งบอทเข้าประชุม
ส่ง link ประชุม
Flow ช่วยส่งบอทเข้าไปบันทึกและสรุปให้
```

Supported platforms for public copy:

- Google Meet
- Zoom
- Microsoft Teams

Design note:

- Use action verbs.
- Avoid technical terms like STT in primary copy. Keep STT in detail text only if needed.
- PDF compression and speech-to-text are the primary landing examples.
- Meeting bot can appear as a smaller supporting card or "also available" item, not the first thing users see.

---

### Section 3: Token Pricing

Goal: make pricing feel simple and non-threatening.

Suggested copy:

```text
เติม token เท่าที่ใช้
ไม่มี subscription รายเดือน

เริ่มต้น 99 บาท
1 บาท = 100 token
token ไม่หมดอายุ ถ้ามีการเติมอย่างน้อย 1 ครั้งภายใน 1 ปี
```

Visual:

- Token balance card
- Example top-up: 99 THB = 9,900 tokens
- Small "no monthly subscription" badge
- Show that top-up is available from both LINE and web.

Feature rates:

- PDF compression: 100 tokens / page
- Speech-to-text / meeting summary: 100 tokens / minute
- Meeting bot: 150 tokens / minute

Public file limits:

- PDF: up to 500 MB
- STT audio/video: up to 500 MB

---

### Section 4: Low-Friction Steps

```text
เริ่มใช้ใน 3 ขั้นตอน

1. เพิ่ม PERPOS Flow เป็นเพื่อนใน LINE
2. เติม token เริ่มต้น 99 บาท
3. ส่ง PDF หรือเสียงประชุม แล้วให้ Flow จัดการต่อ
```

Design:

- Use a simple 3-step horizontal flow on desktop.
- Stack vertically on mobile.

---

### Section 5: Privacy / Trust

Suggested copy:

```text
ไฟล์งานของคุณถูกใช้เพื่อประมวลผลงานที่คุณสั่งเท่านั้น
เราออกแบบให้ผลลัพธ์ส่งกลับในแชตและลบไฟล์ชั่วคราวตาม policy ของระบบ
```

Need legal/product confirmation before final copy.

---

### Section 6: Final CTA

```text
ลองใช้ Flow จาก LINE ได้เลย

[Add PERPOS Flow on LINE]
```

---

## 5. Suite Page Wireframe (`/suite`)

Suite role: generate B2B leads and explain ERP + custom workflow.

### Section 1: Suite Hero

Suggested copy:

```text
PERPOS Suite
AI ERP สำหรับองค์กรและ workflow เฉพาะธุรกิจ

รวม module พื้นฐานของ ERP เข้ากับระบบที่ปรับตามการทำงานจริงขององค์กรคุณ
```

Primary CTA:

```text
Request Suite Demo
```

Secondary CTA:

```text
Talk to PERPOS team
```

Hero visual:

- Calm module/workflow map
- Core modules in the center
- Tailor-made modules around it
- Avoid overly futuristic AI network graphics

---

### Section 2: Core Modules

Goal: show ERP foundation.

Suggested module groups:

- Accounting
- Finance
- HR
- Sales
- Purchase
- Inventory / operations

Copy:

```text
เริ่มจากระบบพื้นฐานที่องค์กรต้องใช้
แล้วต่อยอดด้วย workflow ที่ออกแบบให้เข้ากับธุรกิจจริง
```

---

### Section 3: Tailor-Made ERP

Goal: explain why Suite is not generic ERP.

Suggested copy:

```text
ทุกองค์กรมี workflow ที่ไม่เหมือนกัน
PERPOS Suite สามารถออกแบบ module เฉพาะสำหรับงานที่ระบบสำเร็จรูปมักรองรับไม่พอ
```

Examples:

- Property / stay management
- CRM and field operations
- Accounting firm workflows
- Internal approval and document flows
- LINE-based operation commands

Only list examples that the team is comfortable presenting publicly.

---

### Section 4: AI + Workflow Automation

Goal: make AI practical, not abstract.

Suggested copy:

```text
AI ใน PERPOS Suite ไม่ใช่แค่ chatbot
แต่ช่วยอ่านเอกสาร สรุปข้อมูล ตรวจงาน และเชื่อมขั้นตอนระหว่างทีม
```

Examples:

- OCR for accounting documents
- Management summaries
- LINE notifications
- Google Drive / Calendar integrations
- Admin dashboards

---

### Section 5: Implementation Path

Goal: explain B2B buying journey.

```text
1. คุย workflow จริงขององค์กร
2. เลือก core modules ที่ต้องใช้
3. ออกแบบ tailor-made modules
4. ทดสอบกับทีมจริง
5. เปิดใช้งานและปรับต่อเนื่อง
```

Design:

- Timeline or checklist
- Keep it practical, not sales-heavy

---

### Section 6: Final CTA

```text
อยากให้ ERP เข้ากับ workflow จริงขององค์กรคุณไหม?

[Request Suite Demo]
[Talk to PERPOS team]
```

---

## 6. Pricing Presentation

Pricing must stay split.

### Homepage Pricing Summary

```text
Flow
Token-based
เริ่มต้น 99 บาท
ใช้เท่าไหร่จ่ายเท่านั้น

Suite
Subscription
ราคาและ scope ตาม module และ workflow ขององค์กร
```

### Do Not Mix

Do not put Suite subscription next to Flow token costs as if they are comparable plans.

Flow is self-serve.
Suite is consultative.

---

## 7. Copy Rules

Use:

- "โยนเข้า LINE"
- "กดยืนยัน"
- "ส่งผลลัพธ์กลับ"
- "เติม token เท่าที่ใช้"
- "AI ERP สำหรับองค์กร"
- "workflow เฉพาะธุรกิจ"

Avoid:

- "8 Autonomous AI Agents" as the main brand claim
- "Next-gen Agentic AI ERP" as the first thing users see
- "Request Demo" as the main Flow CTA
- "STT" as primary user-facing language
- Abstract enterprise architecture in the first screen

---

## 8. Designer Deliverables

Recommended first design deliverables:

1. Homepage desktop + mobile
2. Flow page desktop + mobile
3. Suite page desktop + mobile
4. Shared header/footer system
5. Product card component
6. Flow LINE chat visual component with PDF and STT variants
7. Suite module/workflow visual component

Design should be text-first before animation-heavy.

---

## 9. Motion & Animation Direction

Animation should make the product feel easier, not busier.

Core motion signature:

```text
Drop → Confirm → Process → Return
```

Thai:

```text
โยนเข้า → ยืนยัน → ระบบจัดการ → ส่งกลับ
```

### Homepage Animation

Purpose: help users understand the product split quickly.

Recommended:

- Two product cards appear with a gentle stagger.
- Hovering Flow shows a tiny LINE chat sequence: file enters, confirmation appears, result comes back.
- Hovering Suite shows a calm module flow: request enters, passes through module, report/output appears.
- Keep animation subtle. The page should not feel like a game.

Avoid:

- Large animated AI network as the first hero visual
- Constant moving background
- Blue/cyan glowing effects

### Flow Hero Animation

This should be the main animation of the redesign.

Use two primary variants of the same motion pattern:

```text
Drop → Confirm → Process → Return
```

Default hero loop: Speech-to-text / meeting summary

The first hero animation should start with STT because it best communicates the value of Flow for meetings and daily work.

```text
1. User message bubble slides in: "meeting-audio.m4a"
2. Flow reply appears: "ต้องการถอดเสียงไฟล์นี้ไหม?"
3. Confirm button taps itself once
4. Small progress state appears: "กำลังสรุปประชุม..."
5. Result bubble appears: "รายงานการประชุมพร้อมแล้ว"
6. Token balance decreases subtly
```

Secondary loop: PDF compression

```text
1. User message bubble slides in: "document.pdf"
2. Flow reply appears: "ต้องการบีบไฟล์นี้ไหม?"
3. Confirm button taps itself once
4. Small progress state appears: "กำลังบีบไฟล์..."
5. Result bubble appears: "document-compressed.pdf"
6. Token balance decreases subtly
```

Interaction states:

- Desktop: autoplay once, then loop slowly with a pause.
- Mobile: autoplay once, then stop or loop very slowly.
- Hover/tap on feature cards can swap the scenario:
  - PDF compression
  - Meeting audio summary
- Meeting bot should not be the first hero animation. It can appear below as a secondary use case.

Timing:

- Total loop: 6-8 seconds
- Use short pauses between steps
- Avoid fast typing effects; the product should feel calm

### Flow Feature Card Animation

PDF card:

```text
PDF icon → compression line → smaller PDF icon
```

Speech card:

```text
Audio waveform → short summary card
```

Secondary meeting bot card:

```text
Meeting link → bot joins → MoM card
```

Each animation should explain the action in one glance.

### Token Animation

Use token animation sparingly.

Recommended:

- Token balance card
- On completed action, token number changes with a small count-down
- "No monthly subscription" badge remains static

Avoid:

- Coin explosions
- Casino/game-like token effects
- Anything that makes token usage feel stressful

### Suite Animation

Suite motion should feel operational and structured.

Recommended:

- Module cards connect in a simple process line
- A request moves through "Accounting", "HR", or "Custom Workflow"
- Output becomes a dashboard card, approval, or report
- Use subtle highlight pulses on active modules

Avoid:

- Overly dense automation maps
- Dozens of moving nodes
- Sci-fi agent swarm visuals

### Accessibility

- Respect `prefers-reduced-motion`.
- Animation must not be required to understand the content.
- Do not animate body text continuously.
- Avoid flashing.
- Keep CTA buttons stable and easy to click.

---

## 10. Open Questions

Before visual design is finalized:

1. What exact CTA should Flow use: "Add LINE", "เพิ่มเพื่อน", or "เริ่มใช้ Flow"?
2. Do we want a single homepage only at launch, or immediately publish `/flow` and `/suite` too?
3. Should the homepage default language be Thai, English, or browser language?
4. Should Suite proof remain generic, or can specific organization/customer names be shown publicly?
