# Page Design Spec: ใบเสนอราคา (Quotation) บน /quotes (Desktop-first)

## Global Styles (Design Tokens)
- Base grid/spacing: 4px scale (4/8/12/16/24/32)
- Typography: H1 24/32, H2 18/28, Body 14/22, Caption 12/18
- Color:
  - Background: #0B1220 (app shell) หรือ #F7F8FA (light)
  - Surface/Card: #111A2E หรือ #FFFFFF
  - Primary: #2563EB
  - Success: #16A34A, Warning: #F59E0B, Danger: #DC2626
  - Border: rgba(148,163,184,0.25)
- Buttons: Primary (filled), Secondary (outline), Tertiary (ghost)
  - Hover: เพิ่มความเข้ม 6–10%, transition 150ms
- Links: Primary + underline on hover
- States: Focus ring 2px (Primary 40%), Disabled opacity 0.5

## Page: /quotes (ใบเสนอราคา)

### 1) Layout
- Layout หลักแบบ **hybrid Flex + CSS Grid**
  - App header (fixed height) + content area
  - Content area แบ่ง 2 คอลัมน์ (Desktop-first):
    - Left: Quote List (table) ~ 55–65%
    - Right: Quote Detail Panel ~ 35–45%
- Responsive behavior:
  - ≥1280px: two-pane คงที่
  - 768–1279px: right panel เป็น drawer slide-in (เปิด/ปิด)
  - <768px (ถ้ามี): stacked view (list → detail)

### 2) Meta Information
- Title: ใบเสนอราคา | {ProductName}
- Description: สร้าง อนุมัติ และดาวน์โหลด PDF ใบเสนอราคา พร้อมติดตามงาน
- Open Graph:
  - og:title = ใบเสนอราคา
  - og:description = Create, approve, export PDF, and convert approved quotes to orders

### 3) Page Structure (Desktop)
1. Top App Header
2. Main Content (Two-pane)
   - Left Pane: Quote List + Filters
   - Right Pane: Quote Detail Panel (tabs)

---

## A) Top App Header
**Components**
- Left: Page title “ใบเสนอราคา”
- Right: CTA
  - “สร้างใบเสนอราคา” (primary)
  - Indicator “งานเตือน” (badge) → เปิด Reminders Drawer

---

## B) Left Pane: Quote List
**1. Filter Bar**
- Search input: ค้นหาเลขที่ใบเสนอราคา/ชื่อลูกค้า/บริษัท
- Filters (dropdown): Status (Draft/Pending/Approved/Rejected), Date range
- Clear filters

**2. Quote Table**
- Columns (ขั้นต่ำ):
  - Quote No
  - ลูกค้า
  - ยอดรวม
  - สถานะ (chip สีตามสถานะ)
  - Updated
- Row interaction:
  - Click row → เปิด Quote Detail Panel
  - Selected row state (highlight)

**3. Empty / Loading / Error**
- Empty: ข้อความ + ปุ่ม “สร้างใบเสนอราคา”
- Loading skeleton rows
- Error inline + retry

---

## C) Right Pane: Quote Detail Panel
**Header ของ panel**
- Quote No + สถานะ
- Quick actions (แสดง/ซ่อนตามสถานะ):
  - Edit (ถ้า Draft/Pending)
  - ส่งขออนุมัติ (ถ้า Draft)
  - อนุมัติ/ไม่อนุมัติ (ถ้า Pending และคุณมีสิทธิ์)
  - ดาวน์โหลด PDF (ถ้า Approved เป็นค่าเริ่มต้น; อนุญาตดาวน์โหลดได้เสมอหากระบบต้องการ)
  - สร้างออเดอร์ (เฉพาะ Approved)

**Tabs (สำคัญ)**
1) สรุป
2) รายการ
3) ติดตามงาน

### Tab 1: สรุป
- Customer block: ชื่อ/บริษัท/ช่องทางติดต่อ + ที่อยู่สำหรับออกเอกสาร
- Quote summary card:
  - Valid until
  - Subtotal/Discount/Tax/Grand total
- Approval info:
  - Pending: แสดงผู้รออนุมัติ (ถ้าระบบมี)
  - Approved/Rejected: แสดง approved_by + approved_at

### Tab 2: รายการ (Quote Items)
- Items table:
  - ชื่อรายการ, รายละเอียด, จำนวน, ราคาต่อหน่วย, ยอดรวมต่อบรรทัด
- Footer summary: รวมยอด
- Interactions:
  - Add/Remove/Edit row (ถ้าแก้ไขได้ตามสถานะ)

### Tab 3: ติดตามงาน (Follow-ups & Reminders)
**Section 3.1 Add follow-up**
- Button group: Call / Email / Meeting / Task
- Modal fields (ขั้นต่ำ): Type, Subject (required), Notes, Due date/time (optional), Reminder time (optional), Assignee (optional)

**Section 3.2 Timeline/List**
- List item:
  - icon ตาม type, subject, timestamp
  - chips: Due (Overdue/Today/Upcoming), Completed
  - actions: Mark complete, Edit

---

## D) Reminders Drawer (In-app)
**Placement**
- เปิดจาก badge ใน header

**Content**
- Group: Overdue / Today / Next 7 days
- แต่ละรายการคลิกแล้วพาไปเปิด Quote Detail Panel ใบนั้น

---

## Modals/Drawers (Shared UI)
1) Create/Edit Quote Modal/Drawer
- Sections: Customer info, Items editor, Terms/Valid until
- Footer: Cancel / Save

2) Approve/Reject Confirm Dialog
- แสดงสรุปยอดรวม + ปุ่มยืนยัน

3) Create Order Confirm Dialog
- สรุปว่าจะสร้างออเดอร์จากใบเสนอราคานี้ และเปิดไปหน้ารายละเอียดออเดอร์หลังสร้างสำเร็จ