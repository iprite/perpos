# Page Design Spec: แดชบอร์ดคำสั่งซื้อรายเดือน (Desktop-first)

## Global Styles
- Design tokens
  - Background: #0B1220 (หรือขาว #FFFFFF หากเป็นธีมสว่าง)
  - Surface/Card: #111A2E / #FFFFFF
  - Primary: #2563EB
  - Success: #16A34A
  - Text primary: #E5E7EB / #111827
  - Text secondary: #9CA3AF / #6B7280
  - Border: rgba(148,163,184,0.2)
- Typography
  - H1 24–28px/700
  - Card metric 32–40px/700
  - Body 14–16px/400
- Buttons/Links
  - ปุ่มหลัก: พื้นหลัง Primary, hover เข้มขึ้น 8–12%
  - ลิงก์: สี Primary, hover underline
- Spacing
  - 8px grid system (8/16/24/32)

## Page: แดชบอร์ดคำสั่งซื้อรายเดือน

### Layout
- Desktop-first ด้วย CSS Grid + Flexbox
- Container กว้างสูงสุด 1200–1280px, จัดกลาง (margin auto), padding 24px
- โครงหลักเป็น 1 คอลัมน์แบบ stacked sections
- การ์ดสรุปใช้ Grid 2 คอลัมน์ (gap 16–24px)
- ส่วนกราฟเป็นการ์ดเต็มความกว้างด้านล่าง

### Meta Information
- Title: "Monthly Orders Dashboard"
- Description: "สรุปยอดและจำนวนคำสั่งซื้อรายเดือน พร้อมกราฟแนวโน้มยอดรายเดือน"
- Open Graph
  - og:title: "Monthly Orders Dashboard"
  - og:description: "Monthly order total, count, and monthly totals chart"
  - og:type: "website"

### Page Structure
1. Top Bar
2. Summary Cards Section (2 cards)
3. Chart Section (1 large card)

### Sections & Components

#### 1) Top Bar
- องค์ประกอบ
  - ชื่อหน้า (H1): “แดชบอร์ดคำสั่งซื้อรายเดือน”
  - คำอธิบายสั้น (secondary text): “สรุปยอด/จำนวนเดือนปัจจุบัน และแนวโน้มยอดรายเดือน”
- การจัดวาง
  - Flex row: ซ้ายเป็น title+subtitle

#### 2) Summary Cards (2 ใบ)
- โครงสร้างการ์ด (ใช้ร่วมกัน)
  - Header: ชื่อการ์ด
  - Metric: ตัวเลขหลัก (เด่น)
  - Helper text: คำกำกับหน่วย เช่น “บาท” หรือ “ออเดอร์”
  - State area: รองรับ loading skeleton / empty / error message (ข้อความสั้น)
- การ์ดที่ 1: “ยอดคำสั่งซื้อรายเดือน”
  - Metric แสดงยอดรวมเดือนปัจจุบัน
  - รูปแบบตัวเลข: แสดงคั่นหลักพัน, ทศนิยม 2 ตำแหน่ง
- การ์ดที่ 2: “จำนวนคำสั่งซื้อรายเดือน”
  - Metric แสดงจำนวนออเดอร์เดือนปัจจุบัน
  - รูปแบบตัวเลข: จำนวนเต็ม

#### 3) Chart Card: กราฟยอดคำสั่งซื้อรายเดือน
- องค์ประกอบ
  - Card header: “ยอดคำสั่งซื้อรายเดือน”
  - Chart area: กราฟเส้นหรือกราฟแท่ง (เลือกแบบเดียวในงานจริง)
  - Tooltip เมื่อ hover จุด/แท่ง แสดง เดือน + ยอดรวม
  - Axis labels: แกน X เป็นเดือน, แกน Y เป็นยอดรวม
  - State area: loading / empty / error
- พฤติกรรม
  - ขณะโหลด: แสดง skeleton ภายในพื้นที่กราฟ
  - ไม่มีข้อมูล: แสดงข้อความ “ไม่มีข้อมูลสำหรับช่วงเดือนนี้”
  - ผิดพลาด: แสดงข้อความ “โหลดข้อมูลไม่สำเร็จ โปรดลองใหม่”

### Responsive Behavior (ขั้นต่ำ)
- <= 768px
  - Summary Cards จาก 2 คอลัมน์เป็น 1 คอลัมน์
  - Padding ลดเหลือ 16px
  - ขนาด Metric ลดลงเล็กน้อยเพื่อไม่ล้น
