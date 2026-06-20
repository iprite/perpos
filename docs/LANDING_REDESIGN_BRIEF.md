# PERPOS Landing Redesign Brief

> Working brief for redesigning the PERPOS public website.
> Goal: clearly split PERPOS into two product lines, avoid mixing B2C and B2B messages, and help visitors choose the right path quickly.

---

## 1. Core Experience Principle

The redesign must be built around one product feeling:

```text
Simple. Low friction. Easy to start.
```

Thai:

```text
เรียบง่าย ลดขั้นตอน ใช้งานได้ทันที
```

This is especially important for PERPOS Flow, but the whole PERPOS brand should feel calm and easy rather than loud, complicated, or overly futuristic.

Designers should avoid making the website feel like a heavy enterprise AI concept page. The product should feel practical: send something, confirm, get the result.

### What "Low Friction" Means

For PERPOS Flow:

- The user should understand the product within the first screen.
- The main action should be obvious: add LINE / start using Flow.
- The page should show short workflows, not long explanations.
- Every feature should be explained as an action the user already understands:
  - Send PDF
  - Confirm compression
  - Get smaller file back
  - Send audio
  - Get meeting summary
  - Send meeting link
  - Let the bot join
- Avoid dashboard-heavy visuals for Flow unless they support the LINE-first story.

For PERPOS Suite:

- The user should quickly understand that this is the organization product.
- The page should make it easy to request a demo or start a conversation.
- The content should be structured around business workflows, not abstract AI claims.
- Avoid overwhelming visitors with too many modules at once.

### Visual Feel

The landing should feel:

- Clean
- Calm
- Practical
- Trustworthy
- Thai-business friendly
- Modern, but not flashy

Avoid:

- Dense futuristic AI language
- Overly complex network diagrams
- Too many animated elements competing for attention
- Long paragraphs in the hero
- Loud gradients or visual effects that make the product feel harder than it is

### Motion Principle

Animation should communicate "low friction" by showing work moving forward with very few steps.

Motion should feel:

- Smooth
- Light
- Direct
- Useful
- Calm

Avoid:

- Complex sci-fi animations
- Busy network graphs
- Constant looping motion everywhere
- Effects that distract from the CTA
- Animations that make the product feel complicated

Recommended motion metaphor:

```text
Drop → Confirm → Process → Return
```

Thai:

```text
โยนเข้า → ยืนยัน → ระบบจัดการ → ส่งกลับ
```

This motion pattern should become the signature interaction for PERPOS Flow.

For PERPOS Suite, motion should communicate workflow clarity:

```text
Input → Module → Review → Output
```

or

```text
Request → Approval → Operation → Report
```

---

## 2. Product Architecture

PERPOS is no longer positioned as one generic ERP landing page. The public website must introduce PERPOS as a product family with two clear products:

### PERPOS Flow

**Category:** B2C / personal productivity / LINE-first AI assistant

**One-line positioning:**
PERPOS Flow is a personal AI assistant inside LINE for documents, meetings, and everyday work.

**Thai positioning:**
PERPOS Flow คือผู้ช่วย AI ส่วนตัวบน LINE สำหรับจัดการเอกสาร การประชุม และงานประจำวัน

**Core idea:**
Make work feel as easy as sending something into LINE.

Users should not feel they are learning software. They should feel they are simply dropping a file, audio, or meeting link into LINE, confirming the action, and getting the result back.

**Current features:**

- Speech-to-text / meeting summary from audio or video
- Recall meeting bot for joining online meetings and producing meeting records
- PDF compression by sending PDF files through LINE

**Primary landing features:**

- PDF compression
- Speech-to-text / meeting summary

These two features should be treated as the main public examples for PERPOS Flow because they both perfectly demonstrate the low-friction product loop:

```text
Drop → Confirm → Process → Return
```

Meeting bot can appear as a secondary feature, but the first landing experience should focus on PDF and STT so the product feels immediately understandable.

**Business model:**

- Token-based
- Pay as you go
- Starts at 99 THB
- 1 THB = 100 tokens
- Tokens do not expire as long as the user tops up at least once within 1 year
- Feature rates:
  - PDF compression: 100 tokens / page
  - Speech-to-text / meeting summary: 100 tokens / minute
  - Meeting bot: 150 tokens / minute

