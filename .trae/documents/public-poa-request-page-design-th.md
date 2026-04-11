# Page Design Spec: Public POA Request (Desktop-first)

## Global Styles (ทั้งแอป)
- Design tokens
  - Background: #F7F8FA
  - Surface/Card: #FFFFFF
  - Primary: #1D4ED8
  - Success: #16A34A
  - Danger: #DC2626
  - Text primary: #111827, secondary: #6B7280
  - Border: #E5E7EB
  - Radius: 10px (card), 8px (inputs/buttons)
  - Spacing scale: 4/8/12/16/24/32
- Typography
  - H1 28/36 semibold, H2 20/28 semibold, Body 14/22 regular, Caption 12/18
- Buttons
  - Primary: filled primary + hover darken 5–8%
  - Secondary: outline border + hover background #F3F4F6
  - Disabled: opacity 50% + cursor not-allowed
- Form states
  - Default: border #E5E7EB
  - Focus: ring primary 2px
  - Error: border danger + helper text สี danger

---

## Page 1: หน้า Public ยื่นคำขอ POA

### Meta Information
- Title: ยื่นคำขอ POA (Public)
- Description: แบบฟอร์มยื่นคำขอ POA สำหรับตัวแทนโดยไม่ต้องล็อกอิน
- Open Graph
  - og:title: ยื่นคำขอ POA
  - og:description: กรอกข้อมูลให้ครบและส่งให้ Operation ดำเนินการ

### Layout
- Desktop-first: centered container กว้าง 960px (max), padding 24px
- ใช้ CSS Grid แบบ 12 คอลัมน์
  - ซ้าย 8 คอลัมน์: ฟอร์มหลัก
  - ขวา 4 คอลัมน์: การ์ด “คำแนะนำ/สรุปความครบถ้วน” (sticky เมื่อ scroll)
- Tablet/มือถือ: ซ้อนเป็นคอลัมน์เดียว (ฟอร์มก่อน แล้วคำแนะนำตาม)

### Page Structure
1) Top bar แบบเรียบง่าย (ไม่มีเมนูซับซ้อน)
2) Header section
3) Main form (card)
4) Side help/summary (card)
5) Footer (ข้อความติดต่อ/หมายเหตุสั้น ๆ)

### Sections & Components

#### 1) Top Bar
- ซ้าย: โลโก้/ชื่อระบบ (คลิกแล้วรีเฟรชหน้า)
- ขวา: ปุ่ม “เริ่มใหม่” (ล้างฟอร์ม) แบบ secondary

#### 2) Header Section
- H1: “ยื่นคำขอ POA”
- Subtitle: “เลือกชื่อตัวแทน กรอกข้อมูลให้ครบ แล้วส่งให้ Operation”
- Info callout (สีพื้น #EFF6FF): bullet 2–3 ข้อ เช่น “ช่องที่มี * จำเป็นต้องกรอก”

#### 3) Main Form Card
- ส่วน A: เลือกชื่อตัวแทน
  - Component: Select dropdown (ค้นหาได้)
  - State: loading skeleton ระหว่างดึงรายการ, empty state ถ้าไม่มีรายการ
  - Validation: ถ้าไม่เลือก ให้ขึ้น error ใต้ช่อง

- ส่วน B: ข้อมูลผู้ยื่นคำขอ
  - Text input: ชื่อผู้ยื่น (required)
  - Text input: เบอร์โทร (optional/หรือ required ตามที่กำหนดภายหลัง)
  - Email input: อีเมล (optional/หรือ required ตามที่กำหนดภายหลัง)

- ส่วน C: รายละเอียดคำขอ POA
  - Text input: หัวข้อ/เรื่อง (required)
  - Textarea: รายละเอียดเพิ่มเติม (optional)

- ส่วน D: สรุปก่อนส่ง
  - Read-only summary block: แสดงค่าที่กรอกสำคัญ (agent, ชื่อผู้ยื่น, หัวข้อ)

- ส่วน E: Action bar
  - Primary button: “ยืนยันและส่งคำขอ”
  - Secondary button: “บันทึกฉบับร่าง (ในหน้านี้)” *หมายถึงเก็บใน state ของหน้าเดียว ไม่ต้องมีบัญชีผู้ใช้*
  - Loading state: ปุ่ม primary แสดง spinner + ปิดการกดซ้ำ
  - Error banner (top of card): แสดงข้อผิดพลาดจากระบบเมื่อส่งไม่สำเร็จ

#### 4) Side Help/Summary Card (Sticky)
- Checklist ความครบถ้วน: แสดงว่าเลือกตัวแทนแล้ว/กรอก required แล้วหรือยัง
- ข้อความสั้น: “หลังส่งแล้ว ระบบจะแสดงเลขอ้างอิง”

#### 5) Footer
- Caption: “หากมีปัญหาในการส่งคำขอ โปรดติดต่อทีม Operation”

### Interaction & Validation
- Validate แบบ real-time หลัง blur และก่อน submit
- Scroll-to-first-error เมื่อกดส่งแล้วไม่ผ่าน
- Prevent duplicate submit ด้วยการ lock ปุ่มระหว่าง request

---

## Page 2: หน้าแสดงผลการส่งคำขอสำเร็จ

### Meta Information
- Title: ส่งคำขอสำเร็จ
- Description: แสดงเลขอ้างอิงคำขอ POA และขั้นตอนถัดไป

### Layout
- Container กว้าง 720px (max), centered
- Stacked sections (แนวตั้ง)

### Sections & Components
1) Success header
- Icon/Badge สีเขียว + H1 “ส่งคำขอสำเร็จ”

2) Reference card
- แสดง “เลขอ้างอิง” ตัวใหญ่ (monospace)
- ปุ่ม “คัดลอกเลขอ้างอิง” (แสดง toast “คัดลอกแล้ว”)

3) Summary card
- แสดง: ชื่อตัวแทน, วันที่/เวลา (submitted_at), หัวข้อ

4) Next steps
- ข้อความ: “Operation จะรับเรื่องไปดำเนินการต่อ”
- ปุ่ม: “ส่งคำขอใหม่” (ลิงก์กลับ /poa-request)

### Interaction
- Copy-to-clipboard feedback ด้วย toast
