## Page Design Spec: Date Input Template (Desktop-first)

### 0) อ้างอิงหน้าตา
- เป้าหมายคือให้ “ช่องวันที่ + ปฏิทินป๊อปอัป” มีหน้าตาและปฏิสัมพันธ์เหมือนภาพตัวอย่าง (อินพุตขอบมน โทนเรียบ ไอคอนปฏิทินด้านขวา และปฏิทินแบบ grid เปิดใต้ช่อง)

---

## 1) Global Styles (Design Tokens)
- Typography: base 14px, label 12–14px, error 12px
- Input
  - Height: 40px
  - Radius: 8px
  - Border: 1px solid (neutral-300)
  - Focus ring: 2px (primary-400) + border (primary-500)
  - Padding: ซ้าย 12px, ขวา 40px (เผื่อไอคอน)
- Icon button (ปฏิทินด้านขวา)
  - ขนาด 32px, จัดกึ่งกลางแนวตั้ง, hover เป็นพื้นหลังอ่อน
- Colors
  - Primary: ใช้สำหรับวัน selected และ focus
  - Disabled: neutral-100 background + neutral-400 text
  - Error: red-500 text + border red-400

---

## 2) Page/Component Meta Information
- Title (สำหรับคู่มือภายใน): "Date Input Template"
- Description: "มาตรฐานช่องวันที่ทั้งแอป: รูปแบบ dd/MM/yyyy + calendar popover"
- Open Graph (ถ้ามีหน้า internal docs): title/description ตามด้านบน

---

## 3) Component Layout & Structure
### 3.1 Layout
- ใช้ Flexbox ภายในช่องอินพุต
  - ซ้าย: พื้นที่ข้อความวันที่ (input)
  - ขวา: ปุ่มไอคอนปฏิทิน (อยู่ใน input container เดียวกัน)
- Popover ปฏิทิน
  - เปิด “ใต้ช่อง” ชิดซ้าย (left aligned)
  - ความกว้าง: เท่าช่องหรือไม่ต่ำกว่า 280px
  - มีเงาบางๆ + ขอบมน 8px

### 3.2 Sections & Components
**A) Label (optional per field)**
- แสดงเหนือช่อง
- ถ้า required ให้มีเครื่องหมาย *

**B) Input Field**
- Placeholder: "dd/mm/yyyy" (เมื่อยังไม่มีค่า)
- Value display: แสดง `dd/MM/yyyy`
- Right icon: ปฏิทิน

**C) Calendar Popover**
- Header แสดง “เดือน ปี” ตรงกลาง
- ปุ่มนำทางเดือน: ซ้าย/ขวา
- Row วันในสัปดาห์ + Grid วันแบบ 7 คอลัมน์
- สถานะวัน
  - Selected: พื้นหลัง primary + ตัวอักษรสีขาว
  - Today: เน้นด้วยเส้นขอบ/จุด (ไม่แย่ง selected)
  - Disabled (นอก min/max): สีจาง + คลิกไม่ได้
  - Hover: พื้นหลังอ่อน

**D) Helper/Error Text**
- อยู่ใต้ช่อง
- Error ใช้สีแดงและข้อความสั้น เช่น “กรุณาเลือกวันที่”

---

## 4) Interaction & Behavior (ตามภาพ)
- เปิดปฏิทินเมื่อ:
  - คลิกที่ช่อง
  - คลิกไอคอนปฏิทิน
  - โฟกัสแล้วกด Enter/Space
- ปิดปฏิทินเมื่อ:
  - เลือกวันสำเร็จ
  - กด Esc
  - คลิกนอก popover
- การพิมพ์ด้วยคีย์บอร์ด (ต้องรองรับ)
  - อนุญาตพิมพ์ dd/MM/yyyy และ validate ทันทีเมื่อ blur
  - ถ้าพิมพ์ไม่ถูก format ให้แสดง error
- ค่าที่ส่งออกไปฟอร์ม (เพื่อความสม่ำเสมอทั้งแอป)
  - เก็บเป็น `YYYY-MM-DD` (string) ใน form state
  - แปลงเป็น `dd/MM/yyyy` เฉพาะตอนแสดงผล

---

## 5) Responsive (Desktop-first)
- Desktop: popover วางใต้ช่องตามปกติ
- Tablet/Mobile: popover ยังใช้ได้ แต่ควรจำกัดความกว้างให้พอดี viewport และเลี่ยงการล้นขอบจอ (auto flip/shift)

---

## 6) Shared Component Location (ต้องใช้ร่วมกันทุกหน้า)
- จุดรวมศูนย์คอมโพเนนต์: `src/components/form/DateField/DateField.tsx`
- Export กลาง: `src/components/form/index.ts`
- กติกาการใช้งาน: ทุกหน้าฟอร์ม import จากจุดรวมศูนย์เท่านั้น เพื่อให้ UI/interaction ตรงตามภาพเหมือนกันทั้งแอป