**Primary CTA:**
Add PERPOS Flow on LINE

**LINE OA URL:**
`https://line.me/R/ti/p/@perpos`

**LINE QR asset:**

- Source asset for design/docs: [`docs/assets/landing/line-oa-qr.png`](./assets/landing/line-oa-qr.png)
- Public app asset: [`apps/landing/public/flow/line-oa-qr.png`](../apps/landing/public/flow/line-oa-qr.png)

**Top-up flow:**
Users can top up tokens from both LINE and the web.

**Public file limits:**

- PDF: up to 500 MB
- STT audio/video: up to 500 MB

**Secondary CTA:**
Start with 99 THB

---

### PERPOS Suite

**Category:** B2B / AI ERP / organization software

**One-line positioning:**
PERPOS Suite is an AI ERP for teams, organizations, and custom business workflows.

**Thai positioning:**
PERPOS Suite คือ AI ERP สำหรับทีม องค์กร และ workflow เฉพาะธุรกิจ

**Core idea:**
An ERP system that fits how the organization actually works, combining core business modules with tailor-made operational workflows.

**Module groups:**

- Core ERP modules, such as accounting, HR, finance, sales, purchase, and operations
- Tailor-made ERP modules customized for each organization or industry workflow

**Public proof:**
Tailor-made ERP workflows are real and currently running in multiple organizations.

**Business model:**

- Subscription
- B2B sales motion
- Demo / consultation / implementation
- Pricing depends on modules, user needs, and customization scope

**Primary CTA:**
Request Suite Demo

**Secondary CTA:**
Talk to PERPOS team

---

## 3. Brand-Level Message

The homepage should not immediately dive into ERP details or AI-agent jargon. Its first job is to help the visitor understand that PERPOS has two paths:

```text
PERPOS
AI tools and ERP systems for modern Thai work.

Choose how you want to work:

PERPOS Flow
Personal AI assistant in LINE.

PERPOS Suite
AI ERP for organizations.
```

Suggested Thai homepage copy:

```text
PERPOS
เครื่องมือ AI และระบบ ERP สำหรับงานยุคใหม่ของธุรกิจไทย

เลือกวิธีทำงานที่เหมาะกับคุณ

PERPOS Flow
ผู้ช่วย AI ส่วนตัวบน LINE

PERPOS Suite
AI ERP สำหรับองค์กร
```

---

## 3.5 Brand Lockups

Use text lockups for product names:

```text
PERPOS | FLOW
PERPOS | SUITE
```

Use the NeoTech logo font already included in the main app:

- Font file: [`apps/perpos/src/app/_fonts/NeoTech.ttf`](../apps/perpos/src/app/_fonts/NeoTech.ttf)
- Font loader: [`apps/perpos/src/app/fonts.ts`](../apps/perpos/src/app/fonts.ts)
- Utility class: `.font-neo-tech` in [`apps/perpos/src/app/globals.css`](../apps/perpos/src/app/globals.css)

The lockups should feel like one PERPOS family, not separate brands.

---

## 4. Audience Split

### PERPOS Flow Audience

**Who they are:**

- Individual workers
- Freelancers
- Founders
- Managers
- Consultants
- Small team members who rely on LINE every day

**Jobs to be done:**

- Compress a PDF quickly
- Turn meeting audio into useful notes
- Send a bot into a meeting
- Get work done without opening a complicated app
- Pay only when they need to use a feature

**Buying behavior:**

- Self-serve
- Fast decision
- Low commitment
- Wants to try immediately

**Landing tone:**
Simple, direct, friendly, low-friction.

Avoid sounding enterprise-heavy.

---

### PERPOS Suite Audience

**Who they are:**

- Business owners
- Operations managers
- Finance/accounting teams
- HR/admin teams
- Organizations with specific workflows that off-the-shelf ERP does not fit well

**Jobs to be done:**

- Run core ERP processes
- Centralize operational data
- Automate organization workflows
- Build tailor-made modules
- Connect LINE, Google, dashboards, and internal processes

**Buying behavior:**

- Needs trust
- Needs consultation
- Longer sales cycle
- Wants to see fit with real workflow

**Landing tone:**
Credible, practical, consultative, enterprise-ready.

Avoid making it sound like a simple personal tool.

---

## 5. Flow Product Narrative

