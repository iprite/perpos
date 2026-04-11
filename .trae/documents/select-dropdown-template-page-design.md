## Page Design Spec: Select/Dropdown Default Template (Desktop-first)

### 0) อ้างอิงหน้าตา
- เป้าหมายคือให้ “Select/Dropdown” มีหน้าตาเหมือนภาพที่แนบ 100%: มี label ด้านบน, ช่องเลือกพื้นหลังขาวขอบเทาอ่อนขอบมน, placeholder สีเทา, ไอคอนลูกศรลงด้านขวา, และ dropdown menu เปิดใต้ช่องพร้อมรายการ option แบบ list

---

## 1) Global Styles (Design Tokens)
> โทนสีให้ยึดจากระบบสีเดิมของแอป (tailwind gray/neutral) แต่ค่าด้านล่างคือค่ามาตรฐานที่ต้องคุมให้เหมือนภาพ

### Typography
- Base text (value/option): 14px, font-weight 400
- Label: 12px, font-weight 500
- Helper/Error: 12px

### Select Field (ตัวกล่อง)
- Height: 44px
- Radius: 8px
- Background: white
- Border: 1px solid neutral-200 (default)
- Padding:
  - ซ้าย: 12px
  - ขวา: 40px (เผื่อไอคอนลูกศร)
- Right icon (chevron-down): 16px, สี neutral-400, จัดกึ่งกลางแนวตั้ง

### Dropdown Menu (รายการ)
- Placement: เปิด “ใต้ช่อง” ชิดซ้าย
- Width: เท่ากับช่อง Select
- Radius: 8px
- Border: 1px solid neutral-200
- Shadow: เงาบางๆ (ระดับ popover)
- Inner padding: 8px (p-2)
- Item spacing: gap 4px (gap-1)
- Max height: 240px แล้ว scroll

### Option Item
- Height: 40px
- Radius: 6px
- Padding: 10px 12px
- Default text: neutral-900
- Hover background: neutral-50
- Selected background: neutral-100 (และ text เป็น neutral-900, font-weight 500)

### States
- Hover (field): border neutral-300
- Focus (field): border primary-500 + ring 2px primary-200 (ตามระบบธีม)
- Open (field): เหมือน focus และ icon หมุน 180° (ถ้า library รองรับ)
- Disabled: bg neutral-100, text neutral-400, border neutral-200, cursor not-allowed, icon neutral-300
- Error: border red-400, ring red-100, แสดงข้อความ error ใต้ช่องด้วยสี red-500

---

## 2) Page/Component Meta Information
- Title (สำหรับคู่มือภายใน): "Select/Dropdown Default Template"
- Description: "มาตรฐาน Select ทั้งแอปให้หน้าตา/พฤติกรรมเหมือนภาพ และใช้ซ้ำจากจุดรวมศูนย์เดียว"
- Open Graph (ถ้ามีหน้า internal docs): title/description ตามด้านบน

---

## 3) Component Layout & Structure

### 3.1 Layout
- โครงสร้างรวมเป็นแนวตั้ง (Stack)
  1) Label (ถ้ามี)
  2) Field container (ใช้ Flexbox)
     - ซ้าย: พื้นที่ข้อความ (placeholder/value)
     - ขวา: ไอคอนลูกศร (absolute หรือ flex-end)
  3) Helper/Error text (ถ้ามี)
- Dropdown menu เป็น popover ที่ anchor กับ field และเปิดลงล่าง

### 3.2 Sections & Components
**A) Label (optional per field)**
- แสดงเหนือ field
- ข้อความตามภาพ: "Label"
- ระยะห่าง label -> field: 6px

**B) Field (Trigger/Input-like)**
- แสดง placeholder ตามภาพ: "Placeholder" เมื่อยังไม่มีค่า
- เมื่อเลือกค่าแล้ว ให้แสดงเป็นข้อความสีเข้ม (neutral-900)
- คลิกได้ทั้งพื้นที่ field

**C) Chevron Icon (ด้านขวา)**
- แสดงลูกศรลง (chevron)
- ไม่กินพื้นที่ข้อความ (กันด้วย padding-right)

**D) Dropdown Menu (Listbox)**
- เปิดใต้ช่อง, กว้างเท่าช่อง
- ภายในเป็นรายการ option แบบ stacked list
- ตัวอย่างข้อความตามภาพ: "Option"

**E) Helper/Error (optional)**
- แสดงใต้ช่อง
- Error ต้องใช้สีแดงและข้อความสั้น

---

## 4) Interaction & Behavior (ตามภาพ)
- เปิด dropdown เมื่อ:
  - คลิกที่ field
  - โฟกัสแล้วกด Enter/Space
- ปิด dropdown เมื่อ:
  - เลือก option สำเร็จ (ปิดทันที)
  - กด Esc
  - คลิกนอก dropdown
- Keyboard navigation:
  - ↑/↓ ย้าย active option
  - Enter เลือก
  - Tab ย้ายโฟกัสออก (ควรปิด dropdown)
- Scroll behavior:
  - ถ้า options เกิน max-height ให้ scroll ภายใน dropdown (ไม่ให้หน้าเว็บ scroll แทน)

---

## 5) Responsive (Desktop-first)
- Desktop/Tablet: dropdown เปิดลงล่างเป็นหลัก
- Mobile: ถ้าพื้นที่ด้านล่างไม่พอ ให้อนุญาต popover shift/flip เพื่อไม่ล้นขอบจอ (แต่ยังต้องคงความกว้างและสไตล์เดิม)

---

## 6) Shared Component Location (ต้องใช้ร่วมกันทุกหน้า)
**จุดรวมศูนย์คอมโพเนนต์ (Single source of truth):**
- `packages/isomorphic-core/src/ui/app-select.tsx`

**แนวทาง export/import ให้ใช้ซ้ำทั้งแอป:**
- ทุกหน้าให้ import จาก: `@core/ui/app-select`
- ภายใน `app-select.tsx` เป็นที่เดียวที่อนุญาตให้ import `Select` จาก `rizzui`

**ค่า default ที่ต้องถูกล็อกใน AppSelect เพื่อให้เหมือนภาพทุกหน้า:**
- `className`: คุมความสูง/ขอบ/มุม/สีตัวอักษร/ระยะ padding ของ field
- `labelClassName`: คุมขนาด/น้ำหนัก/สีของ label
- `dropdownClassName`: `p-2 grid gap-1` + z-index ระดับ popover (เช่น `!z-50`)
- `optionClassName` (ถ้า library รองรับ): คุม height 40px, radius 6px, padding 10x12, hover/selected styles

**ข้อห้าม:**
- ห้ามตั้ง class กระจัดกระจายในแต่ละหน้าเพื่อ “แก้ให้เหมือนภาพ” (ต้องแก้ที่ AppSelect เท่านั้น)
