# Page Design Spec: หน้าจัดการออเดอร์ (ทีมปฏิบัติการ)

## Global Styles (Desktop-first)
- Layout system: Flexbox + CSS Grid (ตารางข้อมูล), container กว้างสูงสุด 1200–1360px, ระยะห่างหลัก 8/12/16/24px
- Color tokens
  - Background: #0B1220 (slate-950) หรือ #0F172A
  - Surface/Card: #111827
  - Primary: #2563EB (ปุ่มหลัก)
  - Success: #16A34A (สถานะเสร็จสิ้น)
  - Warning: #F59E0B (ยอดคงค้าง/รอยืนยัน)
  - Danger: #DC2626 (ปุ่มย้อนสถานะ/คำเตือน)
  - Text: #E5E7EB, Muted: #9CA3AF
- Typography: 14px base, heading 20/24/28, ใช้ tabular numerals กับจำนวนเงิน
- Buttons
  - Primary: solid, hover เข้มขึ้น 8%, disabled ลด opacity + cursor-not-allowed
  - Secondary: outline
  - Destructive: solid แดง + confirm modal
- Tables: sticky header, zebra rows, row hover highlight
- Responsive
  - >=1024px: แสดง 2 คอลัมน์ในหน้าจัดการออเดอร์ (รายละเอียด + แผงการกระทำ)
  - <1024px: stack เป็นคอลัมน์เดียว, action panel ย้ายไว้บนสุดแบบ collapsible

---

## Page 1: หน้าเข้าสู่ระบบ
### Layout
- Centered card (max-width 420px) บนพื้นหลังเรียบ + subtle gradient
- ใช้ Flexbox จัดกึ่งกลางทั้งแนวตั้ง/แนวนอน

### Meta Information
- Title: เข้าสู่ระบบ | จัดการออเดอร์
- Description: เข้าสู่ระบบสำหรับทีมปฏิบัติการเพื่อจัดการออเดอร์
- Open Graph: title/description ตามด้านบน

### Page Structure
1) Brand/Header (โลโก้/ชื่อระบบ)
2) Login Card
3) Help text (ติดต่อแอดมิน/ลืมรหัสผ่าน ถ้ามีนโยบาย)

### Sections & Components
- Form fields
  - Email
  - Password (toggle show/hide)
- Primary CTA: “เข้าสู่ระบบ”
- Error states
  - Inline error ใต้ field
  - Global alert บน card เมื่อ login fail
- Loading state: ปุ่มแสดง spinner และ disable

---

## Page 2: หน้ารายการออเดอร์
### Layout
- Top app bar + content area
- ใช้ Grid: แถวบนเป็น Filter Bar, แถวถัดมาเป็น Summary + Table

### Meta Information
- Title: รายการออเดอร์ | จัดการออเดอร์
- Description: ค้นหาและติดตามสถานะออเดอร์สำหรับงานปฏิบัติการ

### Page Structure
1) Top Navigation
2) Filter/Search Bar
3) Summary KPIs
4) Orders Table

### Sections & Components
- Top Navigation
  - ชื่อหน้า “รายการออเดอร์”
  - ปุ่ม “ออกจากระบบ”
- Filter/Search Bar
  - Search input (placeholder: “ค้นหาเลขออเดอร์/ชื่อลูกค้า/เบอร์โทร…”) + ปุ่มค้นหา
  - Dropdown: สถานะออเดอร์ (ทั้งหมด/เปิด/ปิด)
  - Dropdown: ความคืบหน้าบริการ (ทั้งหมด/ยังไม่เริ่ม/กำลังทำ/เสร็จหมด)
  - Quick reset “ล้างตัวกรอง”
- Summary KPIs (การ์ด 3–4 ใบ)
  - ออเดอร์เปิดทั้งหมด
  - ออเดอร์ที่มียอดคงค้าง
  - ออเดอร์ที่บริการยังไม่เสร็จ
- Orders Table
  - Columns: เลขออเดอร์, ลูกค้า, บริการเสร็จ/ทั้งหมด, ยอดรวม, ยอดคงค้าง, สถานะ, อัปเดตล่าสุด, Action
  - Row action: ปุ่ม “จัดการ” (ไป /orders/:orderId)
  - Empty state: แนะนำปรับตัวกรอง
  - Pagination (ถ้าจำนวนมาก): page size 20/50

---

## Page 3: หน้าจัดการออเดอร์
### Layout
- Desktop: Two-column
  - Left (70%): รายละเอียด + ตารางบริการ + ประวัติ
  - Right (30% sticky): Action Panel (ยืนยันชำระ, เช็กลิสต์ปิดออเดอร์, ปิดออเดอร์)
- ใช้ CSS Grid แบ่งคอลัมน์ และ sticky sidebar

### Meta Information
- Title: จัดการออเดอร์ #{order_no} | จัดการออเดอร์
- Description: อัปเดตสถานะบริการ ยืนยันการชำระ และปิดออเดอร์

### Page Structure
1) Breadcrumbs: รายการออเดอร์ > จัดการออเดอร์
2) Order Header Summary
3) Services Section
4) Payment/Outstanding Section (ใน Action Panel)
5) Close Order Checklist + CTA
6) Status Timeline

### Sections & Components
- Order Header Summary (Card)
  - ข้อมูล: เลขออเดอร์, ลูกค้า, เบอร์โทร
  - Financial: ยอดรวม, ชำระแล้ว, ยอดคงค้าง (เน้นสี warning ถ้า >0)
  - Badge สถานะออเดอร์: เปิด/ปิด

- Services Section
  - Table หรือ Card list
  - Columns: บริการ, ผู้รับผิดชอบ, สถานะ, เวลาเริ่ม, เวลาเสร็จ, Actions
  - Actions ต่อบริการ
    - “เริ่มดำเนินการ” (enabled เมื่อสถานะ = not_started)
    - “เสร็จสิ้น” (enabled เมื่อสถานะ = in_progress)
  - Confirmation: modal สำหรับ “เสร็จสิ้น” (กันกดพลาด)
  - Inline toast เมื่อบันทึกสำเร็จ/ล้มเหลว

- Action Panel: ยืนยันชำระยอดคงค้าง
  - แสดงยอดคงค้างปัจจุบัน
  - รายการชำระเงินที่รอยืนยัน (status = pending)
    - แสดง amount/method/reference/created_at
    - ปุ่ม “ยืนยันชำระ” ต่อรายการ (confirm modal)
  - เมื่อยืนยันแล้ว อัปเดตยอดคงค้างและ badge สถานะทันที

- Close Order Checklist
  - Checkbox (read-only) 3 ข้อ
    1) ทุกบริการเสร็จสิ้น
    2) ยอดคงค้าง = 0
    3) ไม่มีรายการชำระรอยืนยัน
  - Hint/Reason box เมื่อยังไม่ครบ (เช่น “บริการ X ยังไม่เสร็จ” หรือ “มียอดคงค้าง 1,200 บาท”)

- Close Order CTA
  - ปุ่ม Primary “ปิดออเดอร์”
  - Disabled จนกว่า checklist ผ่านทั้งหมด
  - Success state: แสดง banner “ปิดออเดอร์แล้ว” + lock UI (ปุ่มเปลี่ยนสถานะถูก disable)

- Status Timeline
  - Vertical timeline แสดงเหตุการณ์: เริ่ม/เสร็จบริการ, ยืนยันชำระ, ปิดออเดอร์
  - แต่ละ event แสดง: เวลา, ผู้ดำเนินการ, รายละเอียดสั้น