PERPOS Flow should be presented as a LINE-first product.

The key mental model:

```text
Drop it into LINE.
Confirm the action.
Get the result back.
```

Thai version:

```text
โยนเข้า LINE
กดยืนยัน
รับผลลัพธ์กลับมา
```

Example user journeys:

### PDF Compression

```text
User sends a PDF to PERPOS Flow in LINE
Flow asks: "ต้องการบีบไฟล์นี้ไหม?"
User confirms
Flow compresses the file
Flow sends the compressed PDF back in chat
```

### Speech-to-Text / MoM

```text
User sends an audio or video file
Flow processes the recording
Flow returns a meeting summary or transcript result
```

### Meeting Bot

```text
User sends a meeting link
Flow sends a bot to join the meeting
Flow records and prepares a meeting summary
```

Flow should feel less like a dashboard and more like a helpful assistant sitting inside a chat the user already uses.

---

## 6. Suite Product Narrative

PERPOS Suite should be presented as an AI ERP for organizations.

The key mental model:

```text
Core ERP modules + custom workflows + AI automation
```

Thai version:

```text
โมดูล ERP พื้นฐาน + workflow เฉพาะองค์กร + AI automation
```

Suite should communicate that PERPOS is not only an accounting system and not only a chatbot. It is an operational system that can adapt to how an organization works.

Example use cases:

- Accounting and finance operations
- HR and employee workflows
- Sales, purchase, and inventory flows
- Organization-specific ERP modules
- LINE-based operational commands and notifications
- Dashboards and management views

---

## 7. Homepage Role

The homepage should act as a product router.

It should answer:

- What is PERPOS?
- Which product is right for me?
- Should I go to Flow or Suite?

It should not try to fully sell both products in one long page.

Recommended homepage structure:

1. Brand hero
2. Two product cards: Flow and Suite
3. Simple comparison table
4. Short proof / trust section
5. Final split CTA

Example comparison:

| Dimension | PERPOS Flow                        | PERPOS Suite                             |
| --------- | ---------------------------------- | ---------------------------------------- |
| Buyer     | Individual                         | Organization                             |
| Channel   | LINE-first                         | Web app + workflow + integrations        |
| Pricing   | Token / pay as you go              | Subscription                             |
| Best for  | Documents, meetings, personal work | ERP, teams, operations, custom workflows |
| CTA       | Add LINE                           | Request Demo                             |

---

## 8. Suggested Site Structure

Phase 1:

```text
/
/flow
/suite
/privacy
/terms
```

Phase 2:

```text
/flow/pricing
/flow/use-cases
/suite/modules
/suite/case-studies
/suite/contact
```

Designer should focus on Phase 1 first.

---

## 9. CTA Rules

### Flow CTA Rules

Flow should never lead with "Request Demo".

Recommended CTAs:

- Add on LINE
- Start with 99 THB
- Try Flow in LINE
- Send your first PDF

### Suite CTA Rules

Suite should not lead with "Add LINE".

Recommended CTAs:

- Request Suite Demo
- Talk to PERPOS team
- Explore Suite modules
- Design your workflow with us

---

## 10. Tone and Visual Direction

### Design System Alignment

The new landing site must visually align with the main PERPOS app design system.

Primary source:

- [`DESIGN.md`](../DESIGN.md)
- [`packages/config-tailwind/tailwind.config.ts`](../packages/config-tailwind/tailwind.config.ts)
- [`apps/perpos/src/app/globals.css`](../apps/perpos/src/app/globals.css)

Important: the current `apps/landing` visual direction uses a blue/cyan gradient heavily. That no longer matches the main app. PERPOS standard brand color is now **CHARCOAL mono**, not bright blue/aqua.

#### PERPOS Standard Palette

Use this palette for both landing and app surfaces.

| Color       |       Hex | Role                                   |
| ----------- | --------: | -------------------------------------- |
| CHARCOAL    | `#3C3B3D` | Primary / brand / title / neutral info |
| INK         | `#1A1A1B` | Strong text                            |
| DARK GRAY   | `#656D78` | Secondary text                         |
| MEDIUM GRAY | `#CCD1D9` | Strong border / divider                |
| LIGHT GRAY  | `#F5F7FA` | Soft surface                           |
| WHITE       | `#FFFFFF` | Canvas / card surface                  |
| MINT        | `#48CFAD` | Positive / success                     |
| RUBY        | `#D8334A` | Error / destructive only               |
| SUNFLOWER   | `#FFCE54` | Warning                                |
| BITTERSWEET | `#FC6E51` | Secondary warning/accent               |
| PLUM        | `#8067B7` | Accent / category                      |
| PINK ROSE   | `#EC87C0` | Accent / category                      |
| TEAL        | `#A0CECB` | Soft accent                            |

