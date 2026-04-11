# Page Design Spec: หน้าแก้ไขออเดอร์ (ผูกช่างกับบริการ + ล็อกจาก Quote)

## 1) Layout
- Desktop-first: โครงหลักแบบ 2 คอลัมน์ (CSS Grid)
  - คอลัมน์ซ้าย (Main, ~8/12): รายการบริการ + การมอบหมายช่าง + รายละเอียดงาน
  - คอลัมน์ขวา (Side panel, ~4/12): สถานะ, ข้อมูลลูกค้า, การเงิน, ประวัติการเปลี่ยนแปลงย่อ
- แถบปุ่มหลัก (Sticky Header Action Bar): ใช้ Flexbox ตรึงด้านบนเมื่อเลื่อน
- Responsive (Tablet/มือถือ): ยุบเป็นคอลัมน์เดียวเรียงจากบนลงล่าง โดย Side panel ย้ายไปใต้ส่วนหัว และแถบปุ่มหลักยังคง sticky ที่ด้านล่างหรือด้านบน (เลือกแบบด้านบนเป็นค่าเริ่มต้น)

## 2) Meta Information
- Title: “แก้ไขออเดอร์ #{orderNo}”
- Description: “จัดการสถานะงาน บริการ และการมอบหมายช่างสำหรับออเดอร์”
- Open Graph:
  - og:title = Title
  - og:description = Description

## 3) Global Styles (Design Tokens)
- Background: #F7F8FA (page), #FFFFFF (cards)
- Text: #111827 (primary), #6B7280 (secondary)
- Primary action color: #2563EB (ปุ่มหลัก)
- Danger: #DC2626 (ยกเลิก/ลบ)
- Border: #E5E7EB, radius 10–12px
- Typography scale: 14/16/20/24 (body/label/section title/page title)
- Button states:
  - Primary: solid, hover เข้มขึ้น 5–8%
  - Secondary: outline/ghost
  - Disabled: ลด opacity และ cursor not-allowed
- Read-only fields (locked): background เทาอ่อน + ไอคอนแม่กุญแจ + tooltip สาเหตุ

## 4) Page Structure (Desktop)
1. Sticky Header Action Bar
2. Header Summary Card (Order Overview)
3. Content Grid (Main/Side)

## 5) Sections & Components

### 5.1 Sticky Header Action Bar (ตำแหน่งปุ่มใหม่)
- ซ้าย: Breadcrumbs “รายการออเดอร์ / ออเดอร์ #{orderNo}”
- กลาง: Status pill + “อัปเดตล่าสุด …”
- ขวา (Actions):
  - ปุ่มหลัก (Primary): “บันทึก”
  - ปุ่มรอง: “ยกเลิกการเปลี่ยนแปลง” (ghost)
  - เมนูจุดสามจุด “การทำงานเพิ่มเติม” (dropdown)
    - “ดูใบเสนอราคา”
    - “ปลดล็อกการแก้ไข (Override)” (แสดงเฉพาะ Admin และเมื่อออเดอร์สร้างจาก Quote)
    - “ยกเลิกออเดอร์” (danger, ตามสิทธิ์)
- Behavior:
  - เมื่อมีการแก้ไขใด ๆ ให้แสดง unsaved indicator (จุด/ข้อความ “ยังไม่บันทึก”)
  - ปุ่ม “บันทึก” disabled หากไม่มีการเปลี่ยนแปลงหรือข้อมูลไม่ครบตาม validation

### 5.2 Header Summary Card (Order Overview)
- แถวข้อมูล: Order No, แหล่งที่มา (badge: “สร้างจาก Quote”), ลูกค้า (ชื่อสั้น), วันนัดหมาย, ทีม/ช่างรวม (สรุป)
- หาก “สร้างจาก Quote”:
  - แสดง badge “ล็อกจากใบเสนอราคา” พร้อม tooltip อธิบายว่า “ข้อมูลลูกค้า/การเงิน/บริการแก้ไม่ได้”

### 5.3 Main Column: Services & Worker Linking
#### 5.3.1 Services Section Header
- ชื่อส่วน: “บริการ”
- ขวาบนของส่วน:
  - ปุ่ม “มอบหมายช่างแบบกลุ่ม” (secondary)
  - ปุ่ม “เพิ่มบริการ” (secondary) — แสดงเฉพาะเมื่อไม่ถูกล็อกจาก Quote หรือถูกปลดล็อกแล้ว

#### 5.3.2 Service Item (Card/Row)
ต่อ 1 บริการ แนะนำเป็น Card ที่มีส่วนย่อย:
- ซ้าย: ชื่อบริการ, รายละเอียดสั้น, จำนวน/หน่วย
- กลาง: รายการช่างที่ถูกผูก (chips) แสดงชื่อ + บทบาท
- ขวา (Actions):
  - ปุ่ม “กำหนดช่าง” (primary ในระดับ card แต่เป็นขนาดเล็ก)
  - เมนูย่อย “แก้ไข/ลบ” (ซ่อนเมื่อถูกล็อกจาก Quote)
- Interaction:
  - กด “กำหนดช่าง” เปิด modal/drawer

#### 5.3.3 Assign Worker Modal/Drawer
- ส่วนหัว: “กำหนดช่างให้บริการ: {serviceName}”
- เนื้อหา:
  - Worker multi-select (ค้นหาได้)
  - ต่อช่าง: เลือกบทบาท (หัวหน้าทีม/ผู้ช่วย) (optional)
  - หมายเหตุต่อบริการ (optional)
- ปุ่ม:
  - Primary: “ยืนยันการกำหนดช่าง”
  - Secondary: “ยกเลิก”

#### 5.3.4 Bulk Assignment Flow
- เลือกหลายบริการ (checkbox ต่อบริการ หรือ multi-select list)
- เลือกช่าง (multi-select)
- ยืนยัน → ระบบเพิ่มช่างให้ทุกบริการที่เลือก

### 5.4 Side Panel
#### 5.4.1 Status Panel
- Dropdown/stepper สำหรับสถานะ: Created/Scheduled/In Progress/Completed/Cancelled
- Validation hint:
  - หากกำลังจะเปลี่ยนเป็น “In Progress” และยังไม่มีช่างถูกผูก ให้แสดงข้อความ error ใต้ปุ่ม/ฟิลด์สถานะ

#### 5.4.2 Customer Panel (Locked when from Quote)
- ฟิลด์: ชื่อ, โทร, อีเมล, ที่อยู่
- เมื่อ locked: แสดงเป็น read-only + ไอคอนแม่กุญแจ + tooltip

#### 5.4.3 Financial Panel (Locked when from Quote)
- แสดง: ยอดก่อนภาษี/ส่วนลด/ภาษี/ยอดรวม
- เมื่อ locked: read-only ทั้งหมด

#### 5.4.4 Audit/Change Summary (ย่อ)
- แสดงอย่างน้อย: “สถานะล่าสุดเปลี่ยนโดย … เมื่อ …” และ “มีการปลดล็อกหรือไม่”

## 6) Interaction States
- Loading: skeleton ใน header + service list
- Error: inline error ใต้ฟิลด์ + toast บนการบันทึกล้มเหลว
- Success: toast “บันทึกแล้ว”
- Locked state: hover tooltip ชี้แจง และ disable input ชัดเจน
