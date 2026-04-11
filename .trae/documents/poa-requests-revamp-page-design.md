# Page Design Spec: POA Requests Revamp (Desktop-first)

## Global Styles
- Layout system: Flexbox + CSS Grid (ตาราง/สรุปราคา)
- Max content width: 1200–1280px, content centered, left-aligned typography
- Spacing scale: 4/8/12/16/24/32
- Colors
  - Background: #F7F8FA
  - Surface (card): #FFFFFF
  - Primary: #2563EB
  - Success: #16A34A
  - Warning: #D97706
  - Danger: #DC2626
  - Border: #E5E7EB
  - Text: #111827 / Secondary: #6B7280
- Typography: 14px base, 12px helper, 16–20px section headers, 28–32px page title
- Buttons
  - Primary: solid primary, hover darker 5–8%
  - Secondary: white + border
  - Destructive: danger
  - Disabled: opacity 0.5 + no pointer
- Tables: sticky header, row hover, zebra optional
- Form states: inline error text (danger), required marker, field-level helper

---

## Page 1: รายการคำขอ POA

### Layout
- Two-row structure
  1) Top bar: title + primary actions
  2) Content: filter panel (collapsed by default) + table card
- Table uses CSS Grid for columns + sticky header

### Meta Information
- Title: "POA Requests"
- Description: "จัดการคำขอ POA, นำเข้า CSV และติดตามการชำระเงิน"
- OG: same as title/description

### Page Structure
1) Header row
2) Filter/search row
3) Table card + pagination

### Sections & Components
1. **Header**
   - Left: Page title “รายการคำขอ POA”
   - Right: Button “สร้างคำขอใหม่”, Secondary button “นำเข้า CSV”

2. **Search & Filters (collapsible)**
   - Search input: placeholder “ค้นหาเลขคำขอ/บริษัท/ตัวแทน”
   - Filters: Status dropdown, Date range
   - Actions: “ล้างค่า”, “ค้นหา”

3. **Import CSV Modal**
   - Step 1: Upload area (drag/drop)
   - Step 2: Header validation result
     - Show required/optional columns list
     - Mapping UI (ถ้าหัวคอลัมน์ไม่ตรง ให้เลือก map)
   - Step 3: Preview table (first 20 rows)
     - Inline highlight invalid cells
     - Summary: total rows, valid rows, error rows
   - Footer: “ยกเลิก”, “นำเข้า” (disabled ถ้ามี error แบบ blocking)

4. **Requests Table**
   - Columns (ขั้นต่ำ): เลขคำขอ, บริษัท, ตัวแทน, จำนวนคนงาน, ยอดรวม, สถานะ, อัปเดตล่าสุด, Action (ดูรายละเอียด)
   - Row click → ไปหน้ารายละเอียด

5. **Pagination**
   - Page size selector + next/prev

### Responsive behavior
- < 1024px: filter panel stack เป็น 2 แถว, table ให้ horizontal scroll

---

## Page 2: สร้าง/แก้ไขคำขอ POA

### Layout
- Single column form (max 860px) + right-side summary card (desktop)
- Use CSS Grid 2 columns on desktop, 1 column on smaller screens

### Meta Information
- Title: "Create POA Request"
- Description: "สร้างคำขอ POA และเลือก operations"

### Page Structure
1) Breadcrumbs (optional) → “รายการคำขอ POA / สร้างคำขอใหม่”
2) Form card
3) Summary card

### Sections & Components
1. **Form: ข้อมูลคำขอ**
   - Company name (text)
   - (ถ้ามีในระบบเดิม) เลขอ้างอิง/หมายเหตุ

2. **Form: เลือก Operations**
   - Checkbox list หรือ multi-select
   - Each row show: operation name + unit price (ถ้ากำหนดได้ในขั้นนี้)

3. **Validation banner**
   - แสดงข้อที่ต้องทำก่อน “ยืนยันส่ง” (เช่น เลือก operation อย่างน้อย 1)

4. **Actions**
   - Primary: “บันทึก”
   - Secondary: “บันทึกร่าง” (ถ้าแยกจากบันทึก) / “ยกเลิก”

---

## Page 3: รายละเอียดคำขอ POA

### Layout
- Dashboard-style
  - Top summary bar
  - Main content: left (tabs/sections) + right (pricing + status)
- Use accordions for large sections

### Meta Information
- Title: "POA Request Detail"
- Description: "จัดการคนงาน, ตัวแทน, ราคา, ชำระเงิน และเอกสาร POA"

### Page Structure
1) Header: title + status badge + primary actions
2) Two-column content
   - Left: Representative, Workers, Payments
   - Right: Pricing summary, Document panel

### Sections & Components
1. **Header / Summary**
   - Title: “คำขอ POA #<request_no>”
   - Status badge
   - Actions:
     - “อัปโหลด CSV” (ถ้ายังไม่มีคนงานหรืออนุญาตนำเข้าเพิ่ม)
     - “สร้าง POA PDF” (disabled ถ้าเงื่อนไขไม่ครบ)
     - “ดาวน์โหลด PDF ล่าสุด” (ถ้ามี)

2. **Representative Card**
   - Searchable select (typeahead)
   - Display selected rep details (name/phone/email)
   - Save indicator (“บันทึกแล้ว” / “มีการเปลี่ยนแปลง”)

3. **Workers Section**
   - Toolbar: search within workers, filter invalid-only
   - Table columns (ขั้นต่ำสำหรับเอกสาร): ชื่อ-นามสกุล, Passport, Nationality, DOB, Validation status
   - Inline edit drawer/modal สำหรับแก้ไขฟิลด์จำเป็น
   - Empty state: ปุ่ม “นำเข้า CSV”

4. **Pricing Summary (Right Column Card)**
   - Per-operation breakdown table
     - Operation name, Unit price/worker, Worker count, Total
   - Grand total
   - Hint text: “คำนวณจากจำนวนคนงานที่ผูกกับคำขอ”

5. **Payments by Operation (Accordion list)**
   - Accordion item per operation
     - Header: operation name + payment_status badge + total due
     - Body:
       - Payment form: amount, paid date, reference no
       - Slip uploader: accept image/pdf, show filename + preview link
       - Payment history list (latest first)
       - Actions: “บันทึกการชำระเงิน”, “ยืนยันแล้ว” (ถ้ามี role/สิทธิ์ในระบบเดิม)

6. **POA PDF Panel (Right Column Card)**
   - Preconditions checklist
     - มี representative
     - มีคนงานอย่างน้อย 1
     - มี operation ที่เลือก
     - (ถ้าจำเป็น) มีการชำระเงินครบ
   - Generate button
   - Preview (เปิดใน new tab หรือ embedded PDF viewer)
   - Version info + timestamp

### Interaction states
- Auto-save cues: show “กำลังบันทึก…” / “บันทึกแล้ว” หลังแก้ไข representative/worker/payment
- Error handling
  - CSV: show downloadable error report (CSV/JSON) หรือ copyable list
  - Upload slip: retry + progress bar
- Confirm dialogs
  - ลบ worker
  - สร้าง PDF ใหม่ (จะเพิ่มเวอร์ชัน)

### Responsive behavior
- < 1024px: เปลี่ยนเป็น single column, pricing/doc panels ย้ายลงท้ายหน้า, payments accordion เต็มความกว้าง
