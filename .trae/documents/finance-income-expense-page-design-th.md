# Page Design Spec: ระบบบันทึกรายรับ/รายจ่าย และ Payment Transactions (Desktop-first)

## Global Styles (ใช้ร่วมทุกหน้า)
- Layout system: Hybrid (CSS Grid สำหรับโครงหน้า + Flexbox สำหรับแถวปุ่ม/ฟอร์ม)
- Max width: 1200px (centered), gutter 24px
- Typography scale: 14/16/20/24 (body/base/section/page title)
- Colors:
  - Background: #0B1220 (app) / #0F172A (panels)
  - Text: #E5E7EB (primary), #94A3B8 (secondary)
  - Accent: #3B82F6 (primary action)
  - Success: #22C55E (income), Danger: #EF4444 (expense)
  - Border: rgba(148,163,184,0.2)
- Buttons:
  - Primary: solid accent, hover +8% brightness
  - Secondary: outline border
  - Destructive: danger color
- Links: accent + underline on hover
- Table: sticky header, zebra rows (optional), monospace for amounts

## 1) หน้ารวมธุรกรรมการเงิน (/finance)
### Layout
- CSS Grid 12 คอลัมน์
  - Row 1: Page header (12)
  - Row 2: Summary cards (12)
  - Row 3: Filters (12)
  - Row 4: Transactions table (12)

### Meta Information
- Title: “ธุรกรรมการเงิน | ระบบรายรับรายจ่าย”
- Description: “ดูและจัดการรายการรายรับ/รายจ่าย และธุรกรรมที่ผูกกับออเดอร์”
- Open Graph: title/description ตามข้างต้น

### Page Structure & Components
1. Header Bar
   - Left: ชื่อหน้า “ธุรกรรมการเงิน”
   - Right: ปุ่ม “บันทึกรายจ่าย” (ไป /finance/expenses/new)
2. Summary Section (Cards 3 ใบ)
   - Card 1: รวมรายรับ (สี success)
   - Card 2: รวมรายจ่าย (สี danger)
   - Card 3: ยอดสุทธิ (รายรับ-รายจ่าย)
   - หมายเหตุ: คำนวณจากชุดข้อมูลที่ถูกกรอง (ช่วงวันที่/ประเภท)
3. Filters Panel
   - Date range picker (เริ่มต้น/สิ้นสุด)
   - Select: ประเภท (ทั้งหมด/รายรับ/รายจ่าย)
   - Select: แหล่งที่มา (ทั้งหมด/ลูกค้า/POA ตัวแทน/งานปฏิบัติการ)
   - Input: ค้นหาอ้างอิง/หมายเหตุ (optional)
4. Transactions Table
   - Columns: วันที่, ประเภท, แหล่งที่มา, จำนวนเงิน, สกุลเงิน, ออเดอร์ (แสดงเป็นลิงก์ถ้ามี), อ้างอิง, การกระทำ
   - Row actions: แก้ไข, ลบ
   - Empty state: ข้อความ “ยังไม่มีธุรกรรมในช่วงที่เลือก”

### Interaction States
- Loading: skeleton rows + disabled filters
- Validation error: banner สี danger บอกข้อความสั้น

## 2) หน้าออเดอร์ (ส่วนการเงินในหน้าออเดอร์) (/orders/:orderId)
### Layout
- หน้าหลักของออเดอร์เป็นโครงเดิม
- ส่วน “การเงิน” แนะนำเป็น Tab หรือ Section แบบ Card stack

### Meta Information
- Title: “ออเดอร์ #{orderId} | การเงิน”
- Description: “บันทึกรายรับ/รายจ่ายและดูกำไรสุทธิของออเดอร์”

### Page Structure & Components (เฉพาะส่วนการเงิน)
1. Finance Summary Bar
   - KPI 3 ช่อง: รวมรายรับ, รวมรายจ่าย, กำไรสุทธิ
   - สี: รายรับ=success, รายจ่าย=danger, กำไรสุทธิ=accent/neutral
2. Action Buttons
   - ปุ่ม “เพิ่มรายรับ” (เปิดฟอร์มเพิ่มธุรกรรมแบบ INCOME ผูก order_id)
   - ปุ่ม “บันทึกรายจ่าย” (ลิงก์ไป /finance/expenses/new?orderId=:orderId)
3. Order Transactions Table
   - แสดงเฉพาะรายการที่ order_id = current
   - Columns: วันที่, ประเภท, แหล่งที่มา, จำนวนเงิน, อ้างอิง, หมายเหตุ, การกระทำ

### Responsive Behavior (desktop-first)
- Desktop: KPI 3 ช่องเรียงแนวนอน
- Tablet/มือถือ: KPI เรียงแนวตั้ง, ตารางเป็น horizontal scroll

## 3) หน้าบันทึกรายจ่าย (/finance/expenses/new)
### Layout
- Two-column form (desktop)
  - Left: รายละเอียดหลัก
  - Right: การผูกออเดอร์ + สรุปก่อนบันทึก
- Mobile: single column

### Meta Information
- Title: “บันทึกรายจ่าย | ระบบรายรับรายจ่าย”
- Description: “สร้างรายการรายจ่ายงานปฏิบัติการ พร้อมเลือกผูกออเดอร์ได้”

### Sections & Components
1. Form Header
   - ชื่อ “บันทึกรายจ่าย”
   - แสดง breadcrumb: ธุรกรรมการเงิน > บันทึกรายจ่าย
2. Expense Form (required fields ชัดเจน)
   - วันที่รายจ่าย (required)
   - จำนวนเงิน (required; input แบบ number + format)
   - สกุลเงิน (default THB)
   - แหล่งที่มา (locked เป็น “งานปฏิบัติการ”)
   - อ้างอิง/เลขที่เอกสาร (optional)
   - หมายเหตุ (textarea optional)
3. Order Linkage Panel
   - ถ้ามาจากหน้าออเดอร์: แสดง orderId และล็อกค่า (แก้ได้ถ้าต้องการ “ยกเลิกผูก”)
   - ถ้ามาจากหน้ารวม: ช่องค้นหา/เลือกออเดอร์ (optional) + toggle “ไม่ผูกออเดอร์”
4. Submit Area
   - ปุ่ม Primary: “บันทึก”
   - ปุ่ม Secondary: “ยกเลิก” (กลับหน้าก่อนหน้า)

### Validation & Feedback
- แจ้งเตือน inline ใต้ช่องที่ผิด (วันที่/จำนวนเงิน)
- สำเร็จ: toast “บันทึกรายจ่ายแล้ว” และ redirect กลับหน้าต้นทาง (หน้าออเดอร์หรือหน้ารวม)
