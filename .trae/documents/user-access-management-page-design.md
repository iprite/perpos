# Page Design Spec: การจัดการผู้ใช้และสิทธิ์

## Global Styles (Desktop-first)
- Layout system: ใช้ CSS Grid สำหรับโครงหน้าหลัก + Flexbox สำหรับจัดเรียงภายในคอมโพเนนต์
- Breakpoints: Desktop (≥1280px) เป็นหลัก, Tablet (≥768px) ลดคอลัมน์, Mobile (≥375px) เป็น single-column
- Design tokens
  - Background: #0B1220 (page), #0F172A (surface)
  - Text: #E5E7EB (primary), #94A3B8 (secondary)
  - Primary: #3B82F6 (button/link)
  - Danger: #EF4444 (delete)
  - Border: rgba(148,163,184,0.2)
  - Radius: 10px (cards), 8px (inputs)
  - Typography: 14/16/20/24 scale; headings 20–24, body 14–16
- Buttons
  - Primary: solid primary, hover darken 8%
  - Secondary: outline + subtle bg on hover
  - Danger: solid danger, confirm modal ก่อนทำรายการสำคัญ
- Inputs
  - Always show helper/error text ใต้ช่องกรอก
  - Password fields มี toggle แสดง/ซ่อน

---

## 1) หน้าเข้าสู่ระบบ (/login)
### Layout
- Centered card (max-width 420px) บนพื้นหลังเรียบ
- ใช้ Flex column spacing 16px

### Meta Information
- Title: เข้าสู่ระบบ | ระบบจัดการผู้ใช้และสิทธิ์
- Description: เข้าสู่ระบบเพื่อเข้าถึงข้อมูลตามสิทธิ์
- OG: title/description เท่ากับด้านบน

### Page Structure
1. Logo/ชื่อระบบ
2. Login Card

### Sections & Components
- Login Form
  - Email input
  - Password input
  - Primary button “เข้าสู่ระบบ”
  - Inline error banner เมื่อ login ล้มเหลว
- Secondary actions
  - Link “ลืมรหัสผ่าน” → เปิด modal หรือพาไป flow ส่งอีเมลรีเซ็ต (ยังคงอยู่ใน /login ได้)
- Loading states
  - Disable ปุ่มระหว่างกำลังส่งคำขอ

---

## 2) หน้าตั้งรหัสผ่าน/รีเซ็ตรหัสผ่านจากอีเมล (/auth/password)
> ใช้หน้าเดียวรองรับทั้ง “ตั้งรหัสครั้งแรก” และ “รีเซ็ต” โดยอ่านสถานะ/โทเค็นจากลิงก์

### Layout
- Centered card (max-width 520px)
- มี step header แสดงสถานะ: ตรวจสอบลิงก์ → ตั้งรหัส → สำเร็จ

### Meta Information
- Title: ตั้ง/รีเซ็ตรหัสผ่าน | ระบบจัดการผู้ใช้และสิทธิ์
- Description: ตั้งรหัสผ่านใหม่จากลิงก์ที่ส่งทางอีเมล
- OG: title/description เท่ากับด้านบน

### Page Structure
1. Status banner (สำเร็จ/ผิดพลาด/ลิงก์หมดอายุ)
2. Password Form
3. Success panel

### Sections & Components
- Token validation panel
  - แสดงข้อความ: “กำลังตรวจสอบลิงก์…”, “ลิงก์ไม่ถูกต้อง/หมดอายุ”
  - ปุ่มกลับไปหน้าเข้าสู่ระบบเมื่อผิดพลาด
- Password form
  - New password
  - Confirm password
  - Password rules (ขั้นต่ำ) แสดงเป็น bullet list
  - Primary button “บันทึกรหัสผ่าน”
- Success panel
  - ข้อความสำเร็จ + ปุ่ม “ไปหน้าเข้าสู่ระบบ”

---

## 3) หน้าจัดการผู้ใช้และสิทธิ์ (Admin) (/admin/users)
### Layout
- App shell แบบ 2 คอลัมน์
  - Left: Side navigation (กว้าง ~240px)
  - Right: Content area (max-width 1200px, centered)
- Top bar มีชื่อหน้า + action button

### Meta Information
- Title: จัดการผู้ใช้และสิทธิ์ | Admin
- Description: เพิ่ม/ลบผู้ใช้ กำหนดบทบาท ผูกนายจ้าง และจัดทีมตัวแทน
- OG: title/description เท่ากับด้านบน

