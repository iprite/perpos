# Page Design Spec: ระบบแจ้งเตือนเอกสารแรงงานหมดอายุ (Desktop-first)

## Global Styles (ใช้ร่วมทุกหน้า)
- Layout system: Flexbox + CSS Grid (Grid สำหรับตาราง/การ์ด, Flex สำหรับจัดแนวนอนของ toolbar)
- Breakpoints (desktop-first):
  - ≥1280px: 2–3 คอลัมน์สำหรับ summary cards + ตารางเต็ม
  - 1024–1279px: summary cards 2 คอลัมน์, ตารางเต็ม
  - 768–1023px: ซ่อนคอลัมน์รองในตาราง, filter เป็น drawer
  - <768px: ใช้ stacked layout, ตารางเป็น list cards
- Design tokens
  - Background: #0B1220 (dark) หรือ #F7F8FA (light) (เลือกธีมเดียวทั้งระบบ)
  - Surface/Card: #111A2E / #FFFFFF
  - Primary: #2563EB, Hover: #1D4ED8
  - Success: #16A34A, Warning: #F59E0B, Danger: #DC2626
  - Text: #0F172A / #E5E7EB
  - Radius: 12px, Shadow: md
  - Typography: 14/16/20/24 (base 14, heading 20–24)
- Button states
  - Primary: filled, hover darken, disabled 40% opacity
  - Secondary: outline, hover surface tint
- Table style
  - Sticky header, row hover highlight, status pill (ปกติ/ใกล้หมดอายุ/หมดอายุ)

---

## 1) หน้าเข้าสู่ระบบ (/login)
### Layout
- Centered card (max-width 420px) บนพื้นหลังเรียบ
- ใช้ Flexbox จัดกึ่งกลางทั้งแนวตั้ง/แนวนอน

### Meta Information
- Title: เข้าสู่ระบบ | ระบบแจ้งเตือนเอกสารแรงงาน
- Description: เข้าสู่ระบบเพื่อดูรายการเอกสารใกล้หมดอายุและตั้งค่าการแจ้งเตือน
- OG: title/description เหมือนด้านบน

### Page Structure
1. Brand header (โลโก้/ชื่อระบบ)
2. Login form card
3. Help links

### Sections & Components
- Login Form
  - Email input (validation: required, email)
  - Password input (toggle show/hide)
  - Primary button: “เข้าสู่ระบบ”
  - Link: “ลืมรหัสผ่าน” (เปิดโหมด reset ภายในการ์ดเดียว)
- Reset Password (state ภายในหน้า)
  - Email input + ปุ่ม “ส่งลิงก์รีเซ็ต”
  - Success/Fail inline alert

---

## 2) แดชบอร์ดเอกสารใกล้หมดอายุ (/dashboard)
### Layout
- App shell: Top navigation bar + main content (container max 1280–1440px)
- Main content ใช้ Grid แบ่งส่วน: Summary (บน) + Table (ล่าง)

### Meta Information
- Title: แดชบอร์ด | เอกสารแรงงานใกล้หมดอายุ
- Description: ภาพรวมและรายการเอกสารใกล้หมดอายุ/หมดอายุ พร้อมประวัติการแจ้งเตือน
- OG: title/description เหมือนด้านบน

### Page Structure
1. Top Nav
2. Summary cards row
3. Filter + actions toolbar
4. Expiry table
5. Notification history panel (tab/accordion ในหน้าเดียว)

### Sections & Components
- Top Nav
  - Left: ชื่อระบบ
  - Center/Right: เมนู “แดชบอร์ด”, “ตั้งค่า”
  - User menu: ชื่อผู้ใช้, ออกจากระบบ
- Summary Cards (3–4 ใบ)
  - ใกล้หมดอายุ 30 วัน
  - ใกล้หมดอายุ 7 วัน
  - หมดอายุแล้ว
  - ต้องติดตามวันนี้
  - คลิกการ์ด = apply filter ในตาราง
- Toolbar
  - Filters: บริษัทนายจ้าง, ประเภทเอกสาร, ช่วงวัน (เช่น 90/60/30/14/7), สถานะ
  - Search: ชื่อแรงงาน/เลขเอกสาร
  - Actions: ปุ่ม “เพิ่ม/แก้ไขเอกสาร” (เปิด modal)
- Expiry Table
  - Columns (desktop): บริษัท, ชื่อแรงงาน, ประเภทเอกสาร, วันหมดอายุ, เหลืออีก(วัน), สถานะ, อัปเดตล่าสุด
  - Row click: เปิด drawer/side panel แสดงรายละเอียดเอกสาร + ปุ่มแก้ไข
  - Status pills: ปกติ/ใกล้หมดอายุ/หมดอายุ
- Add/Edit Document Modal
  - Fields: บริษัท, ชื่อแรงงาน, ประเภทเอกสาร, เลขเอกสาร(ถ้ามี), วันหมดอายุ
  - Save/Cancel + inline validation
- Notification History (Tab หรือ Accordion)
  - ตาราง log: เวลา, ช่องทาง, ผู้รับ, เรื่อง/ข้อความย่อ, ผลลัพธ์
  - Filter: สำเร็จ/ล้มเหลว, ช่วงเวลา

---

## 3) หน้าตั้งค่าการแจ้งเตือน (/settings/notifications)
### Layout
- Two-column settings (desktop)
  - Left: settings navigation (ภายในหน้า) แบบ vertical tabs
  - Right: settings form content
- Tablet ลงมา: left nav เป็น top tabs

### Meta Information
- Title: ตั้งค่าการแจ้งเตือน | เอกสารแรงงาน
- Description: กำหนดกติกา ช่องทาง ผู้รับ และแม่แบบข้อความสำหรับแจ้งเตือนเอกสารหมดอายุ
- OG: title/description เหมือนด้านบน

### Page Structure
1. Page header + breadcrumb (optional)
2. Settings tabs: Rules / Channels / Recipients / Templates / Test Send
3. Save bar (sticky bottom): ปุ่มบันทึก + สถานะ “ยังไม่บันทึก”

### Sections & Components
- Rules
  - ตาราง/ฟอร์มต่อ doc type: passport/visa/work permit
  - Lead days selector (multi-select chips): 90,60,30,14,7 (เพิ่ม/ลบได้)
  - Frequency radio: รายวัน / เฉพาะวันที่ครบกำหนด
  - Toggle enable
- Channels
  - Channel cards: Email, LINE
  - Fields ต่อช่องทาง (ขั้นต่ำ): enable toggle, sender/display name (ถ้ามี), credential placeholder (ไม่แสดงค่าจริง)
  - Note: แสดงข้อความเตือนเรื่องสิทธิ์/การเชื่อมต่อสำเร็จ
- Recipients
  - Matrix: (event/docType) x (role: นายจ้าง/ทีมขาย)
  - Recipient list per employer: รายชื่อผู้รับ, ช่องทาง, destination, enable toggle
- Templates
  - Template editor (textarea) + variable chips insert
  - Live preview panel แสดงตัวอย่างจากข้อมูลจำลอง
- Test Send
  - เลือกช่องทาง, ปลายทาง, templateKey
  - ปุ่ม “ส่งทดสอบ” + result toast/alert

### Interaction & Feedback
- ทุกการบันทึกแสดง toast “บันทึกสำเร็จ” หรือ error พร้อมสาเหตุ
- ฟอร์มทั้งหมดมี unsaved-changes guard ก่อนออกหน้า
