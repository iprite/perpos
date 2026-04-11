# Page Design Spec: Worker Add/Edit Popup Modal (Desktop-first)

## Meta Information
- Title: "แรงงาน | ExApp" (คงเดิม)
- Description: "จัดการข้อมูลแรงงาน" (คงเดิม)
- OG: คงเดิม

## Global Styles
- ใช้โทเคน/สไตล์เดียวกับระบบเดิมและหน้า Workers ปัจจุบัน
  - Background overlay: ดำโปร่ง ~40–50%
  - Surface (modal): bg-white, border-gray-200, rounded-xl, shadow-lg
  - Typography: title (lg), body (sm), helper/error (xs)
  - Buttons: Primary (บันทึก/อัปเดต), Secondary/Outline (ยกเลิก)

## Layout
- **ยึดแพทเทิร์นเดียวกับ “Edit Representative Popup”**
- Modal แบบ centered
  - Max-width ~960px (desktop), width: min(960px, 92vw)
  - สูงสุด ~80–90vh และเลื่อนเฉพาะภายใน body
- โครงภายในใช้ **CSS Grid 12 คอลัมน์ (desktop)**
  - Left: 4 cols (พื้นที่สรุป/บริบท)
  - Right: 8 cols (ฟอร์มแก้ไข)
- Responsive
  - <768px: เปลี่ยนเป็น stacked (Left อยู่บน, Right อยู่ล่าง), ปุ่มอยู่แถบล่างแบบเต็มกว้าง

## Page Structure
1) Trigger (บนหน้า /workers)
2) Modal Overlay
3) Modal Container
   - Header
   - Body (Grid 12)
   - Footer actions

## Sections & Components

### 1) Trigger (หน้า /workers)
- ปุ่ม “เพิ่มแรงงาน” → เปิดโมดัลโหมดเพิ่ม
- คลิกแถวแรงงาน → เปิดโมดัลโหมดแก้ไข (prefill)
- Employer: ไม่แสดงปุ่มเพิ่ม และแถวไม่เปิดแก้ไข (คงสิทธิ์เดิม)

### 2) Modal Header
- Title
  - โหมดเพิ่ม: “เพิ่มแรงงาน”
  - โหมดแก้ไข: “แก้ไขแรงงาน”
- ปุ่ม Close (X) มุมขวาบน

### 3) Modal Body (Grid 12)
#### 3.1 Left Section (4 cols)
- Card “สรุปแรงงาน” (แสดงจากข้อมูลเดิม ไม่เพิ่มฟิลด์ใหม่)
  - Full name (ตัวหนา)
  - Passport No. (ถ้ามี)
  - สัญชาติ (ถ้ามี)
- โหมดเพิ่ม: แสดง placeholder เช่น “กรอกข้อมูลเพื่อดูสรุป”

#### 3.2 Right Section (8 cols) — ฟอร์ม (คงฟิลด์เดิม)
- ฟิลด์
  1) ชื่อ-นามสกุล (required)
  2) ลูกค้า (select)
  3) Passport No. (optional)
  4) สัญชาติ (optional)
- Validation/Feedback
  - error แสดงใต้ฟิลด์แบบ inline (คงพฤติกรรมเดิม)
  - ขณะบันทึก: disable ปุ่ม และแสดงสถานะ loading บนปุ่ม Primary

### 4) Modal Footer actions
- Secondary/Outline: “ยกเลิก” (ปิดโมดัล)
- Primary:
  - โหมดเพิ่ม: “บันทึก”
  - โหมดแก้ไข: “อัปเดต”
- (ถ้ามีตามสิทธิ์เดิม) ปุ่ม “ลบ” แสดงเฉพาะโหมดแก้ไข และเป็น Danger style

## Interaction States
- เปิดโมดัล: focus อยู่ที่ฟิลด์ “ชื่อ-นามสกุล”
- ปิดโมดัล: กด X / กด “ยกเลิก” / บันทึกสำเร็จ
- หลังบันทึกสำเร็จ: ปิดโมดัลและอัปเดตตารางรายการทันที
