# Page Design Spec: Petty Cash (Desktop-first)

## Global Styles (Design Tokens)
- Background: #F7F8FA (app background), #FFFFFF (surface)
- Text: #111827 (primary), #6B7280 (secondary)
- Primary: #2563EB (buttons/links)
- Danger/Alert: #DC2626 (low balance, delete)
- Success: #16A34A (top up success)
- Border: #E5E7EB
- Radius: 12px card, 10px input
- Typography scale:
  - H1 24/32 semibold
  - H2 18/28 semibold
  - Body 14/22 regular
  - Caption 12/18
- Buttons:
  - Primary: filled primary, hover darken 6%, disabled opacity 50%
  - Secondary: white + border, hover bg #F3F4F6
  - Danger: filled danger for destructive actions
- Links: primary color + underline on hover

## Layout & Responsive
- Layout system: Hybrid (CSS Grid for main layout + Flexbox for toolbars/forms)
- Desktop-first container: max-width 1200px, center aligned, padding 24px
- Breakpoints:
  - >= 1024px: 2-column grid where applicable
  - < 1024px: stacked sections, sticky action bar at bottom for primary CTA

---

## 1) หน้าภาพรวมเงินสดย่อย (Route: /)

### Meta Information
- Title: ภาพรวมเงินสดย่อย
- Description: ดูยอดคงเหลือ รายการล่าสุด และสถานะแจ้งเตือนเงินเหลือน้อย
- Open Graph:
  - og:title: Petty Cash Dashboard
  - og:description: Real-time petty cash balance and recent transactions

### Page Structure
- Header (fixed height) + Content (stacked sections)
- Grid:
  - Row 1: Balance Summary (full width)
  - Row 2: 2-column (Recent Transactions | Quick Actions & Status)

### Sections & Components
1. Top App Bar
   - Left: ชื่อระบบ “เงินสดย่อย”
   - Right: ปุ่ม “บันทึกรายการ” (Primary) ลิงก์ไป /transaction/new, ปุ่ม “ตั้งค่า” ไป /settings
2. Balance Summary Card
   - Big number: “ยอดคงเหลือ” (ตัวเลขใหญ่)
   - Sub-metrics: “เติมเงิน (ช่วงเวลา)” และ “ใช้เงิน (ช่วงเวลา)” พร้อมตัวเลือกช่วงเวลา (วันนี้/สัปดาห์นี้/เดือนนี้)
   - Microcopy: “อัปเดตจากรายการล่าสุด”
3. Low Balance Alert Banner
   - เงื่อนไข: แสดงเมื่อยอดคงเหลือ < เกณฑ์
   - Content: ข้อความเตือน + แสดงเกณฑ์ + CTA 2 ปุ่ม
     - “เติมเงินตอนนี้” -> /transaction/new (prefill type=TOP_UP)
     - “ปรับเกณฑ์” -> /settings
   - Visual: icon + red border/background tint (danger)
4. Recent Transactions Panel
   - Table/List (desktop): columns = วันที่, ประเภท, หมวดหมู่, จำนวนเงิน, หมายเหตุ (ย่อ)
   - Row click: เปิด modal/side panel หรือไปหน้าเดียวกันในโหมดแก้ไข (ใช้ route เดิม /transaction/new?edit=:id หรือ modal)
   - Empty state: ข้อความแนะนำ “เริ่มต้นด้วยการเติมเงินหรือบันทึกการใช้” + CTA
5. Quick Actions & Status
   - Cards:
     - “เติมเงิน” -> /transaction/new (TOP_UP)
     - “ใช้เงิน” -> /transaction/new (SPEND)
   - Status card: แสดง “เกณฑ์แจ้งเตือน” และสถานะเปิด/ปิดการแจ้งเตือนในแอป

### Interaction & States
- Loading skeleton สำหรับยอดและรายการ
- Error banner หากโหลดข้อมูลไม่ได้ พร้อมปุ่ม retry
- Toast เมื่อบันทึกสำเร็จ (success) หรือผิดพลาด (danger)

---

## 2) หน้าบันทึกรายการ (เติมเงิน/ใช้เงิน) (Route: /transaction/new)

### Meta Information
- Title: บันทึกรายการเงินสดย่อย
- Description: เติมเงินหรือบันทึกการใช้เงิน พร้อมรายละเอียดและหลักฐาน
- Open Graph:
  - og:title: New Petty Cash Transaction
  - og:description: Record a top-up or spend transaction

### Page Structure
- Two-column on desktop:
  - Left: Form
  - Right: Preview & Tips
- Sticky footer action bar (mobile): Cancel / Save

### Sections & Components
1. Breadcrumbs
   - “ภาพรวม” > “บันทึกรายการ”
2. Transaction Form Card
   - Toggle (segmented control): “เติมเงิน” | “ใช้เงิน”
   - Amount input (required): currency formatting, helper text
   - Date/time picker (required): default now
   - Category select (required when SPEND): dropdown จากหมวดหมู่ที่ active
   - Note textarea (optional)
   - Receipt upload (optional): drag & drop + file picker, แสดงไฟล์ที่แนบ
3. Balance Impact Preview Card (Right column)
   - แสดงยอดคงเหลือปัจจุบัน
   - แสดง “ยอดหลังบันทึก” แบบคำนวณทันที
   - หากจะทำให้ต่ำกว่าเกณฑ์ ให้แสดง warning subtle
4. Actions
   - Primary: “บันทึก”
   - Secondary: “ยกเลิก” กลับ /
   - Destructive (เฉพาะโหมดแก้ไข): “ลบรายการ” + confirm dialog

### Validation & Error Handling
- Amount ต้อง > 0
- SPEND ต้องเลือกหมวดหมู่
- แสดง inline errors ใต้ field

---

## 3) หน้าตั้งค่า & เกณฑ์แจ้งเตือน (Route: /settings)

### Meta Information
- Title: ตั้งค่าเงินสดย่อย
- Description: ตั้งค่าเกณฑ์แจ้งเตือนและจัดการหมวดหมู่
- Open Graph:
  - og:title: Petty Cash Settings
  - og:description: Configure alert threshold and categories

### Page Structure
- Stacked cards (single column) เพื่อความชัดเจน

### Sections & Components
1. Settings Header
   - Title + คำอธิบายสั้น
2. Low Balance Threshold Card
   - Input: จำนวนเงินเกณฑ์ (currency)
   - Helper: “จะแสดงแถบเตือนเมื่อยอดคงเหลือน้อยกว่าเกณฑ์นี้”
   - Save button (primary) หรือ autosave พร้อม status “บันทึกแล้ว/กำลังบันทึก”
3. In-app Notification Card
   - Toggle: เปิด/ปิด
   - Preview: ตัวอย่างแถบแจ้งเตือน
4. Categories Management Card
   - List with inline edit:
     - ชื่อหมวดหมู่
     - สวิตช์ active/inactive
     - drag handle หรือปุ่มเลื่อนขึ้น/ลงเพื่อ sort_order
   - Add category input + button

### Interaction & States
- Confirm dialog เมื่อปิดหมวดหมู่ที่มีการใช้งาน (แจ้งว่าจะมีผลต่อการเลือกในอนาคต)
- Toast เมื่อบันทึกการตั้งค่าสำเร็จ