#### Color Rules For The Landing Redesign

Do:

- Use CHARCOAL as the main brand color.
- Use white, light gray, and neutral borders for most surfaces.
- Use MINT for success states and positive token/value moments.
- Use RUBY only for errors/destructive/negative states.
- Use PLUM/PINK/TEAL as small category accents, not dominant brand colors.
- Make Flow and Suite feel related through the same neutral system.

Do not:

- Use blue/cyan gradients as the main brand expression.
- Make the whole page blue, purple, beige, or any single-hue theme.
- Invent new hex colors outside the PERPOS palette.
- Use red for emphasis unless it is truly an error.
- Use bright color headers where a neutral CHARCOAL header would be clearer.

#### Product-Specific Visual Hints

PERPOS Flow:

- Base: white/light gray/CHARCOAL
- Accent: MINT for token balance, completed jobs, successful compression
- Optional secondary accents: TEAL or PLUM for feature category chips
- Main visual: LINE chat flow, file cards, confirmation cards, token balance

PERPOS Suite:

- Base: white/light gray/CHARCOAL
- Accent: PLUM/TEAL/PINK ROSE for module categories
- Main visual: module map, dashboard/workflow surfaces, process automation

Both products must still feel like PERPOS, not separate startups.

### Flow

Keywords:

- Easy
- Fast
- Chat-first
- Personal
- Practical
- No subscription pressure
- Low friction

Visual direction:

- LINE chat workflow
- File cards
- Confirmation cards
- Before/after result
- Token balance
- Simple steps

Avoid:

- Enterprise architecture diagrams
- Heavy ERP language
- "AI workforce" language
- Long abstract paragraphs

### Suite

Keywords:

- Operational
- Modular
- Customizable
- Reliable
- Organization-ready
- AI ERP
- Workflow automation

Visual direction:

- Module map
- Business process flows
- Dashboard/workflow views
- Integration map
- Case-based examples

Avoid:

- Making it look like only accounting software
- Making it look like only a chatbot
- Overpromising generic "8 AI agents" without grounding in real modules

---

## 11. Content Guardrails

Do:

- Always pair product names with descriptors in early sections:
  - PERPOS Flow — personal AI assistant in LINE
  - PERPOS Suite — AI ERP for organizations
- Keep Flow and Suite pricing separate
- Make Flow self-serve
- Make Suite consultation-led
- Show LINE as the main interface for Flow
- Show modules and workflows as the main interface for Suite

Do not:

- Present Flow as a sub-feature of Suite
- Present Suite as a token-based personal tool
- Use "assistant" alone when the product name should be Flow
- Use "ERP" alone when the product name should be Suite
- Put "Request Demo" as the main Flow CTA
- Hide the difference between B2C and B2B

---

## 12. Open Questions for Final Design Brief

Confirmed:

- LINE OA add URL: `https://line.me/R/ti/p/@perpos`
- LINE QR asset is available at `apps/landing/public/flow/line-oa-qr.png`.
- Flow hero animation starts with STT.
- PDF, STT, meeting bot, and tailor-made Suite workflows can be shown publicly.
- Tailor-made Suite workflows are real and running in multiple organizations.
- Token top-up can happen both in LINE and on the web.
- Public file limits: PDF and STT both support up to 500 MB.
- Meeting bot can publicly list Google Meet, Zoom, and Microsoft Teams.
- Brand lockups use `PERPOS | FLOW` and `PERPOS | SUITE` with the NeoTech font.
- Flow privacy direction: PDPA-aware; audio files are not stored by PERPOS; files are not used to train AI; meeting-summary files are deleted from the server within 48 hours.

Still open:

1. Should the homepage default language be Thai, English, or follow browser language?
2. Confirm whether specific organization/customer names can be shown publicly, or keep Suite proof anonymous/generic.