### Page Structure
1. Header: ชื่อหน้า + ปุ่ม “เพิ่มผู้ใช้”
2. Users table
3. Drawer/Modal: Add/Edit user
4. Confirm modals (Delete/Reset)

### Sections & Components
- Users table (หลัก)
  - Columns: Email, Role, Employer (ถ้ามี), Team (ถ้ามี), Status, Actions
  - Status badge: “รอตั้งรหัส”, “ใช้งานอยู่”, “ปิดใช้งาน”
  - Row actions:
    - “ส่งอีเมลตั้งรหัส” (ถ้ารอตั้งรหัส)
    - “ส่งอีเมลรีเซ็ต”
    - “แก้ไขสิทธิ์/ความสัมพันธ์”
    - “ลบผู้ใช้” (สีแดง)
- Add/Edit User Drawer
  - Fields: Email (required)
  - Role selector: Admin/Sale/Operation/Employer/Representative
  - Conditional fields:
    - If Employer: Employer picker (required)
    - If Representative: Level (หัวหน้าทีม/ลูกทีม)
      - If ลูกทีม: เลือกหัวหน้าทีม (required)
  - Footer actions: Cancel / Save
- Confirm dialogs
  - Delete: แสดงผลกระทบ “ผู้ใช้จะเข้าไม่ได้อีก”
  - Reset: แจ้งว่าจะส่งอีเมล

### Interaction States
- Permission guard: ถ้าไม่ใช่ Admin ให้ redirect ไป /workspace พร้อมข้อความ “ไม่มีสิทธิ์เข้าหน้านี้”
- Table empty: แสดง empty state + ปุ่มเพิ่มผู้ใช้

---

## 4) หน้า Workspace (แสดงโมดูลตามบทบาท) (/workspace)
### Layout
- App shell แบบ 2 คอลัมน์ (เหมือน /admin/users)
- Content เป็น layout แบบ stacked sections

### Meta Information
- Title: Workspace | POA / Orders / แรงงาน
- Description: ดูข้อมูลตามสิทธิ์และบทบาท
- OG: title/description เท่ากับด้านบน

### Page Structure
1. Header: ชื่อหน้า + สรุปขอบเขตสิทธิ์ (เช่น “นายจ้าง: ABC จำกัด”, “ทีม: ทีม A (หัวหน้าทีม)”)
2. Filter bar
3. Tabs/Sections: แสดงเฉพาะโมดูลที่มีสิทธิ์ (POA, Orders, แรงงาน)
4. Data table/list

### Sections & Components
- Scope summary chip set
  - แสดง role ของผู้ใช้
  - แสดง employer/team scope ที่ระบบบังคับใช้ (อ่านอย่างเดียว)
- Filter bar (ถูกจำกัดตามสิทธิ์)
  - Employer dropdown (แสดงเฉพาะที่มีสิทธิ์ ถ้ามากกว่า 1)
  - Search input (เลขเอกสาร/คีย์หลัก)
  - Date range (ถ้าระบบข้อมูลรองรับ)
- Tabs/Sections (ขึ้นกับบทบาท)
  - POA: ตารางคำขอ POA (Representative/Operation/Admin)
  - Orders: ตาราง order (Employer: view only)
  - แรงงาน: ตารางแรงงาน (Employer: editable)
- Data table
  - Columns ขั้นต่ำ: ID/วันที่/นายจ้าง/ผู้รับผิดชอบ (ถ้ามี)
  - Row click → (ถ้ามีหน้า detail ในระบบหลัก) เปิดรายละเอียด; ถ้ายังไม่มี ให้แสดง read-only drawer

### Permission & Visibility Rules (ที่สะท้อนใน UI)
- Employer: ไม่เห็นโมดูล POA; เห็น Orders (view only) และแรงงาน (editable) ของนายจ้างที่ผูกไว้ และ dropdown นายจ้างเป็นค่าเดียว (locked)
- Representative หัวหน้าทีม: เห็นเฉพาะโมดูล POA และเห็นคำขอของตนเอง + ลูกทีม
- Representative ลูกทีม: เห็นเฉพาะโมดูล POA และเห็นเฉพาะคำขอของตนเอง
- Operation: เห็นโมดูล POA เพื่อดำเนินการ (และโมดูลอื่นตามขอบเขตงานที่กำหนด)
- UI ต้องไม่แสดงตัวเลือกนอกสิทธิ์ (เช่น tabs/filters/rows)
