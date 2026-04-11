# Page Design Spec: หน้าแรงงาน (Workers)

## Layout
- Desktop-first: โครงหน้าเป็น stacked sections (หัวหน้า → ฟอร์ม (toggle) → ตาราง)
- ใช้ Flexbox สำหรับ header actions (ซ้าย=title, ขวา=buttons) และใช้ CSS Grid สำหรับตารางแบบกำหนดสัดส่วนคอลัมน์ (คล้ายหน้า Services)
- Breakpoints
  - Desktop (>=1024px): ตารางเป็นหลายคอลัมน์ชัดเจน, แถวคลิกได้ทั้งแถว
  - Tablet/มือถือ: ลดคอลัมน์/ยุบข้อมูลรองลงบรรทัดที่ 2 ภายใน cell (ยังคงอ่านได้)

## Meta Information
- Title: "แรงงาน | ExApp"
- Description: "จัดการข้อมูลแรงงานและนำเข้าไฟล์ CSV"
- Open Graph
  - og:title: "แรงงาน"
  - og:description: "รายการแรงงานและนำเข้า CSV"

## Global Styles
- Background: gray-50 ของระบบเดิม
- Surface: การ์ด/ตารางพื้นขาว (bg-white), ขอบ (border-gray-200), มุมโค้ง (rounded-xl)
- Typography: เน้น Title ขนาด lg, รายละเอียดขนาด sm, ข้อความรองขนาด xs สี gray-500
- Buttons
  - Primary: สำหรับ “บันทึก/ยืนยันนำเข้า”
  - Outline: สำหรับ “รีเฟรช/ยกเลิก/นำเข้า CSV/เพิ่มแรงงาน”
  - Hover/Active: ใช้ pattern เดียวกับ Services (hover:bg-gray-100, active:bg-gray-200 สำหรับแถว)
- Feedback
  - Error banner: bg-red-50 + border-red-200 + text-red-700
  - Success/summary: แนะนำใช้ style กลุ่มเดียวกับ error แต่เป็นโทนเขียว (ถ้ามีในระบบ)

## Page Structure
1) Header Area
2) Action Bar (Buttons)
3) Import CSV Modal/Drawer (ซ่อน)
4) Add/Edit Form (ซ่อน เหมือน Services)
5) Workers Table (แถวดีไซน์ใหม่)

## Sections & Components

### 1) Header Area
- Title: "แรงงาน"
- Subtitle: "ข้อมูลแรงงานต่างด้าวและความสัมพันธ์กับลูกค้า"
- การจัดวาง: ซ้ายเป็นข้อความ, ขวาเป็นกลุ่มปุ่ม (desktop อยู่บรรทัดเดียว, mobile เรียงลง)

### 2) Action Bar (Buttons)
- ปุ่ม “รีเฟรช” (แสดงทุกบทบาทที่เข้าหน้าได้)
- ปุ่ม “นำเข้า CSV” (แสดงเฉพาะบทบาทที่เพิ่มได้: admin/operation/representative)
- ปุ่ม “เพิ่มแรงงาน” (แสดงเฉพาะบทบาทที่เพิ่มได้)
- หมายเหตุ: ซ่อน action แบบ “ปุ่มแก้ไขในแถว” ทั้งหมด และใช้การคลิกแถวเพื่อเข้าโหมดแก้ไข (เหมือนหน้า Services)

### 3) Import CSV Modal/Drawer
- เปิดจากปุ่ม “นำเข้า CSV”
- ส่วนประกอบ
  - File Picker (accept .csv)
  - Preview Panel
    - แสดงจำนวนแถวทั้งหมด
    - แสดงตัวอย่าง 5 แถวแรก
    - แสดงรายการ validation errors (ถ้ามี) แบบตาราง: row#, field, reason
  - Options
    - เลือก “ลูกค้าเดียวกันทั้งไฟล์” (กรณี CSV ไม่ระบุลูกค้า)
    - เลือกนโยบายเมื่อพบซ้ำ (ตัวเลือกเดียวตาม PRD เช่น อัปเดต/ข้าม)
  - Actions
    - Primary: “ยืนยันนำเข้า”
    - Outline: “ยกเลิก”
  - Result Summary หลัง import
    - ตัวเลข inserted/updated/skipped/failed
    - ปุ่ม “ปิด” และ “รีเฟรชรายการ”

### 4) Add/Edit Form (Hidden Toggle เหมือน Services)
- ค่าตั้งต้น: ซ่อน
- เปิดได้ 2 ทาง
  1) กด “เพิ่มแรงงาน” → เปิดฟอร์มโหมดเพิ่ม
  2) คลิกแถวแรงงาน → เปิดฟอร์มโหมดแก้ไขและ prefill
- ฟิลด์ (สอดคล้องตาราง workers ที่มีอยู่)
  - ชื่อ-นามสกุล (required)
  - ลูกค้า (select)
  - Passport No. (optional)
  - สัญชาติ (optional)
- ปุ่ม
  - Primary: บันทึก/อัปเดต
  - Outline: ยกเลิก
  - (ถ้ามีตามสิทธิ์และต้องการ) Outline: ลบ (แสดงเฉพาะโหมดแก้ไข)

### 5) Workers Table (Row Layout Redesign)
- Table Header: แสดงคอลัมน์หลักเดิม: แรงงาน, ลูกค้า, Passport, สัญชาติ
- Row Behavior
  - ทั้งแถว clickable (role="button", tabIndex=0) เพื่อเปิดแก้ไข
  - Hover/Active states เหมือนหน้า Services
- Visual Redesign ของ cell
  - คอลัมน์ “แรงงาน”: บรรทัด 1 = full_name ตัวหนา, บรรทัด 2 (ถ้ามี) = passport_no แบบ text-xs สีเทา
  - คอลัมน์ “ลูกค้า”: บรรทัด 1 = ชื่อลูกค้า, บรรทัด 2 = customer_id แบบ text-xs (เฉพาะกรณีหา name ไม่เจอ)
  - คอลัมน์ “Passport”: แสดง passport_no (หรือ “-”)
  - คอลัมน์ “สัญชาติ”: แสดง nationality (หรือ “-”) และสามารถทำเป็น badge เล็กได้ถ้าตรงกับ design system

## Interaction States
- Loading: ปิดปุ่มหลัก (disabled) และแสดงข้อความ “กำลังโหลด...” ในพื้นที่ตารางเมื่อ rows ว่าง
- Error: banner ด้านบนตาราง (คง pattern เดิม)
- CSV Import errors: แสดงใน modal พร้อมระบุแถว/เหตุผล และไม่อนุญาตให้กดยืนยันถ้ายังมี error ที่เป็น blocking
